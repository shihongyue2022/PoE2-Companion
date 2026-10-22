import { describe, expect, it } from 'vitest';
import vocabulary from './data/trade-item-index.json';
import { parseEquipment, simplifyEquipmentText } from './genericEquipment';
import { buildEquipmentTrade, equipmentTradeRows } from './genericEquipmentTrade';
import { estimateQueryContext } from './marketEstimate';
import { validateClipboard, validateEstimate } from '../../tools/workbenchServer';
import { CURRENCY_SAMPLE, GEM_SAMPLE, WAYSTONE_SAMPLE } from './fixtures/tradeItems';

function query(raw: string, preset: 'similar' | 'base' | 'strict' = 'similar') {
  const equipment = parseEquipment(raw)!;
  return buildEquipmentTrade({ equipment, league: 'Test', rows: equipmentTradeRows(equipment, preset) }).query;
}
describe('all official tradable item pricing', () => {
  it('recognizes every official non-equipment entry in English and available Traditional Chinese', () => {
    for (const entry of vocabulary.items) for (const name of [entry.en, entry.zh]) {
      const rarity = 'base' in entry ? 'Unique' : entry.group === 'currency' ? 'Currency' : entry.group === 'gem' ? 'Gem' : 'Normal';
      const className = entry.category === 'gem.activegem' ? 'Skill Gems' : entry.category === 'gem.supportgem' ? 'Support Gems' : entry.category === 'gem.metagem' ? 'Meta Gems' : '';
      const item = parseEquipment(`${className ? `Item Class: ${className}\n` : ''}Rarity: ${rarity}\n${name}${'base' in entry ? `\n${entry.base}` : ''}\n--------`);
      expect(item, name).not.toBeNull();
      if (item?.officialTypeCandidates) {
        expect(item.officialTypeCandidates.some((candidate) => candidate.type === entry.en), name).toBe(true);
        expect(item.baseNameEnglish).toBeUndefined(); continue;
      }
      expect(item?.category, name).toBe(entry.category);
      expect(item?.slot, name).toBe('other');
    }
  });
  it('keeps map tier, actual rarity, corruption and selectable real modifiers in correct official filters', () => {
    const item = parseEquipment(WAYSTONE_SAMPLE)!;
    expect(item).toMatchObject({ kind: 'waystone', category: 'map.waystone', mapTier: 15, rarity: 'rare', corrupted: true });
    expect(item.mods).toHaveLength(2); expect(item.mods.every((mod) => mod.searchable)).toBe(true);
    expect(item.properties.find((property) => property.name === 'mapBonus')?.values).toEqual([190]);
    const document = query(WAYSTONE_SAMPLE);
    expect(document.query.type).toBe('Waystone (Tier 15)');
    expect(document.query.filters).toMatchObject({ type_filters: { filters: { rarity: { option: 'rare' } } }, map_filters: { filters: { map_tier: { min: 15, max: 15 } } } });
    expect(document.query.filters.equipment_filters).toBeUndefined();
    expect(query(WAYSTONE_SAMPLE, 'base').query.filters.map_filters?.filters.map_tier).toEqual({ min: 15, max: 15 });
    expect(query(WAYSTONE_SAMPLE, 'base').query.filters.map_filters?.filters.map_bonus).toBeUndefined();
    expect(query(WAYSTONE_SAMPLE, 'strict').query.filters.map_filters?.filters.map_bonus).toEqual({ min: 190 });
    expect(estimateQueryContext(document).summary).toContain('地图阶级 15–15');
    expect(() => validateEstimate({ league: 'Test', search: document })).not.toThrow();
  });
  it('recognizes the map tier printed outside the name and handles simplified input', () => {
    expect(parseEquipment(simplifyEquipmentText(WAYSTONE_SAMPLE))?.mapTier).toBe(15);
    expect(parseEquipment(WAYSTONE_SAMPLE.replace('（階級 15）', '(階級 15)'))?.baseNameEnglish).toBe('Waystone (Tier 15)');
    expect(parseEquipment(WAYSTONE_SAMPLE.replace('換界石（階級 15）', '換界石'))?.baseNameEnglish).toBe('Waystone (Tier 15)');
  });
  it('supports stackable materials without item level and does not restrict by stack size or invented rarity', () => {
    const item = parseEquipment(CURRENCY_SAMPLE)!;
    expect(item).toMatchObject({ kind: 'currency', baseNameEnglish: 'Divine Orb', stackSize: 2, rarity: 'currency' });
    expect(item.mods).toEqual([]); expect(item.descriptionText).toHaveLength(1);
    const document = query(CURRENCY_SAMPLE);
    expect(document.query.type).toBe('Divine Orb');
    expect(document.query.filters.type_filters.filters.rarity).toBeUndefined();
    expect(document.query.filters.misc_filters?.filters).not.toHaveProperty('stack_size');
    expect(estimateQueryContext(document).sufficient).toBe(true);
    expect(() => validateClipboard({ raw: CURRENCY_SAMPLE, mode: 'trade' })).not.toThrow();
    expect(() => validateEstimate({ league: 'Test', search: document })).not.toThrow();
    expect(parseEquipment(CURRENCY_SAMPLE.replace('2/10', '1,234/5,000'))?.stackSize).toBe(1234);
  });
  it('keeps gem level and quality separate from item level', () => {
    const item = parseEquipment(GEM_SAMPLE)!;
    expect(item).toMatchObject({ kind: 'gem', gemLevel: 19, quality: 20, corrupted: true });
    const document = query(GEM_SAMPLE);
    expect(document.query.filters.misc_filters?.filters.gem_level).toEqual({ min: 19, max: 19 });
    expect(document.query.filters.type_filters.filters.quality).toEqual({ min: 20, max: 20 });
    expect(document.query.filters.type_filters.filters.rarity).toBeUndefined();
    expect(() => validateEstimate({ league: 'Test', search: document })).not.toThrow();
  });
  it('supports tablets, fragments, trial keys, runes, omens and categoryless official types', () => {
    for (const name of ['Breach Tablet', 'Breachstone', 'Inscribed Ultimatum', 'Djinn Barya', 'Expedition Logbook', 'Adept Rune', 'Omen of Whittling', 'Ornate Wombgift']) {
      const doc = query(`Rarity: Normal\n${name}\n--------\nArea Level: 80`);
      expect(doc.query.type).toBe(name);
      expect(() => validateEstimate({ league: 'Test', search: doc })).not.toThrow();
    }
    expect(query('Rarity: Normal\nOrnate Wombgift\n--------').query.filters.type_filters.filters.category).toBeUndefined();
  });
  it('refuses unknown translated types, forged categoryless types and invalid map bounds rather than pricing a broad class', () => {
    expect(() => query('Item Class: Currency\nRarity: Currency\nUnknown New Material\n--------')).toThrow('官方名称');
    const known = query('Rarity: Normal\nOrnate Wombgift\n--------');
    expect(() => validateEstimate({ league: 'Test', search: { ...known, query: { ...known.query, type: 'invented' } } })).toThrow('物品类别');
    const map = query(WAYSTONE_SAMPLE);
    expect(() => validateEstimate({ league: 'Test', search: { ...map, query: { ...map.query, filters: { ...map.query.filters, map_filters: { filters: { map_tier: { min: 99, max: 15 } } } } } } })).toThrow('下限');
  });
});
