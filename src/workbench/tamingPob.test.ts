import { describe, expect, it } from 'vitest';
import { TAMING_LEGACY_RAW, tamingPobXml } from './fixtures/tamingPob';
import { repairPobEquipment } from './pobRepair';
import { equipmentMetricDetails, parseEquipment } from './genericEquipment';
import { equipmentTradeRows, buildEquipmentTrade } from './genericEquipmentTrade';
import { upgradeComponents } from './upgradeRanking';

describe('the reported Taming ring', () => {
  it('recovers all seven old pending lines into six correctly translated modifiers', () => {
    const repaired = repairPobEquipment(tamingPobXml(), TAMING_LEGACY_RAW);
    expect(repaired.remaining).toBe(0);
    const item = parseEquipment(repaired.raw)!;
    expect(item.doubleCorrupted).toBe(true);
    expect(item.mods).toHaveLength(6);
    expect(item.mods.every((mod) => mod.searchable)).toBe(true);
    expect(item.mods.every((mod) => !/Wind Skills|as being boosted/.test(mod.label))).toBe(true);
    const ground = item.mods.find((mod) => mod.statId === 'wind_skills_count_as_empowered_by_chilled_ground')!;
    expect(ground.label).toMatch(/点燃.*感电.*冰缓/);
    expect(ground.value).toBeUndefined();
    expect(item.warnings).toEqual([]);
  });
  it('counts real base stats and preserves conditional/mechanical benefits with their meaning', () => {
    const item = parseEquipment(repairPobEquipment(tamingPobXml(), TAMING_LEGACY_RAW).raw)!;
    const details = equipmentMetricDetails(item);
    expect(details.values).toEqual({ dexterity: 14, fireResistance: 38, coldResistance: 38, lightningResistance: 38 });
    expect(details.effects).toHaveLength(3);
    expect(details.effects.find((effect) => effect.note.includes('24% ×'))?.referenceUrl).toBe('https://poe2db.tw/us/The_Taming');
    expect(details.uncounted).toHaveLength(3); // Still tell the comparison engine that these require build evaluation.
    const rows = equipmentTradeRows(item, 'upgrade');
    const components = upgradeComponents(rows);
    expect(components).toHaveLength(2); // Dexterity and total resistance direction; no unconditional damage claim.
    expect(components.some((component) => component.ids.includes('explicit.stat_3388405805'))).toBe(false);
    const query = buildEquipmentTrade({ equipment: item, league: 'Test', rows: equipmentTradeRows(item, 'strict') }).query;
    expect(query.query.stats.flatMap((group) => group.filters).some((filter) => filter.id === 'explicit.stat_2070837434')).toBe(true);
  });
});
