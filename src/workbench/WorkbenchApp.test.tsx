import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { indexPatch } from '../../packages/engine/src/indexPatch';
import { indexPrices } from '../../packages/optimizer/src/cost';
import modsFile from '../../data/patches/0.5.0/mods.json';
import basesFile from '../../data/patches/0.5.0/base_items.json';
import pricesFile from '../../data/patches/0.5.0/prices.json';
import type { ExistingItem, TargetInput } from '../lib/engine';
import type { SolveResult } from '../lib/solve';
import { computeWorkbench } from './compute';
import { DEFAULT_OPTIONS } from './model';
import { BOOTS_SAMPLE } from './fixtures/fullGear';
import WorkbenchApp from './WorkbenchApp';

vi.mock('../lib/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/engine')>();
  return { ...actual, loadEngine: vi.fn(async () => engine) };
});
vi.mock('./market', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./market')>();
  return {
    ...actual,
    fetchTradeLeagues: vi.fn(async () => [{ id: 'Forbidden Rites', label: 'Forbidden Rites' }]),
    loadGearTrade: vi.fn(async () => ({ rows: [], mods: {} })),
  };
});
// Workbench uses its own worker protocol, separate from the upstream test Worker stand-in.
vi.mock('./compute', () => ({ computeWorkbench: vi.fn() }));

const engine = { data: indexPatch(modsFile as never, basesFile as never), prices: indexPrices(pricesFile) };
const STORAGE_KEY = 'poe2-workbench-v1';
const ESSENCE_ID = 'Rings/Essence_ColdResistance';
const ORDINARY_ID = 'Rings/ColdResistance';
const held: ExistingItem = {
  baseId: 'Rings', level: 82, rarity: 'rare',
  prefixes: [{ modId: 'Rings/IncreasedLife', tierDisplay: 3 }],
  suffixes: [{ modId: 'Rings/FireResistance', tierDisplay: 3 }],
};

function restore(targets: TargetInput[] = []) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    item: held, baseName: 'Amethyst Ring', targets, raw: '', league: 'Forbidden Rites', overrides: {},
    options: { ...DEFAULT_OPTIONS, essences: true }, baseCost: 0, reviewRequired: false,
  }));
}

function savedSession(): { item: ExistingItem; targets: TargetInput[] } {
  return JSON.parse(localStorage.getItem(STORAGE_KEY)!);
}

async function ready() {
  const view = render(<WorkbenchApp />);
  await waitFor(() => expect(screen.getByRole('button', { name: /载入目标示例/ })).toBeEnabled());
  return view;
}

