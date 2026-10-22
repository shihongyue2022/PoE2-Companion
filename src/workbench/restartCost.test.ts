import { describe, expect, it } from 'vitest';
import type { CraftCostEvidence } from './craftAdvice';
import { compareRestartCost } from './restartCost';

const evidence = (cost: number, changes: Partial<CraftCostEvidence> = {}): CraftCostEvidence => ({
  kind: 'exact', cost, assumedOdds: false, materials: [], ...changes,
});

describe('actual alternative-base cost comparison', () => {
  it('adds the real purchase and finish costs, then compares incremental spending', () => {
    expect(compareRestartCost(evidence(100), evidence(40), 20)).toMatchObject({
      total: 60, tone: 'good', title: '更换底材的期望追加成本较低',
    });
    const continued = compareRestartCost(evidence(50), evidence(40), 20);
    expect(continued).toMatchObject({ total: 60, title: '继续加工的期望追加成本较低' });
    expect(continued.detail).toContain('未填原装备可售价');
    expect(compareRestartCost(evidence(60), evidence(40), 20).title).toContain('相同');
  });

  it('does not invent a replacement quote or an old-item sale credit', () => {
    for (const price of [undefined, NaN, Infinity, -1]) {
      const found = compareRestartCost(evidence(100), evidence(40), price);
      expect(found.title).toBe('先填写替代底材的实际买价');
      expect(found.total).toBeUndefined();
      expect(found.detail).toContain('不能把购买成本当作零');
    }
    expect(compareRestartCost(evidence(100), evidence(40), 0).total).toBe(40);
    expect(compareRestartCost(evidence(100), evidence(40), 20, 0).total).toBe(60);
    const credited = compareRestartCost(evidence(50), evidence(40), 20, 30);
    expect(credited).toMatchObject({ total: 30, title: '更换底材的期望追加成本较低' });
    expect(credited.detail).toContain('实际能否售出仍需确认');
    for (const credit of [-1, NaN, Infinity]) expect(compareRestartCost(evidence(100), evidence(40), 20, credit).total).toBeUndefined();
  });

  it('keeps missing and unsupported solves separate from a finite current cost', () => {
    expect(compareRestartCost(undefined, evidence(40), 20)).toMatchObject({
      total: 60, tone: 'neutral', title: '先算出两件底材达到同一目标的成本',
    });
    expect(compareRestartCost(evidence(100), undefined, 20).total).toBeUndefined();
    for (const kind of ['incomplete', 'unsupported', 'unreachable'] as const) {
      const found = compareRestartCost(evidence(100, { kind, cost: undefined }), evidence(40), 20);
      expect(found.tone).toBe('warning');
      expect(found.title).toContain('不能确定');
    }
    for (const cost of [NaN, Infinity, -1]) expect(compareRestartCost(evidence(cost), evidence(40), 20).tone).toBe('warning');
  });

  it('does not rank lower or upper bounds as exact costs, even when numbers look decisive', () => {
    for (const kind of ['lower', 'upper'] as const) {
      for (const side of ['current', 'replacement'] as const) {
        const found = compareRestartCost(evidence(1000, side === 'current' ? { kind } : {}),
          evidence(1, side === 'replacement' ? { kind } : {}), 1);
        expect(found.tone).toBe('warning');
        expect(found.title).toBe('现有成本证据还不能确定哪种更划算');
      }
    }
  });

  it('labels assumed odds as conditional and never gives a definite cheaper recommendation', () => {
    for (const side of ['current', 'replacement'] as const) {
      const found = compareRestartCost(evidence(100, side === 'current' ? { assumedOdds: true } : {}),
        evidence(1, side === 'replacement' ? { assumedOdds: true } : {}), 1);
      expect(found.tone).toBe('warning');
      expect(found.title).toContain('假设权重');
      expect(found.title).not.toContain('成本较低');
      expect(found.detail).toContain('条件参考');
    }
  });

  it('preserves valid zero costs and negative net outlay without calling either a profit guarantee', () => {
    expect(compareRestartCost(evidence(0), evidence(0), 0, 0)).toMatchObject({ total: 0, tone: 'neutral' });
    const recovered = compareRestartCost(evidence(100), evidence(10), 10, 30);
    expect(recovered.total).toBe(-10);
    expect(recovered.detail).toContain('实际能否售出');
    expect(recovered.detail).not.toContain('利润');
    expect(compareRestartCost(evidence(100), evidence(Number.MAX_VALUE), Number.MAX_VALUE).title).toContain('超出');
  });
});
