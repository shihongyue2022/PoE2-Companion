import { describe, expect, it } from 'vitest';
import index from './data/equipment-index.json';
import { equipmentMetricDetails, equipmentMetrics, parseEquipment } from './genericEquipment';
import { buildEquipmentTrade, equipmentTradeRows } from './genericEquipmentTrade';
import { BREACH_RING_SAMPLE } from './fixtures/breachRing';
import { BOOTS_SAMPLE, WEAPON_SAMPLE } from './fixtures/fullGear';

describe('all equipment clipboard parsing and market searches', () => {
  it('recognizes every indexed equipment category in English and available Traditional names', () => {
    for (const category of index.categories) {
      const entry = index.items.find((item) => item.category === category && !('base' in item))!;
      expect(entry, category).toBeDefined();
      for (const name of [entry.en, entry.zh]) {
        const parsed = parseEquipment(`Rarity: Normal\n${name}\n--------\nItem Level: 80`);
        expect(parsed?.category, name).toBe(category);
        expect(parsed?.baseNameEnglish, name).toBe(entry.en);
      }
    }
    expect(parseEquipment('Rarity: Currency\nOrb of Alchemy')).toBeNull();
  });

  it('reads actual advanced-copy values instead of range endpoints or tier metadata', () => {
    const boots = parseEquipment(BOOTS_SAMPLE)!;
    expect(boots.slot).toBe('boots');
    expect(boots.mods).toHaveLength(3);
    expect(boots.mods.every((mod) => mod.searchable)).toBe(true);
    expect(equipmentMetrics(boots)).toMatchObject({ life: 100, coldResistance: 35, movementSpeed: 30, armour: 200, energyShield: 80 });
    const ring = parseEquipment(BREACH_RING_SAMPLE)!;
    expect(ring.category).toBe('accessory.ring');
    expect(ring.mods.find((mod) => /最大魔力/.test(mod.text))?.value).toBe(157);
    expect(equipmentMetrics(ring)).toMatchObject({ mana: 157, fireResistance: 15, coldResistance: 48, lightningResistance: 15 });
  });

  it('calculates local weapon DPS from printed positive range endpoints once', () => {
    const weapon = parseEquipment(WEAPON_SAMPLE)!;
    expect(weapon.properties.find((property) => property.name === 'physicalDamage')?.values).toEqual([100, 200]);
    expect(equipmentMetricDetails(weapon)).toMatchObject({ values: { physicalDps: 225, elementalDps: 75, totalDps: 300 }, uncounted: [] });
    const query = buildEquipmentTrade({ equipment: weapon, league: 'Test', rows: equipmentTradeRows(weapon) }).query;
    expect(query.query.filters.equipment_filters?.filters.pdps).toEqual({ min: 180 });
  });

  it('adds multiple flat spirit rolls and avoids double counting an already printed spirit property', () => {
    const raw = 'Rarity: Rare\nTest Amulet\nGold Amulet\n--------\nItem Level: 82\n--------\n+20 to Spirit\n+30 to Spirit';
    expect(equipmentMetrics(parseEquipment(raw)!)).toMatchObject({ spirit: 50 });
    expect(equipmentMetrics(parseEquipment(raw.replace('Item Level: 82', 'Spirit: 60\nItem Level: 82'))!)).toMatchObject({ spirit: 60 });
  });

  it('preserves negative additive stats and leaves unknown effects visible', () => {
    const item = parseEquipment(BOOTS_SAMPLE.replace('+100(90-100)', '-30').replace('30(25-30)% increased Movement Speed', 'An effect not in the game index'))!;
    expect(equipmentMetrics(item).life).toBe(-30);
    expect(item.warnings.join(' ')).toContain('尚未');
    expect(item.mods.some((mod) => !mod.searchable && mod.raw.includes('not in the game index'))).toBe(true);
  });

  it('builds exact unique-name queries and keeps unidentified and corrupted states explicit', () => {
    const entry = index.items.find((item) => 'base' in item && item.category === 'accessory.ring')!;
    const raw = `Rarity: Unique\n${entry.en}\n${'base' in entry ? entry.base : ''}\n--------\nItem Level: 70\n--------\nUnidentified\nCorrupted`;
    const equipment = parseEquipment(raw)!;
    expect(equipment.rarity).toBe('unique');
    expect(equipment.nameEnglish).toBe(entry.en);
    const { query } = buildEquipmentTrade({ equipment, league: 'Test', rows: [] });
    expect(query.query.name).toBe(entry.en);
    expect(query.query.filters.misc_filters?.filters).toMatchObject({ identified: { option: 'false' }, corrupted: { option: 'true' } });
  });

  it('allows wider upgrade searches without carrying the old base restriction or creating fake tiers', () => {
    const equipment = parseEquipment(BOOTS_SAMPLE)!;
    const rows = equipmentTradeRows(equipment, 'upgrade');
    expect(rows.find((row) => row.key === 'property:armour')?.min).toBe('220');
    const result = buildEquipmentTrade({ equipment, league: 'Test', rows, exactBase: false });
    expect(result.query.query.type).toBeUndefined();
    expect(result.query.query.filters.type_filters.filters.category.option).toBe('armour.boots');
    expect(JSON.stringify(result.query)).not.toMatch(/tier|ilvl/);
  });

  it('keeps context-dependent cost and requirement values as presence checks instead of assuming higher is better', () => {
    const item = parseEquipment(BOOTS_SAMPLE.replace('30(25-30)% increased Movement Speed', '20% reduced Attribute Requirements'))!;
    const effect = item.mods.find((mod) => mod.ref?.includes('Requirements'))!;
    expect(effect.searchable).toBe(true);
    const row = equipmentTradeRows(item, 'strict').find((entry) => entry.key === `mod:${effect.key}`)!;
    expect(row).toMatchObject({ min: '', max: '', presenceOnly: true });
    expect(row.warning).toContain('机制');
  });
});
