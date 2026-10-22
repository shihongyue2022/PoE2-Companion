import { describe, expect, it } from 'vitest';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch';
import { loadGearTrade } from '../lib/gearTrade';
import { parseEquipment } from './genericEquipment';
import { buildEquipmentT1Rows } from './equipmentT1';
import { equipmentTradeRows } from './genericEquipmentTrade';
import { automaticUtilityRows, guidedSearchRows, rollGuides } from './searchGuidance';
import { BOOTS_SAMPLE } from './fixtures/fullGear';
import { BREACH_RING_SAMPLE } from './fixtures/breachRing';
import type { AffixReferenceResult } from './affixReference';

const data = loadShippedPatch('data/patches/0.5.0'), trade = await loadGearTrade();
describe('automatic roll guidance', () => {
  it('distinguishes a perfect current tier from the better T1 tier and generates ranges without typed values', () => {
    const item = parseEquipment(BOOTS_SAMPLE)!, t1 = buildEquipmentT1Rows(item, data, trade);
    const rows = equipmentTradeRows(item, 'upgrade'), guides = rollGuides(item, t1);
    const life = rows.find((row) => /最大生命/.test(row.label))!;
    expect(guides.get(life.key)).toMatchObject({ current: { min: 90, max: 100 }, currentPercent: 100, tierFloor: { min: 120 }, safe: true });
    expect(guides.get(life.key)!.top!.max).toBeGreaterThan(120);
    expect(guidedSearchRows(rows, guides, 't1').rows.find((row) => row.key === life.key)?.min).toBe('120');
    expect(guidedSearchRows(rows, guides, 'current').rows.find((row) => row.key === life.key)?.min).toBe('100');
    const near = guidedSearchRows(rows, guides, 'near-max').rows.find((row) => row.key === life.key)!;
    const range = guides.get(life.key)!.top!;
    expect(Number(near.min)).toBeCloseTo(range.min + .9 * (range.max - range.min));
    expect(near.max).toBe(''); // Better rolls remain searchable.
  });
  it('does not guess ranges or quality scaling, and keeps locked character constraints', () => {
    const ring = parseEquipment(BREACH_RING_SAMPLE)!, rows = equipmentTradeRows(ring, 'upgrade');
    const guides = rollGuides(ring, buildEquipmentT1Rows(ring, data, trade));
    expect([...guides.values()].some((guide) => guide.top)).toBe(true);
    expect([...guides.values()].every((guide) => !guide.safe)).toBe(true);
    const floor = { key: 'goal:fire', label: 'Fire floor', ids: ['pseudo.pseudo_total_fire_resistance'], locked: true, enabled: true, min: '15', max: '', weight: '0' };
    const result = guidedSearchRows([...rows, floor], guides, 'near-max');
    expect(result.rows.at(-1)).toBe(floor); expect(result.applied).toBe(0); expect(result.unavailable).toBeGreaterThan(0);
    const utility = automaticUtilityRows(rows, ring);
    expect(utility.find((row) => row.label.includes('稀有度'))?.enabled).toBe(false);
    expect(utility.find((row) => row.label.includes('最大品质'))?.enabled).toBe(false);
  });
  it('uses only the owned unique effect and exact English meaning from wiki ranges', () => {
    const item = parseEquipment('Rarity: UNIQUE\nIgniferis\nCrimson Amulet\n--------\n+17% to Fire Resistance')!;
    const reference: AffixReferenceResult = { name: 'Igniferis', url: 'https://poe2db.tw/us/Igniferis', checkedAt: new Date().toISOString(), cached: false,
      modifiers: [{ english: '+(10—20)% to Fire Resistance', origin: 'explicit' }, { english: '+(30—40)% to Cold Resistance', origin: 'explicit' }] };
    const guides = rollGuides(item, undefined, reference), rows = equipmentTradeRows(item, 'upgrade');
    expect([...guides.values()][0]).toMatchObject({ top: { min: 10, max: 20 }, currentPercent: 70, safe: true });
    expect(guidedSearchRows(rows, guides, 'near-max').rows[0]!.min).toBe('19');
    expect(guidedSearchRows(rows, guides, 't1').applied).toBe(0);
    expect(item.mods).toHaveLength(1); // Wiki possibilities do not become owned modifiers.
  });
  it('sets an upper bound for lower-is-better signed values and skips unknown stats', () => {
    const item = parseEquipment('Rarity: Rare\nExample\nAdherent Leggings\n--------\n20(10-30)% reduced Attribute Requirements')!;
    const rows = equipmentTradeRows(item, 'strict').map((row) => ({ ...row, presenceOnly: false }));
    const guide = rollGuides(item), key = rows[0]!.key;
    expect(guide.get(key)).toMatchObject({ current: { min: -30, max: -10 }, lowerIsBetter: true });
    const kept = guidedSearchRows(rows, guide, 'current');
    expect(kept.rows[0]).toMatchObject({ min: '', max: '-20' });
    const unknown = guidedSearchRows([{ ...rows[0]!, key: 'unknown', min: '999' }], guide, 'near-max');
    expect(unknown.rows[0]!.min).toBe(''); expect(unknown.unavailable).toBe(1);
  });
});
