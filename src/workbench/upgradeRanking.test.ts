import { describe, expect, it } from 'vitest';
import { parseEquipment } from './genericEquipment';
import { buildEquipmentTrade, equipmentTradeRows } from './genericEquipmentTrade';
import { BOOTS_SAMPLE } from './fixtures/fullGear';
import { equipmentFromListing, scoreUpgrade, upgradeComponents } from './upgradeRanking';

const current = parseEquipment(BOOTS_SAMPLE)!;
const rows = equipmentTradeRows(current, 'upgrade');

describe('market upgrade ranking in the current equipment direction', () => {
  it('normalizes the current item to 100 and allows improvements with a weaker individual stat', () => {
    const components = upgradeComponents(rows);
    expect(components).toHaveLength(3);
    expect(scoreUpgrade(current, components).score).toBeCloseTo(100);
    const candidate = parseEquipment(BOOTS_SAMPLE.replace('+100(90-100)', '+70').replace('+35(31-35)', '+60').replace('30(25-30)%', '45%'))!;
    const result = scoreUpgrade(candidate, components);
    expect(result.score).toBeGreaterThan(100);
    expect(result.tradeoff).toBe(true);
    expect(result.parts.find((part) => /生命/.test(part.label))?.delta).toBe(-30);
  });

  it('sorts official results by aggregate weights rather than cheapest first or per-stat 110% floors', () => {
    const result = buildEquipmentTrade({ equipment: current, league: 'Test', rows, ranking: true, exactBase: false, budget: '25', budgetCurrency: 'divine' });
    expect(result.query.sort).toEqual({ 'statgroup.0': 'desc' });
    expect(result.query.query.type).toBeUndefined();
    expect(result.query.query.stats[0]?.type).toBe('weight');
    expect(result.query.query.stats[0]?.filters.every((filter) => filter.value?.weight && filter.value.min === undefined)).toBe(true);
    expect(result.query.query.stats.find((group) => group.type === 'and')?.filters).toHaveLength(0);
    expect(result.query.query.filters.trade_filters?.filters.price).toEqual({ max: 25, option: 'divine' });
    expect(result.query.query.filters.equipment_filters).toBeUndefined();
  });

  it('keeps mandatory floors separate from weighting and reacts to changed priorities', () => {
    const life = rows.find((row) => /最大生命/.test(row.label))!;
    const changed = rows.map((row) => row.key === life.key ? { ...row, min: '90', weight: '10' } : row);
    const result = buildEquipmentTrade({ equipment: current, league: 'Test', rows: changed, ranking: true });
    expect(result.query.query.stats.some((group) => group.type !== 'weight' && group.filters.some((filter) => filter.value?.min === 90))).toBe(true);
    const candidate = parseEquipment(BOOTS_SAMPLE.replace('+100(90-100)', '+70').replace('+35(31-35)', '+60').replace('30(25-30)%', '45%'))!;
    expect(scoreUpgrade(candidate, upgradeComponents(changed)).score).toBeLessThan(100);
    expect(() => buildEquipmentTrade({ equipment: current, league: 'Test', rows, ranking: true, budget: '-1' })).toThrow('预算');
    expect(() => upgradeComponents(rows.map((row) => ({ ...row, weight: 'NaN' })))).toThrow('权重');
  });

  it('counts each actual line once despite alternate placements and repeated stat rows', () => {
    const life = rows.find((row) => /最大生命/.test(row.label))!;
    const two = [{ ...life, ids: ['explicit.stat_3299347043', 'fractured.stat_3299347043'] },
      { ...life, key: 'second-life', actualValue: 20, ids: ['implicit.stat_3299347043'] }];
    const components = upgradeComponents(two);
    expect(components).toHaveLength(1);
    expect(components[0]?.baseline).toBe(120);
    const equipment = equipmentFromListing({ id: 'a', name: 'Example', base: 'Adherent Leggings',
      price: { amount: 1, currency: 'divine' }, fracturedMods: ['+100 to maximum Life'], implicitMods: ['+20 to maximum Life'] })!;
    expect(scoreUpgrade(equipment, components).score).toBeCloseTo(100);
  });

  it('rejects an empty scoring direction instead of claiming a cheapest category search is best', () => {
    expect(() => buildEquipmentTrade({ equipment: current, league: 'Test', rows: [], ranking: true })).toThrow('没有可安全计分');
  });
});
