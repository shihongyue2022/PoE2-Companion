import { describe, expect, it } from 'vitest';
import type { EngineMarkovResult } from '../lib/engineTypes';
import { explainCraftReason, presentMarkovResult } from './resultPresentation';

const solved: EngineMarkovResult = {
  applicable: true, feasible: true, expectedCost: 42.25, converged: true,
  bound: 'exact', assumedOdds: false, nodes: [], edges: [],
};
const mods = new Map([
  ['Rings/Essence_ColdResistance', { text: '+#% to Cold Resistance', source: 'essence' }],
  ['Rings/IncreasedLife', { text: '+# to maximum Life', source: 'normal' }],
]);
const essenceReason = 'Rings/Essence_ColdResistance can only be added by a regular Essence, which needs a Magic item — this one is already Rare, so no route reaches it (a Perfect Essence works on a Rare, a regular one does not)';
const stepReason = 'the step planner can’t lay out this craft: mod Rings/Essence_ColdResistance can’t be put on Rings (a regular essence needs a Magic item, so an essence-only mod can’t go on an item you already hold (a fractured base is a Rare) — craft it from a white base instead, or drop the fractured mod)';

describe('workbench result status', () => {
  it('does not report a failed converged sentinel as a solved policy', () => {
    for (const applicable of [true, false]) {
      const result = presentMarkovResult({ ...solved, applicable, feasible: false, expectedCost: Infinity, reason: essenceReason });
      expect(result.hasCost).toBe(false);
      expect(result.statusText).not.toContain('已收敛');
      expect(result.kind).toBe(applicable ? 'unreachable' : 'unsupported');
    }
  });

  it('only presents finite nonnegative costs from applicable feasible results', () => {
    for (const expectedCost of [Infinity, -Infinity, NaN, -1]) {
      expect(presentMarkovResult({ ...solved, expectedCost }).hasCost).toBe(false);
    }
    expect(presentMarkovResult({ ...solved, applicable: false }).hasCost).toBe(false);
    expect(presentMarkovResult({ ...solved, feasible: false }).hasCost).toBe(false);
    expect(presentMarkovResult(solved)).toMatchObject({ costText: '42.25', kind: 'ready', hasCost: true });
    expect(presentMarkovResult({ ...solved, expectedCost: 0 })).toMatchObject({ costText: '0', kind: 'ready', hasCost: true });
  });

  it('preserves the direction of bounds even when converged is true', () => {
    expect(presentMarkovResult({ ...solved, bound: 'lower' })).toMatchObject({ costText: '≥ 42.25', kind: 'incomplete', hasCost: true });
    expect(presentMarkovResult({ ...solved, bound: 'upper', withoutBones: true })).toMatchObject({ costText: '≤ 42.25', statusText: '未使用亵渎的策略成本上界', kind: 'incomplete' });
    expect(presentMarkovResult({ ...solved, converged: false }).statusText).not.toContain('已收敛');
  });

  it('treats an interrupted infeasible result as unfinished instead of impossible', () => {
    expect(presentMarkovResult({ ...solved, applicable: false, feasible: false, expectedCost: Infinity, stoppedEarly: true }))
      .toMatchObject({ kind: 'incomplete', hasCost: false, nextText: '提高搜索精度后重算' });
  });
});

describe('workbench Chinese crafting explanations', () => {
  it('explains the screenshot rule with the translated modifier and source', () => {
    const result = explainCraftReason(essenceReason, mods);
    expect(result.message).toContain('冰冷抗性');
    expect(result.message).toContain('精华专属');
    expect(result.message).toContain('已经是稀有装备');
    expect(result.message).toContain('不能替代');
    expect(result.message).not.toMatch(/Rings\/|Magic|Rare/);
    expect(result.diagnostic).toBe(essenceReason);
  });

  it('keeps the fixed planner limitation separate from dynamic feasibility', () => {
    const result = explainCraftReason(stepReason, mods);
    expect(result.message).toContain('固定路线规划器暂不支持');
    expect(result.message).toContain('动态策略');
    expect(result.message).not.toContain('裂解');
    expect(result.diagnostic).toBe(stepReason);
  });

  it('distinguishes time limits, illegal targets and missing data', () => {
    expect(explainCraftReason('the solver stopped before it could put a number on this craft — raise Search effort').message).toContain('不代表目标不可达');
    expect(explainCraftReason('no target mods').message).toContain('至少一项');
    expect(explainCraftReason("Rings/Essence_ColdResistance isn't in Amulets's essence pool", mods).message).toContain('不属于当前底材');
    expect(explainCraftReason("Rings/IncreasedLife can't roll at item level 10", mods).message).toContain('10');
    expect(explainCraftReason('unknown mod id: Rings/Unknown', mods).message).toContain('数据无法识别');
    expect(explainCraftReason('requires a Magic item').message).toContain('魔法装备');
    expect(explainCraftReason('requires a Rare item').message).toContain('稀有装备');
  });

  it('does not invent a cause or discard unknown diagnostics', () => {
    const reason = 'a future rule failed: Rings/Unknown';
    expect(explainCraftReason(reason)).toEqual({
      message: '当前计算未能提供可用方案，请展开原始诊断查看原因。', diagnostic: reason,
    });
    expect(explainCraftReason(undefined)).toEqual({ message: '尚无可用的计算说明。' });
    expect(explainCraftReason('计算已取消。')).toEqual({ message: '计算已取消。' });
    expect(explainCraftReason('物品等级不足：该词缀至少需要物等 82。')).toEqual({ message: '物品等级不足：该词缀至少需要物等 82。' });
    expect(explainCraftReason(essenceReason).message).not.toContain('Rings/');
  });
});
