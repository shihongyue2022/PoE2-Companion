import { describe, expect, it } from 'vitest';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch';
import type { PatchData } from '../../packages/engine/src/types';
import { loadGearTrade, type GearTrade } from '../lib/gearTrade';
import { parseEquipment } from './genericEquipment';
import { buildEquipmentTrade } from './genericEquipmentTrade';
import { buildEquipmentT1Rows, equipmentT1Satisfied } from './equipmentT1';
import { BOOTS_SAMPLE } from './fixtures/fullGear';
import { BREACH_RING_SAMPLE } from './fixtures/breachRing';
import { IGNIFERIS_SAMPLE } from './fixtures/igniferis';

const data = loadShippedPatch('data/patches/0.5.0');
const trade = await loadGearTrade();
describe('all affix T1 market constraints', () => {
  it('requires every original affix at its own T1 threshold without carrying old defence totals or item level', () => {
    const item = parseEquipment(BOOTS_SAMPLE)!;
    const result = buildEquipmentT1Rows(item, data, trade);
    expect(result.complete, result.issues.join('\n')).toBe(true);
    expect(result.tieredCount).toBe(3);
    expect(result.rows.filter((row) => row.enabled).map((row) => row.min)).toEqual(['120', '41', '35']);
    expect(result.rows.filter((row) => row.equipmentFilter).every((row) => !row.enabled)).toBe(true);
    expect(equipmentT1Satisfied(result, result.rows)).toBe(true);
    const doc = buildEquipmentTrade({ equipment: item, league: 'Test', rows: result.rows, exactBase: false }).query;
    expect(doc.query.type).toBeUndefined();
    expect(doc.query.filters.type_filters.filters.category?.option).toBe('armour.boots');
    expect(JSON.stringify(doc)).not.toMatch(/ilvl|pseudo|weight/);
    expect(doc.query.stats.filter((group) => group.type === 'count').every((group) => group.value?.min === 1)).toBe(true);
    const weak = result.rows.map((row) => row.min === '41' ? { ...row, min: '40' } : row);
    expect(equipmentT1Satisfied(result, weak)).toBe(false);
    expect(equipmentT1Satisfied(result, result.rows.map((row) => row.min === '120' ? { ...row, enabled: false } : row))).toBe(false);
  });
  it('uses all six ring affix directions, including fractured and ordinary desecrated stats, without inflating quality', () => {
    const result = buildEquipmentT1Rows(parseEquipment(BREACH_RING_SAMPLE)!, data, trade);
    expect(result.complete, result.issues.join('\n')).toBe(true);
    expect(result.tieredCount).toBe(6);
    const bounds = result.rows.filter((row) => row.enabled && result.references.get(row.key)?.status === 't1').map((row) => Number(row.min));
    expect(bounds).toContain(165); expect(bounds).toContain(41); expect(bounds).toContain(15);
    expect(result.references.size).toBe(7);
    expect(result.rows.filter((row) => row.enabled)).toHaveLength(7);
    expect(result.rows.find((row) => row.label.includes('火焰伤害'))?.min).toBe('31');
    const rarity = result.rows.find((row) => row.label.includes('稀有度'))!;
    expect(rarity.ids.some((id) => id.startsWith('explicit.'))).toBe(true);
    expect(rarity.ids.some((id) => id.startsWith('fractured.'))).toBe(true);
  });
  it('never silently drops unknown affixes or calls partial conditions full T1', () => {
    const result = buildEquipmentT1Rows(parseEquipment(BOOTS_SAMPLE + '\nUnknown actual affix')!, data, trade);
    expect(result.complete).toBe(false);
    expect(result.issues.join()).toContain('Unknown actual affix');
    expect(equipmentT1Satisfied(result, result.rows)).toBe(false);
    const unique = buildEquipmentT1Rows(parseEquipment(IGNIFERIS_SAMPLE)!, data, trade);
    expect(unique.complete).toBe(false);
    expect(unique.issues.join()).toContain('传奇');
  });
  it('rejects different hybrid families sharing the same printed stat but with different T1 values', () => {
    const item = parseEquipment(BOOTS_SAMPLE)!;
    const original = data.mods.get('Boots_str_int/IncreasedLife')!;
    const base = [...data.bases.values()].find((base) => base.id === 'Boots_str_int')!;
    const id = 'Boots_str_int/AnotherLifeFamily';
    const patch: PatchData = { ...data, mods: new Map([...data.mods, [id, { ...original, id, family: 'another-family', tiers: [{ name: 'x', ilvl: 90, weight: 1, ranges: [[160, 180]] }] }]]),
      bases: new Map([...data.bases, [base.id, { ...base, pools: { ...base.pools, normal: { ...base.pools.normal, prefixes: [...base.pools.normal.prefixes, id] } } }]]) };
    const mapping: GearTrade = { ...trade, mods: { ...trade.mods, [id]: trade.mods[original.id]! } };
    const result = buildEquipmentT1Rows(item, patch, mapping);
    expect(result.complete).toBe(false);
    expect(result.issues.join()).toContain('混合');
  });
  it('preserves an unambiguous T1 while withholding lower tier menus if their ranges conflict', () => {
    const item = parseEquipment(BOOTS_SAMPLE)!, original = data.mods.get('Boots_str_int/IncreasedLife')!;
    const base = data.bases.get('Boots_str_int')!, id = 'Boots_str_int/SameTopDifferentT2';
    const duplicate = { ...original, id, tiers: original.tiers.map((tier, index) => index === original.tiers.length - 2 ? { ...tier, ranges: tier.ranges.map((range) => [range[0]! - 1, range[1]!] as [number, number]) } : tier) };
    const patch: PatchData = { ...data, mods: new Map([...data.mods, [id, duplicate]]), bases: new Map([...data.bases, [base.id, { ...base, pools: { ...base.pools, normal: { ...base.pools.normal, prefixes: [...base.pools.normal.prefixes, id] } } }]]) };
    const result = buildEquipmentT1Rows(item, patch, { ...trade, mods: { ...trade.mods, [id]: trade.mods[original.id]! } });
    const life = [...result.references.values()].find((ref) => ref.status === 't1' && ref.min === 120)!;
    expect(life.status).toBe('t1'); expect(life.tiers).toBeUndefined();
  });
  it('uses an upper bound for a signed reduced stat whose T1 values move downward', () => {
    const item = parseEquipment('Rarity: Rare\nRequirement Test\nAdherent Leggings\n--------\n20% reduced Attribute Requirements')!;
    const id = 'Boots_str_int/RequirementTest';
    const base = data.bases.get('Boots_str_int')!;
    const patch: PatchData = { patch: 'test', mods: new Map([[id, {
      id, text: '#% reduced Attribute Requirements', source: 'normal', type: 'suffix', family: 'requirements', tags: [],
      tiers: [{ name: 'low', ilvl: 1, weight: 1, ranges: [[5, 10]] }, { name: 'top', ilvl: 80, weight: 1, ranges: [[20, 30]] }],
    }]]), bases: new Map([[base.id, { ...base, pools: { ...base.pools, normal: { prefixes: [], suffixes: [id] } } }]]) };
    const mapping: GearTrade = { rows: [{ ids: item.mods[0]!.ids }], mods: { [id]: [[0, 0, 1]] } };
    const result = buildEquipmentT1Rows(item, patch, mapping);
    expect(result.complete, result.issues.join('\n')).toBe(true);
    expect(result.rows[0]).toMatchObject({ min: '', max: '-20' });
    expect(equipmentT1Satisfied(result, result.rows)).toBe(true);
    expect(equipmentT1Satisfied(result, [{ ...result.rows[0]!, max: '-10' }])).toBe(false);
  });
});
