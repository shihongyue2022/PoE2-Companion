import { describe, expect, it } from 'vitest';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch.ts';
import { loadPrices } from '../../packages/optimizer/src/loadPrices.ts';
import type { EngineMarkovResult, EnginePolicyNode } from '../lib/engineTypes.ts';
import { runSolve, type SolveResult } from '../lib/solve.ts';
import { craftCostEvidence, judgeCraftCost, type CraftCostEvidence } from './craftAdvice.ts';

const solved: EngineMarkovResult = {
  applicable: true, feasible: true, expectedCost: 60, converged: true,
  bound: 'exact', assumedOdds: false, nodes: [], edges: [],
};
const start: EnginePolicyNode = {
  key: 'start', present: [], blocked: [], junkPrefixes: 0, junkSuffixes: 0, rarity: 'rare',
  isStart: true, isGoal: false, depth: 1, visitRate: 1, expectedCost: 60, action: 'Exalt',
};
function result(changes: Partial<EngineMarkovResult> = {}): SolveResult {
  return {
    kind: 'item', plan: { frontier: [], plansEvaluated: 0, assumedOdds: false },
    markov: { ...solved, ...changes },
  };
}
function evidence(changes: Partial<CraftCostEvidence> = {}): CraftCostEvidence {
  return { kind: 'exact', cost: 60, assumedOdds: false, materials: [], ...changes };
}
function replay(changes: Partial<NonNullable<EngineMarkovResult['replay']>> = {}): NonNullable<EngineMarkovResult['replay']> {
  return {
    runs: 200, meanCost: 61, stdErr: 2, seen: [], costPercentiles: Array.from({ length: 101 }, (_, i) => i * 2),
    movesPerCraft: { exalt: 10 }, spendByMove: [{ label: 'Exalt', count: 10, spent: 10 }], ...changes,
  };
}

