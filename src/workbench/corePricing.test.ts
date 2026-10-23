import { describe, expect, it } from 'vitest';
import { parseEquipment } from './genericEquipment';
import { equipmentTradeRows } from './genericEquipmentTrade';
import { corePriceAxes, corePriceQuery, jointCorePriceQuery, listingCoreMatch, listingCoreValue } from './corePricing';
import type { EstimateListing } from './marketEstimate';

const raw = 'Rarity: Unique\nThe Taming\nPrismatic Ring\n--------\n+12% to all Elemental Resistances (implicit)\n+26% to all Elemental Resistances\n24% increased Damage for each type of Elemental Ailment on Enemy';
describe('price according to a native core roll cohort', () => {
  it('recommends the conditional damage roll and uses its actual value as a floor in both sorts', () => {
    const item = parseEquipment(raw)!, rows = equipmentTradeRows(item), core = corePriceAxes(item, rows)[0]!;
    expect(core.actualValue).toBe(24);
    const band = corePriceQuery({ equipment: item, league: 'Test', rows }, core);
    expect(band).toMatchObject({ min: 24, max: undefined });
    expect(JSON.stringify(band.query)).toContain('"min":24');
    expect(JSON.stringify(band.query)).not.toContain('"max":');
    expect(band.query.sort).toEqual({ price: 'asc' });
    expect(band.query.query.stats.flatMap((group) => group.filters)).toHaveLength(1);
    expect(band.query.query.name).toBe('The Taming');
    const overview = corePriceQuery({ equipment: item, league: 'Test', rows }, core, { overview: true });
    expect(overview.query.sort).toEqual({ 'statgroup.0': 'desc' });
    expect(overview.query.query.stats[0]!.type).toBe('weight');
    expect(JSON.stringify(overview.query)).toContain('"min":24');
  });
  it('verifies returned core rolls and does not count an unreadable core as zero', () => {
    const item = parseEquipment(raw)!, core = corePriceAxes(item, equipmentTradeRows(item))[0]!;
    const listing: EstimateListing = { id: 'a', name: 'The Taming', base: 'Prismatic Ring', rarity: 'unique', price: { amount: 100, currency: 'divine' }, explicitMods: ['28% increased Damage for each type of Elemental Ailment on Enemy'] };
    expect(listingCoreValue(listing, core)).toBe(28);
    expect(listingCoreValue({ ...listing, explicitMods: ['+20% to all Elemental Resistances'] }, core)).toBeUndefined();
  });
  it('preserves the printed pdps floor in both the market overview and cheap-price search', () => {
    const item = parseEquipment('Rarity: Rare\nExample\nCrude Bow\n--------\nPhysical Damage: 100-200\nAttacks per Second: 2.00\n--------\n+20% to Fire Resistance')!;
    const rows = equipmentTradeRows(item), core = corePriceAxes(item, rows)[0]!;
    expect(core.equipmentFilter).toBe('pdps');
    const overview = corePriceQuery({ equipment: item, league: 'Test', rows }, core, { overview: true });
    expect(overview.query.sort).toEqual({ pdps: 'desc' });
    expect(overview.query.query.filters.equipment_filters?.filters.pdps).toEqual({ min: 300 });
    expect(corePriceQuery({ equipment: item, league: 'Test', rows }, core).query.query.filters.equipment_filters?.filters.pdps).toEqual({ min: 300 });
  });
  it('supports exact equality and positive improvements without lowering fractional rolls', () => {
    const item = parseEquipment(raw)!, rows = equipmentTradeRows(item), core = { ...corePriceAxes(item, rows)[0]!, actualValue: 5.89 };
    const options = { equipment: item, league: 'Test', rows };
    expect(corePriceQuery(options, core)).toMatchObject({ min: 5.89, max: undefined, rangeLabel: '≥ 5.89' });
    expect(corePriceQuery(options, core, { mode: 'same' })).toMatchObject({ min: 5.89, max: 5.89 });
    expect(corePriceQuery(options, core, { gain: 1 })).toMatchObject({ min: 5.9489, max: undefined });
    for (const gain of [0, 1, 3, 5]) expect(corePriceQuery(options, core, { gain }).min).toBeGreaterThanOrEqual(core.actualValue);
    expect(corePriceQuery(options, { ...core, actualValue: 5.8901234567 }).min).toBe(5.8901234567);
    expect(() => corePriceQuery(options, core, { gain: -1 })).toThrow();
  });
  it('requires both selected mods while sorting by only the chosen primary', () => {
    const item = parseEquipment(raw)!, rows = equipmentTradeRows(item), axes = corePriceAxes(item, rows);
    const damage = axes[0]!, resistance = axes.find((row) => row.actualValue === 26)!;
    const selections = [{ row: damage }, { row: resistance, mode: 'same' as const }];
    const options = { equipment: item, league: 'Test', rows };
    const price = jointCorePriceQuery(options, selections, damage.key), overview = jointCorePriceQuery(options, selections, damage.key, true);
    expect(price.query.sort).toEqual({ price: 'asc' });
    const hardFilters = price.query.query.stats.flatMap((group) => group.filters);
    expect(hardFilters.find((filter) => filter.id === resistance.ids[0])).toMatchObject({ value: { min: 26, max: 26 } });
    expect(hardFilters.find((filter) => filter.id === damage.ids[0])).toMatchObject({ value: { min: 24 } });
    expect(price.query.query.stats.filter((group) => group.type === 'count')).toHaveLength(1);
    expect(overview.query.sort).toEqual({ 'statgroup.0': 'desc' });
    expect(overview.query.query.stats[0]!.filters).toHaveLength(1);
    expect(overview.query.query.stats[0]!.filters[0]!.id).toBe(damage.ids[0]);
    expect(overview.query.query.stats.slice(1)).toEqual(price.query.query.stats);
    const sortedByResistance = jointCorePriceQuery(options, selections, resistance.key, true);
    expect(sortedByResistance.query.query.stats[0]!.filters[0]!.id).toBe(resistance.ids[0]);
    expect(sortedByResistance.query.query.stats.slice(1)).toEqual(price.query.query.stats);
    const listing = (dmg: number, res?: number): EstimateListing => ({ id: 'test', name: 'The Taming', base: 'Prismatic Ring', rarity: 'unique', price: { amount: 10, currency: 'divine' }, explicitMods: [
      `${dmg}% increased Damage for each type of Elemental Ailment on Enemy`, ...(res === undefined ? [] : [`+${res}% to all Elemental Resistances`]),
    ] });
    expect(listingCoreMatch(listing(24, 26), price.constraints)).toEqual({ matches: true, values: [24, 26] });
    expect(listingCoreMatch(listing(100, 25), price.constraints).matches).toBe(false);
    expect(listingCoreMatch(listing(23, 100), price.constraints).matches).toBe(false);
    expect(listingCoreMatch(listing(24), price.constraints).matches).toBe(false);
    expect(listingCoreMatch(listing(24, 27), price.constraints).matches).toBe(false);
  });
  it('combines a printed weapon property with a modifier floor and rejects empty selection', () => {
    const item = parseEquipment('Rarity: Rare\nExample\nCrude Bow\n--------\nPhysical Damage: 100-200\nAttacks per Second: 2.00\n--------\n+20% to Fire Resistance')!;
    const rows = equipmentTradeRows(item), axes = corePriceAxes(item, rows), pdps = axes.find((row) => row.equipmentFilter === 'pdps')!, fire = axes.find((row) => row.actualValue === 20)!;
    const options = { equipment: item, league: 'Test', rows };
    const query = jointCorePriceQuery(options, [{ row: pdps }, { row: fire, gain: 5 }], pdps.key, true);
    expect(query.query.sort).toEqual({ pdps: 'desc' });
    expect(query.query.query.filters.equipment_filters?.filters.pdps).toEqual({ min: 300 });
    expect(query.query.query.stats.flatMap((group) => group.filters).find((filter) => filter.id === fire.ids[0])).toMatchObject({ value: { min: 21 } });
    expect(() => jointCorePriceQuery(options, [])).toThrow('至少');
    expect(() => jointCorePriceQuery(options, [{ row: fire }, { row: fire }])).toThrow('重复');
  });
});
