import { describe, expect, it } from 'vitest';
import { loadPatch } from '../../packages/engine/src/loadPatch.ts';
import { parseWorkbenchItem, EXAMPLE_RING, EXAMPLE_AMULET } from './itemImport';
import { translateMod, translateModAtTier, translateCurrency, translateBase, toEngineMod, searchText } from './localization';
import { toEngineMod as mapEngineMod } from '../lib/engineMap';
import localizedStats from './data/localized-stats.json';
import { BREACH_RING_SAMPLE } from './fixtures/breachRing';

const data = loadPatch('data/patches/0.5.0');

describe('Traditional Chinese jewellery import', () => {
  it('reads real advanced Breach Ring groups without losing desecration, fracture or rolled values', () => {
    const item = parseWorkbenchItem(data, BREACH_RING_SAMPLE)!;
    expect(item).toMatchObject({ baseNameEnglish: 'Breach Ring', level: 79, rarity: 'rare', unmatchedLines: [] });
    expect(item.prefixes).toEqual([
      { modId: 'Rings/FireDamage', tierDisplay: 1 },
      { modId: 'Rings/LightningDamage', tierDisplay: 1, desecrated: true },
      { modId: 'Rings/IncreasedMana', tierDisplay: 2 },
    ]);
    expect(item.suffixes).toEqual([
      { modId: 'Rings/ItemFoundRarityIncrease', tierDisplay: 1, fractured: true },
      { modId: 'Rings/AllResistances', tierDisplay: 1 },
      { modId: 'Rings/ColdResistance', tierDisplay: 3 },
    ]);
    expect(item.rows.flatMap((row) => row.lines)).toEqual([
      'Adds 28 to 45 Fire damage to Attacks',
      'Adds 2 to 66 Lightning damage to Attacks',
      '+157 to maximum Mana', '18% increased Rarity of Items found',
      '+15% to all Elemental Resistances', '+33% to Cold Resistance',
    ]);
    expect(item.skipped[0]?.kind).toBe('implicit');
    expect(item.normalizedText).not.toContain('已亵渎 Prefix');
  });

  it('loads a rare ring with level, exact tiers and an excluded implicit', () => {
    const item = parseWorkbenchItem(data, EXAMPLE_RING)!;
    expect(item).not.toBeNull();
    expect(item).toMatchObject({
      baseId: 'Rings', baseName: '紅玉戒指', baseNameEnglish: 'Ruby Ring',
      level: 82, rarity: 'rare', complete: true, corrupted: false,
      unmatchedLines: [], warnings: [],
    });
    expect(item.prefixes).toEqual([{ modId: 'Rings/IncreasedLife', tierDisplay: 1 }]);
    expect(item.suffixes).toEqual([
      { modId: 'Rings/FireResistance', tierDisplay: 1 },
      { modId: 'Rings/Strength', tierDisplay: 1 },
    ]);
    expect(item.skipped[0]).toMatchObject({ kind: 'implicit', lines: ['+25% to Fire Resistance'] });
  });

  it('loads an amulet with skill levels and keeps its concrete trade name', () => {
    const item = parseWorkbenchItem(data, EXAMPLE_AMULET)!;
    expect(item).toMatchObject({ baseId: 'Amulets', baseNameEnglish: 'Solar Amulet', complete: true });
    expect(item.prefixes).toEqual([
      { modId: 'Amulets/BaseSpirit', tierDisplay: 1 },
      { modId: 'Amulets/IncreasedMana', tierDisplay: 1 },
    ]);
    expect(item.suffixes).toEqual([{ modId: 'Amulets/GlobalIncreaseSpellSkillGemLevel', tierDisplay: 1 }]);
  });

  it('accepts Simplified headers and queries as well as Traditional clipboard text', () => {
    const item = parseWorkbenchItem(data, EXAMPLE_RING
      .replace('物品種類', '物品种类').replace('物品等級', '物品等级')
      .replace('紅玉戒指', '红玉戒指').replace('+31點力量', '+31力量'))!;
    expect(item.complete).toBe(true);
    expect(item.suffixes.at(-1)?.modId).toBe('Rings/Strength');
  });

  it('recognizes pollution flags and blocks a crafting plan', () => {
    const item = parseWorkbenchItem(data, EXAMPLE_RING + '\n--------\n已汙染')!;
    expect(item.corrupted).toBe(true);
    expect(item.complete).toBe(false);
    expect(item.warnings.join(' ')).toContain('已污染');
    expect(item.unmatchedLines).toEqual([]);
  });

  it.each(['已汙染', '已複製', '不可調整的', '未鑑定 (階級 2)'])('retains an independent crafting block for %s after manual-review warnings are cleared', (flag) => {
    const item = parseWorkbenchItem(data, EXAMPLE_RING + '\n--------\n' + flag)!;
    const reviewed = { ...item, warnings: [], complete: true };
    expect(reviewed.craftingBlocked).toBe(true);
    expect(reviewed.blockedReason).toBeTruthy();
  });

  it('keeps unique-item restrictions independent of parse review', () => {
    const item = parseWorkbenchItem(data, EXAMPLE_RING.replace('稀有度: 稀有', '稀有度: 傳奇'))!;
    expect(item.craftingBlocked).toBe(true);
    expect(item.blockedReason).toContain('传奇');
    expect(parseWorkbenchItem(data, EXAMPLE_RING)!.craftingBlocked).toBe(false);
  });

  it('preserves unknown modifiers instead of silently completing a partial import', () => {
    const item = parseWorkbenchItem(data, EXAMPLE_RING + '\n這是一條尚未支援的詞綴')!;
    expect(item.complete).toBe(false);
    expect(item.unmatchedLines).toEqual(['這是一條尚未支援的詞綴']);
    expect(item.prefixes).toHaveLength(1);
  });

  it('reports ambiguous modifiers, including affix/tier candidates', () => {
    const item = parseWorkbenchItem(data, EXAMPLE_RING.replace('+110最大生命', '增加16%找到的物品稀有度'))!;
    expect(item.complete).toBe(false);
    expect(item.rows.some((row) => row.modIds.length > 1 && row.modId === undefined)).toBe(true);
    expect(item.warnings.join(' ')).toContain('歧义');
  });

  it('reads unknown concrete jewellery from class but requests confirmation', () => {
    const item = parseWorkbenchItem(data, EXAMPLE_RING.replace('紅玉戒指', '未知戒指底座'))!;
    expect(item).toMatchObject({ baseId: 'Rings', baseName: '未知戒指底座', complete: false });
    expect(item.prefixes).toHaveLength(1);
    expect(item.warnings.join(' ')).toContain('具体底座');
  });

  it('blocks unsupported special bases and missing item levels', () => {
    expect(parseWorkbenchItem(data, EXAMPLE_RING.replace('紅玉戒指', 'Dusk Ring'))!.complete).toBe(false);
    const missing = parseWorkbenchItem(data, EXAMPLE_RING.replace('物品等級: 82', '品质: +0%'))!;
    expect(missing.complete).toBe(false);
    expect(missing.warnings.join(' ')).toContain('缺少物品等级');
  });

  it('keeps fractured annotations and does not import rune/enchant text as explicit', () => {
    const text = EXAMPLE_RING.replace('+31點力量', '+31點力量 (已破裂)')
      + '\n--------\n+13%混沌抗性 (符文)\n--------\n增加10%傷害 (附魔)';
    const item = parseWorkbenchItem(data, text)!;
    expect(item.suffixes.at(-1)?.fractured).toBe(true);
    expect(item.skipped.map((skip) => skip.kind)).toEqual(['implicit', 'rune', 'enchant']);
  });

  it('rejoins the two-line light-radius/mana-regeneration modifier', () => {
    const item = parseWorkbenchItem(data, EXAMPLE_RING.replace('+31點力量', '增加15%照亮範圍\n增加20%魔力回復率'))!;
    expect(item.complete).toBe(true);
    expect(item.suffixes).toContainEqual({ modId: 'Rings/LightRadiusAndManaRegeneration', tierDisplay: 1 });
    expect(item.suffixes).toHaveLength(2);
  });

  it('returns null for arbitrary text', () => {
    expect(parseWorkbenchItem(data, '生命、混沌抗性')).toBeNull();
  });
});

