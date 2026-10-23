import { describe, expect, it } from 'vitest';
import { parseEquipment } from './genericEquipment';
import { buildEquipmentTrade, equipmentTradeRows } from './genericEquipmentTrade';
import { affixPriceBands } from './rollPriceComparison';

describe('single-affix price band queries', () => {
  it('changes only the selected roll floor, keeps chaos and budget and uses English IDs with price sorting', () => {
    const equipment = parseEquipment('Rarity: Rare\nSynthetic Loop\nGold Ring\n--------\n10% increased Attack Speed')!;
    const row = { ...equipmentTradeRows(equipment, 'upgrade')[0]!, enabled: true };
    const chaos = { key: 'goal:chaos', label: '混沌', ids: ['pseudo.pseudo_total_chaos_resistance'], enabled: true, locked: true, min: '25', max: '', weight: '0', presenceOnly: true };
    const options = { equipment, league: 'Test', rows: [row, chaos], budget: '50', budgetCurrency: 'divine' as const, ranking: true, exactBase: false };
    const bands = affixPriceBands(options, row, { top: { min: 13, max: 16 }, safe: true, lowerIsBetter: false, note: '' });
    expect(bands.map((entry) => entry.min)).toEqual(['10', '13', '15.7', '16']);
    for (const band of bands) {
      expect(band.query.sort).toEqual({ price: 'asc' });
      expect(band.query.query.filters.trade_filters!.filters.price).toEqual({ max: 50, option: 'divine' });
      expect(band.query.query.stats.flatMap((group) => group.filters)).toContainEqual({ id: chaos.ids[0], value: { min: 25 }, disabled: false });
      expect(JSON.stringify(band.query)).not.toMatch(/[\u3400-\u9fff]/u);
      const original = buildEquipmentTrade({ ...options, constraintOnly: true }).query;
      expect(band.query.query.filters).toEqual(original.query.filters);
    }
    expect(affixPriceBands(options, chaos, { top: { min: 24, max: 27 }, safe: true, lowerIsBetter: false, note: '' })).toEqual([]);
    expect(affixPriceBands(options, row, { top: { min: 13, max: 16 }, safe: false, lowerIsBetter: false, note: '' })).toEqual([]);
  });
  it('compares conditional unique rolls as price thresholds without treating them as unconditional DPS', () => {
    const equipment = parseEquipment('Rarity: Unique\nThe Taming\nPrismatic Ring\n--------\n28% increased Damage for each type of Elemental Ailment on Enemy')!;
    const row = equipmentTradeRows(equipment, 'upgrade').find((entry) => entry.presenceOnly)!;
    expect(row).toBeDefined();
    const bands = affixPriceBands({ equipment, league: 'Test', rows: [row], exactUnique: true }, row,
      { top: { min: 20, max: 30 }, unique: true, safe: true, lowerIsBetter: false, note: '' });
    expect(bands.map((entry) => entry.min)).toEqual(['20', '28', '29', '30']);
    expect(bands.every((entry) => entry.query.query.name === 'The Taming')).toBe(true);
    for (const entry of bands) expect(entry.query.sort).toEqual({ price: 'asc' });
    expect(bands.every((entry) => entry.query.query.stats.every((group) => group.type !== 'weight'))).toBe(true);
  });
});
