import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { indexPatch } from '../../packages/engine/src/indexPatch';
import { indexPrices } from '../../packages/optimizer/src/cost';
import modsFile from '../../data/patches/0.5.0/mods.json';
import basesFile from '../../data/patches/0.5.0/base_items.json';
import pricesFile from '../../data/patches/0.5.0/prices.json';
import gearStats from '../../data/trade/gear-stats.json';
import { listDesecrated, listMods, listPerfectEssences, type ExistingItem } from '../lib/engine';
import type { GearTrade } from '../lib/gearTrade';
import type { SolveResult } from '../lib/solve';
import CraftAdvisor from './CraftAdvisor';
import { computeWorkbench } from './compute';
import { BREACH_RING_SAMPLE } from './fixtures/breachRing';
import { parseWorkbenchItem } from './itemImport';
import { DEFAULT_OPTIONS } from './model';

vi.mock('./compute', () => ({ computeWorkbench: vi.fn() }));

const engine = { data: indexPatch(modsFile as never, basesFile as never), prices: indexPrices(pricesFile) };
const ordinary = listMods(engine.data, 'Rings');
const mods = new Map([
  ...ordinary.prefixes, ...ordinary.suffixes,
  ...listPerfectEssences(engine.data, 'Rings'), ...listDesecrated(engine.data, 'Rings'),
].map((mod) => [mod.id, mod]));
const imported = parseWorkbenchItem(engine.data, BREACH_RING_SAMPLE)!;
const item: ExistingItem = {
  baseId: imported.baseId!, level: imported.level!, rarity: 'rare',
  prefixes: imported.prefixes, suffixes: imported.suffixes,
};
type AdvisorProps = ComponentProps<typeof CraftAdvisor>;

function props(overrides: Partial<AdvisorProps> = {}): AdvisorProps {
  return {
    engine, mods, item, targets: [...item.prefixes, ...item.suffixes], baseName: 'Breach Ring',
    options: DEFAULT_OPTIONS, overrides: {}, restriction: null, league: 'Forbidden Rites',
    tradeData: gearStats as unknown as GearTrade, effort: 5_000, baseCost: 0, playOut: false,
    currentResult: null, mainSolving: false, onBusyChange: vi.fn(), onAdopt: vi.fn(), ...overrides,
  };
}

function exactResult(): SolveResult {
  return {
    kind: 'item', plan: { frontier: [], plansEvaluated: 0, assumedOdds: false },
    markov: {
      applicable: true, feasible: true, converged: true, expectedCost: 500, bound: 'exact',
      assumedOdds: false, nodes: [{
        key: 'start', present: [], blocked: [], junkPrefixes: 2, junkSuffixes: 1,
        rarity: 'rare', isStart: true, isGoal: false, depth: 1, visitRate: 1,
        expectedCost: 500, action: 'Chaos',
      }], edges: [],
    },
  };
}

function deferredJob() {
  let resolve: (result: SolveResult) => void = () => {};
  const promise = new Promise<SolveResult>((done) => { resolve = done; });
  return { promise, resolve, cancel: vi.fn() };
}

function candidate(container: HTMLElement, id = 'repair'): HTMLElement {
  const element = container.querySelector(`[data-candidate-id="${id}"]`);
  expect(element).not.toBeNull();
  return element as HTMLElement;
}

function renderAdvisor(element: React.ReactElement) {
  const view = render(element);
  const summary = view.container.querySelector('.wb-advisor > details.wb-fold > summary');
  if (summary) fireEvent.click(summary);
  return view;
}