describe('workbench target-source regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('routes copied armour into all-equipment pricing without changing the crafting item or its source text', async () => {
    const user = userEvent.setup();
    restore([{ modId: ORDINARY_ID, tierDisplay: 3 }]);
    const { container } = await ready();
    const before = localStorage.getItem(STORAGE_KEY);
    await user.click(screen.getByRole('button', { name: /粘贴游戏装备/ }));
    await user.click(screen.getByRole('textbox', { name: '游戏装备文本' }));
    await user.paste(BOOTS_SAMPLE);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    await user.click(screen.getByRole('button', { name: /识别并导入/ }));
    expect(await screen.findByText('Dusk Trail')).toBeVisible();
    expect(container.querySelector('.wb-layout')).toHaveClass('is-equipment');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(computeWorkbench).not.toHaveBeenCalled();
  });

  it('opens the full character inventory independently from the crafting session', async () => {
    const user = userEvent.setup();
    restore();
    await ready();
    const before = localStorage.getItem(STORAGE_KEY);
    const nav = screen.getByRole('navigation', { name: '工作区域' });
    await user.click(within(nav).getByRole('button', { name: '角色装备' }));
    expect(screen.getByRole('region', { name: '角色全身装备' })).toBeVisible();
    expect(screen.getByRole('button', { name: '左戒指：未装备' })).toBeVisible();
    expect(screen.getByRole('button', { name: '右戒指：未装备' })).toBeVisible();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it('explains a restored impossible Essence target and recovers to the same ordinary range without changing the item', async () => {
    const user = userEvent.setup();
    restore([{ modId: ESSENCE_ID, tierDisplay: 1 }]);
    const { container } = await ready();
    const target = container.querySelector(`.wb-targets [data-mod-id="${ESSENCE_ID}"]`)!;
    expect(within(target as HTMLElement).getByText('普通精华专属')).toBeVisible();
    expect(within(target as HTMLElement).getByText(/普通精华只能用于魔法（蓝色）装备/)).toBeVisible();
    expect(screen.getByRole('button', { name: '计算制作策略' })).toBeDisabled();
    expect(computeWorkbench).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '改选普通词缀 · T3 · 31–35' }));
    await waitFor(() => expect(savedSession().targets).toEqual([{ modId: ORDINARY_ID, tierDisplay: 3 }]));
    expect(savedSession().item).toEqual(held);
    expect(container.querySelector(`.wb-targets [data-mod-id="${ESSENCE_ID}"]`)).toBeNull();
    const replacement = container.querySelector(`.wb-targets [data-mod-id="${ORDINARY_ID}"]`)!;
    expect(within(replacement as HTMLElement).getByText('普通词缀')).toBeVisible();
    expect(within(replacement as HTMLElement).getByRole('combobox')).toHaveValue('3');
    expect(within(replacement as HTMLElement).getByRole('option', { name: 'T3 · 31–35' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '计算制作策略' })).toBeEnabled();
    expect(computeWorkbench).not.toHaveBeenCalled();
  });

  it('starts the library with ordinary sources so identical Essence text is not selected by accident', async () => {
    restore();
    const { container } = await ready();
    expect(screen.getByRole('combobox', { name: '词缀来源' })).toHaveValue('normal');
    expect(container.querySelector(`.wb-pool-row[data-mod-id="${ORDINARY_ID}"]`)).not.toBeNull();
    expect(container.querySelector('.wb-pool-row .source-essence')).toBeNull();
    expect(container.querySelector('.wb-pool-row .source-perfect')).toBeNull();
    expect(container.querySelector('.wb-pool-row .source-desecrated')).toBeNull();
  });

  it('blocks impossible Essence targets on a Rare while allowing an existing Essence modifier to be modeled', async () => {
    const user = userEvent.setup();
    restore();
    const { container } = await ready();
    await user.selectOptions(screen.getByRole('combobox', { name: '词缀来源' }), 'essence');
    const rows = container.querySelectorAll('.wb-pool-row');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(within(row as HTMLElement).getByRole('button')).toBeDisabled();
    const cold = container.querySelector(`.wb-pool-row[data-mod-id="${ESSENCE_ID}"]`)!;
    expect(within(cold as HTMLElement).getByText(/普通精华只能用于魔法/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: '添加到当前' }));
    const add = within(cold as HTMLElement).getByRole('button');
    expect(add).toBeEnabled();
    await user.click(add);
    await waitFor(() => expect(savedSession().item.suffixes).toContainEqual({ modId: ESSENCE_ID, tierDisplay: 1 }));
    expect(savedSession().targets).toEqual([]);
    const current = container.querySelector(`.wb-current-mods [data-mod-id="${ESSENCE_ID}"]`)!;
    expect(within(current as HTMLElement).getByText('普通精华专属')).toBeVisible();
  });

  it('renders a failed converged sentinel as unreachable and keeps the English diagnostic collapsed', async () => {
    const user = userEvent.setup();
    const reason = 'Rings/Essence_ColdResistance can only be added by a regular Essence, which needs a Magic item — this one is already Rare, so no route reaches it (a Perfect Essence works on a Rare, a regular one does not)';
    const result: SolveResult = {
      kind: 'item', plan: { frontier: [], plansEvaluated: 0, assumedOdds: false },
      markov: {
        applicable: true, feasible: false, converged: true, expectedCost: Infinity, bound: 'exact',
        assumedOdds: false, reason, nodes: [], edges: [],
      },
    };
    vi.mocked(computeWorkbench).mockReturnValue({ promise: Promise.resolve(result), cancel: vi.fn() });
    restore([{ modId: ORDINARY_ID, tierDisplay: 3 }]);
    const { container } = await ready();
    const calculate = screen.getByRole('button', { name: '计算制作策略' });
    expect(calculate).toBeEnabled();
    await user.click(calculate);

    expect(await screen.findByText('当前状态不可达')).toBeVisible();
    expect(screen.getByText('当前条件下无法达到所选目标')).toBeVisible();
    expect(screen.queryByText(/已收敛/)).not.toBeInTheDocument();
    expect(within(container.querySelector('.wb-results') as HTMLElement).getByText(/只能通过普通精华添加；普通精华需要魔法装备/)).toBeVisible();
    const diagnostic = container.querySelector('.wb-diagnostic')!;
    expect(diagnostic).not.toHaveAttribute('open');
    expect(within(diagnostic as HTMLElement).getByText(reason)).not.toBeVisible();
    expect(computeWorkbench).toHaveBeenCalledTimes(1);
    expect(vi.mocked(computeWorkbench).mock.calls[0]![0]).toMatchObject({ kind: 'item', item: held, targets: [{ modId: ORDINARY_ID, tierDisplay: 3 }] });
  });
});