describe('localized modifier vocabulary', () => {
  it('uses matched game templates without changing numeric values', () => {
    expect(toEngineMod('+42%火焰抗性')).toBe('+42% to Fire Resistance');
    expect(toEngineMod('攻擊附加7至13物理傷害')).toBe('Adds 7 to 13 Physical Damage to Attacks');
    expect(toEngineMod('減少20%裝備與技能寶石的能力值需求'))
      .toBe('Equipment and Skill Gems have 20% reduced Attribute Requirements');
    expect(translateMod('+# to maximum Life')).toBe('+#最大生命');
    expect(translateMod('42% increased Spell Damage')).toBe('增加42%法术伤害');
    expect(toEngineMod('-17(-40–+40)%火焰抗性')).toBe('-17% to Fire Resistance');
    expect(toEngineMod('攻擊附加2(1–4)至66(60–71)閃電傷害'))
      .toBe('Adds 2 to 66 Lightning damage to Attacks');
  });

  it('provides a Simplified display for every shipped jewellery text', () => {
    for (const mod of data.mods.values()) {
      if (!/^(Rings|Amulets)\//.test(mod.id) || !mod.text) continue;
      expect(translateMod(mod.text), mod.id).toMatch(/[\u3400-\u9fff]/);
      expect(translateMod(mod.text), mod.id).not.toMatch(/[A-Za-z]/);
    }
    expect(localizedStats.stats).toHaveLength(89);
  });

  it('translates real numeric ranges and replaces baked-in worst-tier damage values', () => {
    const life = mapEngineMod(data, 'Rings/IncreasedLife', 'prefix')!;
    expect(translateModAtTier(life, 1)).toBe('+100–119最大生命');
    const physical = mapEngineMod(data, 'Rings/PhysicalDamage', 'prefix')!;
    expect(translateModAtTier(physical, 1)).toBe('攻击附加12–19至22–32物理伤害');
    const cold = mapEngineMod(data, 'Rings/ColdDamage', 'prefix')!;
    expect(translateModAtTier(cold, 1)).toBe('攻击附加21–24至32–37冰冷伤害');
    const hybrid = mapEngineMod(data, 'Rings/LightRadiusAndManaRegeneration', 'suffix')!;
    expect(translateModAtTier(hybrid, 1)).toBe('增加15%照亮范围\n增加18–22%魔力回复率');
  });

  it('supports cross-language search and readable currencies', () => {
    expect(searchText('+#% to Chaos Resistance')).toContain(searchText('混沌抗性'));
    expect(searchText('增加#%施法速度')).toContain(searchText('施法速度'));
    expect(searchText('+# to Intelligence')).toContain(searchText('智力'));
    expect(searchText('+# to maximum Mana')).toContain(searchText('法力'));
    expect(translateCurrency('Greater Exalt (Sinistral)')).toBe('高阶 崇高石 (左旋（前缀）)');
    expect(translateBase('Ruby Ring')).toBe('红玉戒指');
    expect(translateMod('unrecognized effect')).toBe('unrecognized effect');
  });
});