describe('crafting advisor decisions on the actual imported ring', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows the level-79 ceiling and a level-82 replacement link without computing impossible T1 goals', () => {
    const { container } = renderAdvisor(<CraftAdvisor {...props()} />);
    const cold = container.querySelector('[data-ceiling-id="Rings/ColdResistance"]') as HTMLElement;
    expect(within(cold).getByText('T3')).toBeInTheDocument();
    expect(within(cold).getByText('T2')).toBeInTheDocument();
    expect(within(cold).getByText('T1 需物等 82')).toBeInTheDocument();
    const replacement = screen.getByRole('link', { name: '查物等 82+ 的同底座底材 ↗' });
    const query = JSON.parse(new URL(replacement.getAttribute('href')!).searchParams.get('q')!);
    expect(query.query.type).toBe('Breach Ring');
    expect(query.query.filters.misc_filters.filters.ilvl.min).toBe(82);
    const t1 = within(candidate(container, 't1'));
    expect(t1.getByText('先解决限制')).toBeInTheDocument();
    expect(t1.queryByRole('button', { name: '单独评估此方案' })).not.toBeInTheDocument();
    expect(computeWorkbench).not.toHaveBeenCalled();
  });

  it('compares one protected improvement with budget and manual market prices, then adopts the computed policy', async () => {
    const user = userEvent.setup();
    const input = props();
    const result = exactResult();
    vi.mocked(computeWorkbench).mockReturnValue({ promise: Promise.resolve(result), cancel: vi.fn() });
    const { container } = renderAdvisor(<CraftAdvisor {...input} />);
    const repair = within(candidate(container));
    await user.selectOptions(screen.getByRole('combobox', { name: '追加材料预算档位' }), '100');
    await user.click(repair.getByRole('button', { name: '单独评估此方案' }));
    expect(await repair.findByText('预计成本超过预算')).toBeVisible();
    expect(repair.getByText('500 Ex')).toBeVisible();
    expect(repair.getByText('建议下一步：混沌石')).toBeVisible();
    expect(computeWorkbench).toHaveBeenCalledTimes(1);
    const request = vi.mocked(computeWorkbench).mock.calls[0]![0];
    expect(request.targets).toContainEqual({ modId: 'Rings/IncreasedMana', tierDisplay: 1 });
    expect(request.targets).toContainEqual({ modId: 'Rings/ItemFoundRarityIncrease', tierDisplay: 1 });
    expect(request.targets.filter((target) => target.modId === 'Rings/ItemFoundRarityIncrease')).toHaveLength(1);

    await user.selectOptions(screen.getByRole('combobox', { name: '追加材料预算档位' }), '1000');
    expect(repair.getByText('可考虑继续制作')).toBeVisible();
    const quote = repair.getByRole('spinbutton', { name: '先改善一项现有属性 成品参考价' });
    expect(quote).toHaveValue(null);
    await user.type(quote, '300');
    expect(repair.getByText('可考虑继续制作')).toBeVisible();
    await user.type(screen.getByRole('spinbutton', { name: '建议当前装备可售参考价' }), '250');
    expect(repair.getByText('优先比较直接购买成品')).toBeVisible();
    expect(repair.getByText(/按你手动填写的价格.*750 Ex/)).toBeVisible();
    expect(computeWorkbench).toHaveBeenCalledTimes(1);

    await user.click(repair.getByRole('button', { name: '查看通货顺序' }));
    expect(input.onAdopt).toHaveBeenCalledWith(request.targets, result, expect.any(Number));
    expect(input.onBusyChange).toHaveBeenCalledWith(true);
    expect(input.onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it('cancels an active worker and discards a late result after the player stops evaluation', async () => {
    const user = userEvent.setup();
    const job = deferredJob();
    vi.mocked(computeWorkbench).mockReturnValue(job);
    const { container } = renderAdvisor(<CraftAdvisor {...props()} />);
    await user.click(within(candidate(container)).getByRole('button', { name: '单独评估此方案' }));
    expect(screen.getByRole('button', { name: '停止评估' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '停止评估' }));
    expect(job.cancel).toHaveBeenCalledTimes(1);
    expect(screen.getByText('已停止评估，已完成的结果仍可查看。')).toBeVisible();
    await act(async () => { job.resolve(exactResult()); await job.promise; });
    expect(screen.queryByText('500 Ex', { selector: '.wb-advisor-cost strong' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看通货顺序' })).not.toBeInTheDocument();
    expect(computeWorkbench).toHaveBeenCalledTimes(1);
  });

  it('cancels and forgets an old item snapshot when the imported item changes during evaluation', async () => {
    const user = userEvent.setup();
    const input = props();
    const job = deferredJob();
    vi.mocked(computeWorkbench).mockReturnValue(job);
    const { container, rerender } = renderAdvisor(<CraftAdvisor {...input} />);
    await user.click(within(candidate(container)).getByRole('button', { name: '单独评估此方案' }));
    rerender(<CraftAdvisor {...input} item={{ ...item, level: 82 }} />);
    expect(job.cancel).toHaveBeenCalledTimes(1);
    await act(async () => { job.resolve(exactResult()); await job.promise; });
    expect(screen.queryByText('500 Ex', { selector: '.wb-advisor-cost strong' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看通货顺序' })).not.toBeInTheDocument();
    expect(screen.queryByText('正在评估：先改善一项现有属性')).not.toBeInTheDocument();
    expect(input.onBusyChange).toHaveBeenLastCalledWith(false);
    expect(computeWorkbench).toHaveBeenCalledTimes(1);
  });

  it('distinguishes an unsupported cost model from an impossible target', async () => {
    const user = userEvent.setup();
    const result = exactResult();
    vi.mocked(computeWorkbench).mockReturnValue({
      promise: Promise.resolve({
        ...result,
        markov: { ...result.markov, applicable: false, feasible: false, expectedCost: Infinity },
      }), cancel: vi.fn(),
    });
    const { container } = renderAdvisor(<CraftAdvisor {...props()} />);
    const repair = within(candidate(container));
    await user.click(repair.getByRole('button', { name: '单独评估此方案' }));
    expect(await repair.findByText('当前模型暂不支持此方案')).toBeVisible();
    expect(repair.getByText(/无法据此判断目标不可达/)).toBeVisible();
    expect(repair.queryByText('当前条件不可达')).not.toBeInTheDocument();
    expect(repair.queryByText('当前条件无法达到目标')).not.toBeInTheDocument();
    expect(repair.queryByText('500 Ex')).not.toBeInTheDocument();
  });

  it('never starts a solver for an item blocked by its import restriction', async () => {
    const user = userEvent.setup();
    const { container } = renderAdvisor(<CraftAdvisor {...props({ restriction: '装备已污染，不能继续制作。' })} />);
    const evaluate = screen.getByRole('button', { name: '评估加工成本' });
    expect(evaluate).toBeDisabled();
    expect(container.querySelectorAll('.wb-advisor-candidate.blocked').length).toBeGreaterThan(0);
    await user.click(evaluate);
    await waitFor(() => expect(computeWorkbench).not.toHaveBeenCalled());
  });
});
