import { expect, it } from 'vitest';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch';
import { loadGearTrade } from '../lib/gearTrade';
import { parseEquipment } from './genericEquipment';
import { equipmentTradeRows } from './genericEquipmentTrade';
import { equipmentSearchOptions } from './equipmentSearchOptions';
import { corePriceAxes, jointCorePriceQuery, listingCoreMatch } from './corePricing';
import { validateEstimate } from '../../tools/workbenchServer';

const data = loadShippedPatch('data/patches/0.5.0'), trade = await loadGearTrade();
const item = parseEquipment('Rarity: Rare\nExample Belt\nRawhide Belt\n--------\nItem Level: 84\n--------\n+60 to maximum Life')!;
const rows = equipmentSearchOptions(item, equipmentTradeRows(item), data, trade);

it('offers verified belt suffix/prefix tiers without turning their reference rolls into owned stats', () => {
  const axes = corePriceAxes(item, rows), chaos = axes.find((row) => row.scoringRef === '#% to Chaos Resistance')!;
  expect(chaos).toMatchObject({ label: '混沌抗性', affixType: 'suffix', targetRange: { min: 24, max: 27 }, suggested: true });
  expect(chaos.actualValue).toBeUndefined();
  expect(chaos.searchPresets).toContainEqual({ id: 'tier:1', label: 'T1 · ≥ 24 · 需物等 81', min: 24 });
  expect(axes.some((row) => row.label === '药剂充能获取')).toBe(true);
  expect(axes.some((row) => row.label === '护符效果持续时间')).toBe(true);
  expect(item.mods).toHaveLength(1);
  expect(axes.find((row) => row.actualValue === 60)?.searchPresets?.length).toBeGreaterThan(0);
});

it('combines absent chaos, item level and an existing life roll in both sorts and verifies each returned fact', () => {
  const axes = corePriceAxes(item, rows), chaos = axes.find((row) => row.scoringRef === '#% to Chaos Resistance')!, level = axes.find((row) => row.equipmentFilter === 'ilvl')!, life = axes.find((row) => row.actualValue === 60)!;
  for (const overview of [false, true]) {
    const band = jointCorePriceQuery({ equipment: item, league: 'Test', rows }, [{ row: chaos, preset: 'tier:1' }, { row: level, preset: 'level:84' }, { row: life }], chaos.key, overview);
    expect(band.query.query.filters.misc_filters?.filters.ilvl).toEqual({ min: 84 });
    expect(band.query.query.stats.flatMap((group) => group.filters)).toContainEqual({ id: chaos.ids[0], value: { min: 24 }, disabled: false });
    expect(band.query.sort).toEqual(overview ? { 'statgroup.0': 'desc' } : { price: 'asc' });
    expect(validateEstimate({ league: 'Test', search: band.query }).search).toEqual(band.query);
    const listing = { id: 'a', name: 'Example', base: 'Rawhide Belt', itemLevel: 84, price: { amount: 2, currency: 'divine' }, explicitMods: ['+24% to Chaos Resistance', '+60 to maximum Life'] };
    expect(listingCoreMatch(listing, band.constraints).matches).toBe(true);
    expect(listingCoreMatch({ ...listing, itemLevel: 83 }, band.constraints).matches).toBe(false);
    expect(listingCoreMatch({ ...listing, itemLevel: undefined }, band.constraints).matches).toBe(false);
    expect(listingCoreMatch({ ...listing, explicitMods: ['+60 to maximum Life'] }, band.constraints).matches).toBe(false);
    expect(JSON.stringify(band.query)).not.toMatch(/[\u3400-\u9fff]/u);
  }
});

it('does not invent tier menus for signed charge-consumption mappings that lack a verified scalar layout', () => {
  expect(corePriceAxes(item, rows).find((row) => row.scoringRef === '#% reduced Flask Charges used')).toBeUndefined();
});

it('offers basic item-level filtering without assuming a current level or a tier pool on unique/unknown gear', () => {
  for (const current of [{ ...item, rarity: 'unique' as const, itemLevel: undefined }, { ...item, baseNameEnglish: 'Unknown Belt', itemLevel: undefined }]) {
    const options = equipmentSearchOptions(current, [], data, trade), axes = corePriceAxes(current, options);
    expect(axes.some((row) => row.scoringRef === '#% to Chaos Resistance')).toBe(false);
    const level = axes.find((row) => row.equipmentFilter === 'ilvl')!;
    const query = jointCorePriceQuery({ equipment: current, league: 'Test', rows: options }, [{ row: level, preset: 'level:84' }]);
    expect(query.query.query.filters.misc_filters?.filters.ilvl).toEqual({ min: 84 });
    expect(() => jointCorePriceQuery({ equipment: current, league: 'Test', rows: options }, [{ row: level, preset: 'level:84' }], level.key, true)).toThrow('只作筛选');
  }
});
