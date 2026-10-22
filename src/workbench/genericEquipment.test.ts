import { describe, expect, it } from 'vitest';
import index from './data/equipment-index.json';
import { equipmentMetricDetails, equipmentMetrics, parseEquipment } from './genericEquipment';
import { buildEquipmentTrade, equipmentTradeRows } from './genericEquipmentTrade';
import { BREACH_RING_SAMPLE } from './fixtures/breachRing';
import { BOOTS_SAMPLE, WEAPON_SAMPLE } from './fixtures/fullGear';
import { IGNIFERIS_SAMPLE } from './fixtures/igniferis';

describe('all equipment clipboard parsing and market searches', () => {
  it('localizes constant mechanics and marked PoB lines without inventing searchable trade mappings', async () => {
    const { localizeEquipmentStat, matchEquipmentStat, equipmentDisplayName } = await import('./genericEquipment');
    const mechanic = 'Life Leech recovers based on your Lightning damage as well as Physical damage';
    const translated = localizeEquipmentStat(mechanic);
    expect(translated).toContain('生命偷取');
    expect(translated).not.toContain('Life Leech');
    const uncertain = matchEquipmentStat('25% increased Melee Strike Range with this weapon [PoB数值待游戏文本核对]');
    expect(uncertain.label).toContain('此武器增加25%近战打击范围');
    expect(uncertain.label).toContain('[PoB数值待游戏文本核对]');
    expect(uncertain).toMatchObject({ searchable: false, ids: [] });
    expect(localizeEquipmentStat('Create a Fragment of Divinity in your Presence every 4 seconds')).toContain('每4秒');
    expect(matchEquipmentStat('Grants Skill: Spear Throw')).toMatchObject({ label: '赋予技能: 长矛投掷', searchable: false, ids: [] });
    expect(matchEquipmentStat('Bonded: 20% reduced Slowing Potency of Debuffs on You (rune)')).toMatchObject({ label: '命定：减少20%你身上的减益效果缓速程度', searchable: false, ids: [] });
    expect(localizeEquipmentStat('Uncatalogued effect 123')).toBe('Uncatalogued effect 123');
    const item = parseEquipment('Rarity: UNIQUE\nThe Ordained\nSolemn Spear\n--------\nItem Level: 84')!;
    expect(equipmentDisplayName(item)).toBe('神授命使');
    expect(item.name).toBe('The Ordained');
  });
  it('recognizes granted skills in implicit and explicit positions without treating skill level as linear power', () => {
    for (const flag of ['', ' (implicit)', ' (enchant)']) {
      const item = parseEquipment(`Rarity: UNIQUE\nThe Ordained\nGrand Spear\n--------\nGrants Skill: Level 19 Righteous Descent${flag}\n220% increased Physical Damage`)!;
      expect(item.mods[0]).toMatchObject({ searchable: true, ids: ['skill.righteous_descent'], value: 19 });
      const rows = equipmentTradeRows(item, 'upgrade');
      expect(rows[0]).toMatchObject({ enabled: true, presenceOnly: true, min: '' });
      const query = buildEquipmentTrade({ equipment: item, league: 'Test', rows, ranking: true }).query;
      expect(query.query.stats[0]!.filters.some((filter) => filter.id === 'skill.righteous_descent')).toBe(false);
      expect(query.query.stats[1]!.filters).toContainEqual({ id: 'skill.righteous_descent', disabled: false });
    }
  });
  it('keeps sanctification and ward out of the affix list while displaying their actual state and value', () => {
    const item = parseEquipment('Rarity: RARE\nImported Amulet\nGold Amulet\n--------\nItem Level: 82\nWard: 34\n--------\n+157 to maximum Mana\nSanctified')!;
    expect(item).toMatchObject({ sanctified: true, stateText: ['已圣化'] });
    expect(item.mods).toHaveLength(1);
    expect(item.properties).toContainEqual(expect.objectContaining({ name: 'ward', label: '符文保护', values: [34] }));
    expect(equipmentMetrics(item)).toMatchObject({ mana: 157 });
  });
  it('recognizes all six Igniferis effects and keeps its flavour text outside the unmatched modifiers', () => {
    const parsed = parseEquipment(IGNIFERIS_SAMPLE)!;
    expect(parsed.nameEnglish).toBe('Igniferis');
    expect(parsed.mods).toHaveLength(6);
    expect(parsed.mods.every((mod) => mod.searchable)).toBe(true);
    expect(parsed.mods.find((mod) => mod.ref === '# Life Regeneration per second')?.value).toBe(2.7);
    expect(parsed.mods.find((mod) => mod.ref?.startsWith('Every 4 seconds'))?.value).toBe(0.2);
    expect(parsed.flavourText).toHaveLength(2);
    expect(parsed.warnings).toEqual([]);
  });
  it('keeps double corruption as an official item-state filter and preserves unknown real affixes', () => {
    const parsed = parseEquipment(`${IGNIFERIS_SAMPLE}\n--------\n雙重 Corrupted`)!;
    expect(parsed).toMatchObject({ corrupted: true, doubleCorrupted: true, stateText: ['双重腐化'] });
    expect(parsed.mods).toHaveLength(6);
    const query = buildEquipmentTrade({ equipment: parsed, league: 'Test', rows: equipmentTradeRows(parsed) }).query;
    expect(query.query.filters.misc_filters?.filters).toMatchObject({ corrupted: { option: 'true' }, twice_corrupted: { option: 'true' } });
    const unknown = parseEquipment(IGNIFERIS_SAMPLE.replace('增加25%照亮範圍', '尚未收录的真正特殊效果'))!;
    expect(unknown.mods.some((mod) => mod.raw === '尚未收录的真正特殊效果' && !mod.searchable)).toBe(true);
  });
  it('treats the constant Wind-skill mechanic as presence rather than a numeric value of zero', () => {
    const parsed = parseEquipment(IGNIFERIS_SAMPLE.replace('增加25%照亮範圍', '可被元素地面強化的疾風技能視為\n受到冰緩地面強化'))!;
    const wind = parsed.mods.find((mod) => mod.ref?.startsWith('Wind Skills'))!;
    expect(wind.searchable).toBe(true);
    expect(wind.value).toBeUndefined();
    expect(wind.label).toContain('冰缓');
  });
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
    expect(parseEquipment('Rarity: Currency\nOrb of Alchemy')).toMatchObject({ kind: 'currency', category: 'currency' });
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
    expect(rows.find((row) => row.key === 'property:armour')).toMatchObject({ min: '', enabled: false });
    const result = buildEquipmentTrade({ equipment, league: 'Test', rows, exactBase: false, ranking: true });
    expect(result.query.sort).toEqual({ 'statgroup.0': 'desc' });
    expect(result.query.query.stats[0]?.type).toBe('weight');
    expect(result.query.query.type).toBeUndefined();
    expect(result.query.query.filters.type_filters.filters.category?.option).toBe('armour.boots');
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
