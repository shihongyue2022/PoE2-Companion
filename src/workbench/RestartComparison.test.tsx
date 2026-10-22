import type { ComponentProps } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { indexPatch } from '../../packages/engine/src/indexPatch';
import { indexPrices } from '../../packages/optimizer/src/cost';
import modsFile from '../../data/patches/0.5.0/mods.json';
import basesFile from '../../data/patches/0.5.0/base_items.json';
import pricesFile from '../../data/patches/0.5.0/prices.json';
import { listDesecrated, listMods, listPerfectEssences } from '../lib/engine';
import type { SolveResult } from '../lib/solve';
import RestartComparison from './RestartComparison';
import { computeWorkbench } from './compute';
import { EXAMPLE_AMULET, EXAMPLE_RING } from './itemImport';
import { DEFAULT_OPTIONS } from './model';

vi.mock('./compute', () => ({ computeWorkbench: vi.fn() }));
const engine = { data: indexPatch(modsFile as never, basesFile as never), prices: indexPrices(pricesFile) };
const ordinary = listMods(engine.data, 'Rings');
const mods = new Map([
  ...ordinary.prefixes, ...ordinary.suffixes,
  ...listPerfectEssences(engine.data, 'Rings'), ...listDesecrated(engine.data, 'Rings'),
].map((mod) => [mod.id, mod]));
type Props = ComponentProps<typeof RestartComparison>;
const title = '同组合全部 T1';
function props(changes: Partial<Props> = {}): Props {
  return {
    engine, mods, baseId: 'Rings', options: DEFAULT_OPTIONS, overrides: {}, effort: 5000,
    baseCost: 999, playOut: false, disabled: false, onBusyChange: vi.fn(),
    original: { kind: 'exact', cost: 100, assumedOdds: false, materials: [] },
    candidate: { id: 't1', title, description: '', improvementCount: 2,
      targets: [{ modId: 'Rings/IncreasedMana', tierDisplay: 1 }, { modId: 'Rings/ItemFoundRarityIncrease', tierDisplay: 1 }],
      preservedFractureIds: ['Rings/ItemFoundRarityIncrease'], droppedCurrentLabels: [],
      blockReason: '原装备物等不足，且已有破裂限制。' }, ...changes,
  };
}
function solved(cost = 40): SolveResult {
  return { kind: 'item', plan: { frontier: [], plansEvaluated: 0, assumedOdds: false },
    markov: { applicable: true, feasible: true, converged: true, expectedCost: cost,
      bound: 'exact', assumedOdds: false, nodes: [], edges: [] } };
}
function deferred() {
  let resolve: (result: SolveResult) => void = () => {};
  const promise = new Promise<SolveResult>((done) => { resolve = done; });
  return { promise, resolve, cancel: vi.fn() };
}
const whiteRing = 'Item Class: Rings\nRarity: Normal\nRuby Ring\n--------\nItem Level: 82\n--------';