describe('crafting cost evidence', () => {
  it('rejects failed converged sentinels and keeps unsupported separate from unreachable', () => {
    expect(craftCostEvidence(result({ applicable: false, feasible: false, expectedCost: Infinity })))
      .toMatchObject({ kind: 'unsupported', materials: [] });
    const failed = craftCostEvidence(result({ feasible: false, expectedCost: Infinity }));
    expect(failed).toMatchObject({ kind: 'unreachable', materials: [] });
    expect(failed.cost).toBeUndefined();
    expect(failed.p95).toBeUndefined();
    expect(craftCostEvidence(result({ applicable: false, feasible: false, expectedCost: Infinity, stoppedEarly: true })).kind)
      .toBe('incomplete');
  });

  it('only certifies a finite, nonnegative, converged and uninterrupted exact result', () => {
    expect(craftCostEvidence(result())).toMatchObject({ kind: 'exact', cost: 60 });
    for (const expectedCost of [NaN, Infinity, -Infinity, -1]) {
      const found = craftCostEvidence(result({ expectedCost }));
      expect(found.kind).toBe('incomplete');
      expect(found.cost).toBeUndefined();
    }
    for (const change of [{ converged: false }, { stoppedEarly: true as const }]) {
      const found = craftCostEvidence(result(change));
      expect(found.kind).toBe('incomplete');
      expect(found.cost).toBeUndefined();
    }
  });

  it('retains a partial result only as the declared lower or upper bound', () => {
    for (const bound of ['lower', 'upper'] as const) {
      const partial = craftCostEvidence(result({ bound, converged: false, stoppedEarly: true, expectedCost: 45 }));
      expect(partial).toMatchObject({ kind: bound, cost: 45 });
      expect(partial.kind).not.toBe('exact');
    }
    expect(craftCostEvidence(result({ bound: 'upper', withoutBones: true })).kind).toBe('upper');
  });

  it('takes tail costs and materials from real replay fields without supplying missing zeros', () => {
    const found = craftCostEvidence(result({ replay: replay() }));
    expect(found.p95).toBe(190);
    expect(found.materials).toEqual([{ label: 'Exalt', count: 10, spent: 10 }]);
    expect(craftCostEvidence(result()).p95).toBeUndefined();
    expect(craftCostEvidence(result()).materials).toEqual([]);
    for (const invalid of [replay({ runs: 0 }), replay({ meanCost: NaN }), replay({ stdErr: Infinity })]) {
      expect(craftCostEvidence(result({ replay: invalid })).p95).toBeUndefined();
      expect(craftCostEvidence(result({ replay: invalid })).materials).toEqual([]);
    }
    for (const percentiles of [[], [NaN], Array(101).fill(Infinity), Array(101).fill(-1)]) {
      expect(craftCostEvidence(result({ replay: replay({ costPercentiles: percentiles }) })).p95).toBeUndefined();
    }
    expect(craftCostEvidence(result({ feasible: false, expectedCost: Infinity, replay: replay() })).p95).toBeUndefined();
  });

  it('filters invalid material records, preserves observed zero values, and does not mutate replay input', () => {
    const observed = replay({ spendByMove: [
      { label: 'Exalt', count: 10.5, spent: 10.5 },
      { label: 'Free action', count: 2, spent: 0 },
      { label: 'Missing price', count: 3, spent: NaN },
      { label: 'Bad count', count: -1, spent: 5 },
      { label: '', count: 1, spent: 1 },
    ] });
    const found = craftCostEvidence(result({ replay: observed }));
    expect(found.materials).toEqual([
      { label: 'Exalt', count: 10.5, spent: 10.5 }, { label: 'Free action', count: 2, spent: 0 },
    ]);
    expect(observed.spendByMove).toHaveLength(5);
    expect(found.materials[0]).not.toBe(observed.spendByMove[0]);
  });

  it('reports a certified next action from the actual start state and not an arbitrary graph node', () => {
    const other = { ...start, key: 'other', isStart: false, action: 'Annul' };
    const found = craftCostEvidence(result({ nodes: [other, start] }));
    expect(found.nextAction).toBe('崇高石');
    expect(craftCostEvidence(result({ bound: 'lower', nodes: [start] })).nextAction).toBeUndefined();
    expect(craftCostEvidence(result({ bound: 'upper', nodes: [start] })).nextAction).toBe('崇高石');
    expect(craftCostEvidence(result({ nodes: [{ ...start, isGoal: true }] })).nextAction).toBeUndefined();
  });

  it('recognizes a goal using a real solve and distinguishes zero-priced unfinished actions', () => {
    const engine = { data: loadShippedPatch('data/patches/0.5.0'), prices: loadPrices('data/patches/0.5.0') };
    const held = { modId: 'Rings/IncreasedLife', tierDisplay: 3 };
    const actual = runSolve(engine, {
      kind: 'item', item: { baseId: 'Rings', level: 82, rarity: 'rare', prefixes: [held], suffixes: [] }, targets: [held],
    });
    const found = craftCostEvidence(actual);
    expect(found).toMatchObject({ kind: 'exact', cost: 0, goalMet: true, materials: [] });
    expect(judgeCraftCost(found).title).toContain('目标已达成');
    const zeroPriced = craftCostEvidence(result({ expectedCost: 0, nodes: [{ ...start, expectedCost: 0 }] }));
    expect(zeroPriced.goalMet).toBe(false);
    expect(judgeCraftCost(zeroPriced).title).not.toContain('目标已达成');
    expect(judgeCraftCost(zeroPriced).detail).toContain('材料可能被设为免费');
  });
});

