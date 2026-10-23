import { describe, expect, it } from 'vitest';
import { parseEquipment } from './genericEquipment';
import { equipmentTradeRows } from './genericEquipmentTrade';
import { corePriceAxes, corePriceQuery, listingCoreValue } from './corePricing';
import type { EstimateListing } from './marketEstimate';

const raw = 'Rarity: Unique\nThe Taming\nPrismatic Ring\n--------\n+12% to all Elemental Resistances (implicit)\n+26% to all Elemental Resistances\n24% increased Damage for each type of Elemental Ailment on Enemy';
describe('price according to a native core roll cohort', () => {
  it('recommends the conditional damage roll rather than surplus resistance and keeps the current band bounded', () => {
    const item = parseEquipment(raw)!, rows = equipmentTradeRows(item), core = corePriceAxes(item, rows)[0]!;
    expect(core.actualValue).toBe(24);
    const band = corePriceQuery({ equipment: item, league: 'Test', rows }, core, 3, 0);
    expect(band).toMatchObject({ min: 23, max: 25 });
    expect(JSON.stringify(band.query)).toContain('"min":23,"max":25');
    expect(band.query.sort).toEqual({ price: 'asc' });
    expect(band.query.query.stats.flatMap((group) => group.filters)).toHaveLength(1);
    expect(band.query.query.name).toBe('The Taming');
    const overview = corePriceQuery({ equipment: item, league: 'Test', rows }, core, 3, 0, true);
    expect(overview.query.sort).toEqual({ 'statgroup.0': 'desc' });
    expect(overview.query.query.stats[0]!.type).toBe('weight');
  });
  it('verifies returned core rolls and does not count an unreadable core as zero', () => {
    const item = parseEquipment(raw)!, core = corePriceAxes(item, equipmentTradeRows(item))[0]!;
    const listing: EstimateListing = { id: 'a', name: 'The Taming', base: 'Prismatic Ring', rarity: 'unique', price: { amount: 100, currency: 'divine' }, explicitMods: ['28% increased Damage for each type of Elemental Ailment on Enemy'] };
    expect(listingCoreValue(listing, core)).toBe(28);
    expect(listingCoreValue({ ...listing, explicitMods: ['+20% to all Elemental Resistances'] }, core)).toBeUndefined();
  });
  it('sorts weapon market by pdps and queries a bounded pdps cohort separately', () => {
    const item = parseEquipment('Rarity: Rare\nExample\nCrude Bow\n--------\nPhysical Damage: 100-200\nAttacks per Second: 2.00\n--------\n+20% to Fire Resistance')!;
    const rows = equipmentTradeRows(item), core = corePriceAxes(item, rows)[0]!;
    expect(core.equipmentFilter).toBe('pdps');
    expect(corePriceQuery({ equipment: item, league: 'Test', rows }, core, 3, 0, true).query.sort).toEqual({ pdps: 'desc' });
    expect(corePriceQuery({ equipment: item, league: 'Test', rows }, core, 3, 0).query.query.filters.equipment_filters?.filters.pdps).toEqual({ min: 291, max: 309 });
  });
});