describe('replacement-base comparison from real pasted equipment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reassesses a formerly blocked goal without granting the new base any old fractures', async () => {
    const user = userEvent.setup();
    vi.mocked(computeWorkbench).mockReturnValue({ promise: Promise.resolve(solved()), cancel: vi.fn() });
    const input = props();
    render(<RestartComparison {...input} />);
    await user.click(screen.getByText('比较另一个底材'));
    await user.type(screen.getByLabelText(`${title} 替代底材文本`), EXAMPLE_RING);
    await user.type(screen.getByLabelText(`${title} 替代底材买价`), '20');
    await user.click(screen.getByRole('button', { name: '计算更换底材成本' }));
    expect(await screen.findByText('更换底材的期望追加成本较低')).toBeVisible();
    expect(screen.getByText('更换底材的净期望追加成本：60 Ex')).toBeVisible();
    const request = vi.mocked(computeWorkbench).mock.calls[0]![0];
    expect(request.kind).toBe('item');
    if (request.kind !== 'item') throw new Error('Expected an actual held-item solve');
    expect(request.item.level).toBe(82);
    expect([...request.item.prefixes, ...request.item.suffixes].every((entry) => !entry.fractured)).toBe(true);
    expect(request.item.suffixes.some((entry) => entry.modId === 'Rings/ItemFoundRarityIncrease')).toBe(false);
    expect(request.targets).toEqual(input.candidate.targets);
    const price = screen.getByLabelText(`${title} 替代底材买价`);
    await user.clear(price); await user.type(price, '70');
    expect(screen.getByText('继续加工的期望追加成本较低')).toBeVisible();
    expect(screen.getByText('更换底材的净期望追加成本：110 Ex')).toBeVisible();
    expect(computeWorkbench).toHaveBeenCalledTimes(1);
    expect(input.onBusyChange).toHaveBeenCalledWith(true);
    expect(input.onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it('requires an explicit white-base quote and uses it for later restarts, then invalidates on price changes', async () => {
    const user = userEvent.setup();
    vi.mocked(computeWorkbench).mockReturnValue({ promise: Promise.resolve(solved()), cancel: vi.fn() });
    render(<RestartComparison {...props()} />);
    await user.click(screen.getByText('比较另一个底材'));
    await user.type(screen.getByLabelText(`${title} 替代底材文本`), whiteRing);
    const calculate = screen.getByRole('button', { name: '计算更换底材成本' });
    expect(calculate).toBeDisabled();
    const price = screen.getByLabelText(`${title} 替代底材买价`);
    await user.type(price, '25');
    await user.click(calculate);
    expect(await screen.findByText('更换底材的净期望追加成本：65 Ex')).toBeVisible();
    const request = vi.mocked(computeWorkbench).mock.calls[0]![0];
    expect(request).toMatchObject({ kind: 'lab', baseCost: 25, from: { baseId: 'Rings', level: 82 } });
    await user.clear(price);
    await user.type(price, '30');
    expect(screen.queryByText('更换底材的净期望追加成本：65 Ex')).not.toBeInTheDocument();
    expect(computeWorkbench).toHaveBeenCalledTimes(1);
    await user.click(calculate);
    expect(await screen.findByText('更换底材的净期望追加成本：70 Ex')).toBeVisible();
    expect(vi.mocked(computeWorkbench).mock.calls[1]![0]).toMatchObject({ kind: 'lab', baseCost: 30 });
  });

  it('rejects another category, unknown bases, unparsed modifiers and corrupted equipment', async () => {
    const user = userEvent.setup();
    render(<RestartComparison {...props()} />);
    await user.click(screen.getByText('比较另一个底材'));
    const text = screen.getByLabelText(`${title} 替代底材文本`);
    for (const sample of [EXAMPLE_AMULET, EXAMPLE_RING.replace('紅玉戒指', '不存在的戒指'),
      EXAMPLE_RING + '\n未知神秘属性+999', EXAMPLE_RING + '\n--------\n已污染']) {
      await user.clear(text); await user.type(text, sample);
      expect(screen.getByRole('button', { name: '计算更换底材成本' })).toBeDisabled();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    }
    expect(computeWorkbench).not.toHaveBeenCalled();
  });

  it('cancels a worker and ignores its late result after stopping or changing the goal context', async () => {
    const user = userEvent.setup();
    const job = deferred(); vi.mocked(computeWorkbench).mockReturnValue(job);
    const input = props();
    const { rerender } = render(<RestartComparison {...input} />);
    await user.click(screen.getByText('比较另一个底材'));
    await user.type(screen.getByLabelText(`${title} 替代底材文本`), EXAMPLE_RING);
    await user.click(screen.getByRole('button', { name: '计算更换底材成本' }));
    await user.click(screen.getByRole('button', { name: '停止替代底材计算' }));
    expect(job.cancel).toHaveBeenCalledTimes(1);
    await act(async () => { job.resolve(solved()); await job.promise; });
    expect(screen.queryByText('替代底材的后续制作成本')).not.toBeInTheDocument();
    const next = deferred(); vi.mocked(computeWorkbench).mockReturnValue(next);
    await user.click(screen.getByRole('button', { name: '计算更换底材成本' }));
    rerender(<RestartComparison {...input} overrides={{ exalt: 99 }} />);
    expect(next.cancel).toHaveBeenCalledTimes(1);
    await act(async () => { next.resolve(solved()); await next.promise; });
    expect(screen.queryByText('替代底材的后续制作成本')).not.toBeInTheDocument();
    expect(input.onBusyChange).toHaveBeenLastCalledWith(false);
  });
});