describe('budget decisions from cost evidence', () => {
  it('requests a budget rather than inventing one, and accepts an explicit zero budget', () => {
    for (const budget of [undefined, NaN, Infinity, -1]) {
      expect(judgeCraftCost(evidence(), budget)).toMatchObject({ tone: 'neutral', title: '先设置制作预算' });
    }
    expect(judgeCraftCost(evidence(), 0)).toMatchObject({ tone: 'bad', title: '预计成本超过预算' });
  });

  it('compares exact mean cost while keeping tail costs and success probabilities distinct', () => {
    expect(judgeCraftCost(evidence(), 50)).toMatchObject({ tone: 'bad', title: '预计成本超过预算' });
    expect(judgeCraftCost(evidence(), 60)).toMatchObject({ tone: 'good', title: '可考虑继续制作' });
    const tail = judgeCraftCost(evidence({ p95: 120 }), 100);
    expect(tail).toMatchObject({ tone: 'warning', title: '平均成本在预算内，但尾部成本较高' });
    expect(tail.detail).toContain('P95');
    expect(tail.detail).toContain('预算内达标概率尚未');
    expect(tail.detail).not.toContain('95%');
    expect(judgeCraftCost(evidence({ p95: 90 }), 100).tone).toBe('good');
    expect(judgeCraftCost(evidence({ p95: NaN }), 100).detail).toContain('尚无可用');
  });

  it('draws only the conclusions that lower and upper bounds justify', () => {
    expect(judgeCraftCost(evidence({ kind: 'lower' }), 50))
      .toMatchObject({ tone: 'bad', title: '成本下界已超过预算' });
    expect(judgeCraftCost(evidence({ kind: 'lower' }), 100))
      .toMatchObject({ tone: 'warning', title: '仅有成本下界，预算仍待确认' });
    const upperFit = judgeCraftCost(evidence({ kind: 'upper' }), 100);
    expect(upperFit).toMatchObject({ tone: 'warning', title: '已有策略的平均成本在预算内' });
    expect(upperFit.detail).toContain('最优成本尚未确认');
    const upperOver = judgeCraftCost(evidence({ kind: 'upper' }), 50);
    expect(upperOver).toMatchObject({ tone: 'warning', title: '成本上界超过预算，仍需确认' });
    expect(upperOver.detail).toContain('更便宜的策略仍可能存在');
  });

  it('does not call unsupported or interrupted solves impossible or free', () => {
    expect(judgeCraftCost(evidence({ kind: 'unsupported', cost: undefined }), 100))
      .toMatchObject({ tone: 'neutral', title: '当前模型暂不支持此方案' });
    expect(judgeCraftCost(evidence({ kind: 'incomplete', cost: undefined }), 100))
      .toMatchObject({ tone: 'warning', title: '计算尚未完成' });
    expect(judgeCraftCost(evidence({ kind: 'unreachable', cost: undefined }), 100).title).toContain('无法达到');
    expect(judgeCraftCost(evidence({ cost: NaN }), 100).title).toBe('计算尚未完成');
    expect(judgeCraftCost(evidence({ cost: undefined }), 100).detail).toContain('不能把缺失成本当作零');
  });

  it('qualifies every recommendation that depends on assumed odds and never gives a definitive buy conclusion', () => {
    for (const kind of ['exact', 'lower', 'upper'] as const) {
      for (const budget of [10, 100]) {
        const found = judgeCraftCost(evidence({ kind, assumedOdds: true }), budget, 70, 50);
        expect(found.tone).toBe('warning');
        expect(found.title).toContain('假设权重');
        expect(found.detail).toContain('尚未核验');
        expect(found.title).not.toContain('直接购买');
      }
    }
  });
});

describe('manual goal-price comparison', () => {
  it('includes the current item opportunity value and handles equality as a reason to compare buying', () => {
    const cheaper = judgeCraftCost(evidence(), 100, 100, 50);
    expect(cheaper.title).toBe('优先比较直接购买成品');
    expect(cheaper.detail).toContain('手动填写');
    expect(cheaper.detail).toContain('110');
    expect(cheaper.detail).toContain('不代表可获得出售利润');
    expect(judgeCraftCost(evidence(), 100, 110, 50).title).toBe('优先比较直接购买成品');
    expect(judgeCraftCost(evidence(), 100, 111, 50).title).toBe('可考虑继续制作');
  });

  it('compares manual prices independently of the materials budget and permits a valueless starting item', () => {
    const noBudget = judgeCraftCost(evidence(), undefined, 100, 50);
    expect(noBudget).toMatchObject({ tone: 'warning', title: '优先比较直接购买成品' });
    expect(noBudget.detail).toContain('还未设置材料预算');
    expect(noBudget.detail).toContain('110');
    const cheaperCraft = judgeCraftCost(evidence(), undefined, 111, 50);
    expect(cheaperCraft).toMatchObject({ tone: 'neutral', title: '先设置制作预算' });
    expect(cheaperCraft.detail).toContain('制作的期望机会成本较低');
    expect(judgeCraftCost(evidence(), 100, 50, 0).title).toBe('优先比较直接购买成品');
    expect(judgeCraftCost(evidence(), undefined, 50, 0).title).toBe('优先比较直接购买成品');
    const overBudget = judgeCraftCost(evidence(), 10, 50, 0);
    expect(overBudget).toMatchObject({ tone: 'bad', title: '预计成本超过预算' });
    expect(overBudget.detail).toContain('可先比较直接购买');
  });

  it('requires a positive finished price, nonnegative starting value and a certified non-assumed cost', () => {
    for (const finishedPrice of [undefined, 0, -1, NaN, Infinity]) {
      expect(judgeCraftCost(evidence(), 100, finishedPrice, 50).title).toBe('可考虑继续制作');
    }
    for (const currentValue of [undefined, -1, NaN, Infinity]) {
      expect(judgeCraftCost(evidence(), 100, 70, currentValue).title).toBe('可考虑继续制作');
    }
    for (const kind of ['upper', 'lower', 'incomplete'] as const) {
      expect(judgeCraftCost(evidence({ kind }), 100, 70, 50).detail).not.toContain('手动填写');
    }
    expect(judgeCraftCost(evidence({ assumedOdds: true }), undefined, 70, 50).tone).toBe('neutral');
  });
});
