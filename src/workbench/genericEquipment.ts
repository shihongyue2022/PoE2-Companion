import source from './data/equipment-index.json';
import tradeItems from './data/trade-item-index.json';
import displayVocabulary from './data/equipment-display.json';
import { poe2dbStatReference, poe2dbUnmappedStat } from './poe2dbReference';

export type EquipmentSlot = 'weapon' | 'offhand' | 'helmet' | 'body' | 'gloves' | 'boots' | 'ring' | 'amulet' | 'belt' | 'jewel' | 'flask' | 'charm' | 'relic' | 'other';
export interface EquipmentProperty { name: string; label: string; values: number[]; text: string }
export interface EquipmentMod {
  key: string; raw: string; text: string; label: string; ids: string[]; values: number[];
  searchable: boolean; value?: number; warning?: string; ref?: string; statId?: string;
  affixType?: 'prefix' | 'suffix';
  /** Advanced-copy modifier block. Several printed lines can occupy one affix slot. */
  affixGroup?: number;
  recognized?: boolean; referenceUrl?: string; englishText?: string;
}
export interface Equipment {
  raw: string; name: string; baseName: string; baseNameEnglish?: string; nameEnglish?: string;
  category: string; slot: EquipmentSlot; rarity: 'normal' | 'magic' | 'rare' | 'unique' | 'currency' | 'gem' | 'card'; icon?: string;
  kind?: 'equipment' | 'waystone' | 'tablet' | 'map' | 'currency' | 'gem' | 'other';
  mapTier?: number; gemLevel?: number; quality?: number; areaLevel?: number; stackSize?: number; descriptionText?: string[];
  officialTypeCandidates?: { type: string; category: string }[];
  itemLevel?: number; identified: boolean; corrupted: boolean; twoHanded: boolean;
  doubleCorrupted?: boolean; flavourText?: string[]; stateText?: string[];
  sanctified?: boolean;
  sockets?: { count: number; filled?: number };
  properties: EquipmentProperty[]; mods: EquipmentMod[]; warnings: string[];
}
interface ItemEntry { en: string; zh: string; category: string; base?: string; icon?: string; group?: string; mapTier?: number }
interface Matcher { string: string; negate?: boolean; value?: number }
interface StatEntry { ref: string; id?: string; matchers: Matcher[]; ids: Record<string, string[]> }
interface Index { categories: string[]; simplify: Record<string, string>; items: ItemEntry[]; stats: StatEntry[] }
const rawIndex = source as unknown as Index;
// Some unreleased bases have no localized name. Keep their verified English entry without
// passing a missing translation into Unicode normalization or discarding the whole catalogue.
const index: Index = { ...rawIndex, items: [...rawIndex.items, ...tradeItems.items].filter((item) => typeof item.en === 'string')
  .map((item) => ({ ...item, zh: typeof item.zh === 'string' ? item.zh : item.en })),
  // The pinned localized matcher puts the roll before the sentence; the game copy
  // puts it after the resistance name. Retain the same verified native ref and ID.
  stats: rawIndex.stats.map((stat) => stat.id === 'local_base_chaos_damage_resistance_%_per_rune_or_soul_core' && stat.ref === '#% to Chaos Resistance per Socket filled'
    ? { ...stat, matchers: [...stat.matchers, { string: '每個鑲嵌的插槽使混沌抗性+#%' }, { string: '每個鑲嵌的插槽使混沌抗性#%' }] } : stat) };
export const EQUIPMENT_TRADE_CATEGORIES: readonly string[] = index.categories;
export const ITEM_KIND_LABELS = { equipment: '装备', waystone: '换界石（地图）', tablet: '碑牌', map: '终局物品', currency: '通货 / 材料', gem: '宝石', other: '其他物品' };
export const itemKindLabel = (item: Equipment): string => ITEM_KIND_LABELS[item.kind ?? 'equipment'];
/** Verified placements of the same scalar, so upgrades need not share a fracture or implicit source. */
export function equipmentStatAliases(ref: string, original: readonly string[], extraPlacements: readonly string[] = []): string[] {
  const hashes = new Set(original.map((id) => id.split('.').pop()));
  const placements = new Set(['explicit', 'fractured', 'desecrated', ...extraPlacements, ...original.map((id) => id.split('.')[0])]);
  return [...new Set(index.stats.filter((stat) => stat.ref === ref).flatMap((stat) => Object.values(stat.ids).flat()))]
    .filter((id) => hashes.has(id.split('.').pop()) && placements.has(id.split('.')[0]));
}
/** OpenCC character conversion only: translations still come from the pinned game vocabulary. */
export const simplifyEquipmentText = (text: string): string => [...text].map((c) => index.simplify[c] ?? c).join('');
const normalize = (text: string): string => simplifyEquipmentText(text).toLowerCase().replace(/[\u00a0\s]/g, '').replace(/[：]/g, ':').replace(/[，]/g, ',').replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/[−–]/g, '-');
const clean = (text: string): string => text.replace(/<[^>]*>/g, '')
  .replace(/\s*[—–]\s*(?:無法變動的值|无法变动的值|Unscalable Value)\s*$/i, '')
  .replace(/\(\s*[+-]?\d+(?:\.\d+)?\s*[-–]\s*[+-]?\d+(?:\.\d+)?\s*\)/g, '')
  .replace(/\((?:augmented|unmet|implicit|enchant|rune|fractured|crafted|desecrated|scourge|sanctum)\)/gi, '')
  .replace(/（(?:固定|附魔|符文|破裂|工艺|褻瀆|亵渎|增幅|未滿足|未满足)）|\((?:固定|附魔|符文|破裂|工艺|褻瀆|亵渎|增幅|未滿足|未满足)\)/g, '').trim();
const numbers = (text: string): number[] => (text.replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, '').replace(/,/g, ' ')
  .replace(/(?<=\d)[-–](?=\d)/g, ' ').match(/[+-]?\d+(?:\.\d+)?/g) ?? []).map(Number);
const byName = new Map<string, ItemEntry[]>();
for (const item of index.items) for (const name of [item.en, item.zh]) {
  const key = normalize(name); const list = byName.get(key) ?? []; if (!list.includes(item)) list.push(item); byName.set(key, list);
}
const baseEntries = index.items.filter((i) => !i.base).sort((a, b) => Math.max(b.en.length, b.zh.length) - Math.max(a.en.length, a.zh.length));
const kindOf = (category: string, base?: ItemEntry): Equipment['kind'] => category === 'map.waystone' ? 'waystone' : category === 'map.tablet' ? 'tablet'
  : category.startsWith('map') ? 'map' : category.startsWith('currency') ? 'currency' : category.startsWith('gem') ? 'gem' : base?.group ? 'other' : 'equipment';
const slotOf = (category: string): EquipmentSlot => category.startsWith('weapon.') ? 'weapon'
  : ({ 'armour.chest': 'body', 'armour.helmet': 'helmet', 'armour.gloves': 'gloves', 'armour.boots': 'boots',
    'armour.shield': 'offhand', 'armour.buckler': 'offhand', 'armour.focus': 'offhand', 'armour.quiver': 'offhand',
    'accessory.ring': 'ring', 'accessory.amulet': 'amulet', 'accessory.belt': 'belt', jewel: 'jewel',
    flask: 'flask', 'flask.life': 'flask', 'flask.mana': 'flask', 'flask.charm': 'charm', 'sanctum.relic': 'relic' } as Record<string, EquipmentSlot>)[category] ?? 'other';
const classCategories: Record<string, string> = {};
for (const [category, names] of Object.entries({
  'accessory.ring': ['Rings', '戒指'], 'accessory.amulet': ['Amulets', '项链', '项鏈', '护身符', '護身符'], 'accessory.belt': ['Belts', '腰带', '腰帶'],
  'armour.chest': ['Body Armours', '胸甲'], 'armour.helmet': ['Helmets', '头盔', '頭盔'], 'armour.gloves': ['Gloves', '手套'], 'armour.boots': ['Boots', '鞋子', '长靴', '長靴'],
  'armour.shield': ['Shields', '盾牌'], 'armour.buckler': ['Bucklers', '圆盾', '圓盾'], 'armour.focus': ['Foci', '法器'], 'armour.quiver': ['Quivers', '箭袋'],
  'weapon.bow': ['Bows', '弓'], 'weapon.crossbow': ['Crossbows', '弩', '十字弓'], 'weapon.onemace': ['One Hand Maces', '单手锤', '單手錘'], 'weapon.twomace': ['Two Hand Maces', '双手锤', '雙手錘'],
  'weapon.oneaxe': ['One Hand Axes', '单手斧', '單手斧'], 'weapon.twoaxe': ['Two Hand Axes', '双手斧', '雙手斧'], 'weapon.onesword': ['One Hand Swords', '单手剑', '單手劍'], 'weapon.twosword': ['Two Hand Swords', '双手剑', '雙手劍'],
  'weapon.warstaff': ['Quarterstaves', '征战长杖', '征戰長杖', '长棍', '長棍'], 'weapon.staff': ['Staves', '长杖', '長杖'], 'weapon.wand': ['Wands', '法杖'], 'weapon.sceptre': ['Sceptres', '权杖', '權杖'],
  'weapon.spear': ['Spears', '长矛', '長矛'], 'weapon.talisman': ['Talismans', '魔符'], 'weapon.dagger': ['Daggers', '匕首'], 'weapon.flail': ['Flails', '连枷', '連枷'],
  'weapon.claw': ['Claws', '爪'], 'weapon.rod': ['Fishing Rods', 'FishingRods', '钓竿', '釣竿'],
  jewel: ['Jewels', '珠宝', '珠寶'], flask: ['Flasks', '药剂', '藥劑'], 'flask.life': ['Life Flasks', '生命药剂', '生命藥劑'], 'flask.mana': ['Mana Flasks', '魔力药剂', '魔力藥劑'],
  'flask.charm': ['Charms', '护符', '護符'], 'sanctum.relic': ['Relics', '圣物', '聖物'],
  'map.waystone': ['Waystones', 'Maps', '地图', '地圖', '换界石', '換界石'], 'map.tablet': ['Tablets', '碑牌', '石板'],
  'map.fragment': ['Map Fragments', '地图碎片', '地圖碎片'], 'map.breachstone': ['Breachstones', '裂痕石'],
  'map.logbook': ['Expedition Logbooks', '探险日志', '探險日誌'], 'map.bosskey': ['Pinnacle Keys', '巅峰钥匙', '巔峰鑰匙'],
  'map.barya': ['Baryas', '巨灵之币', '巨靈之幣', '试炼硬币', '試煉硬幣'], 'map.ultimatum': ['Ultimatum Keys', '最后通牒雕刻', '最後通牒雕刻'],
  currency: ['Currency', 'Stackable Currency', '通货', '通貨', '可堆叠通货', '可堆疊通貨'],
  'currency.omen': ['Omens', '预兆', '預兆'], 'currency.rune': ['Runes', '符文'], 'currency.soulcore': ['Soul Cores', '灵魂核心', '靈魂核心'],
  gem: ['Gems', 'Skill Gems', 'Support Gems', 'Meta Gems', 'Uncut Skill Gems', 'Uncut Support Gems', 'Uncut Spirit Gems', '技能宝石', '技能寶石', '辅助宝石', '輔助寶石', '未切割的技能宝石', '未切割的辅助宝石', '未切割的精魂宝石'],
  'gem.activegem': ['Skill Gems', 'Active Skill Gems', '技能宝石', '技能寶石'], 'gem.supportgem': ['Support Gems', 'Support Skill Gems', '辅助宝石', '輔助寶石'], 'gem.metagem': ['Meta Gems', 'Meta Skill Gems'],
})) for (const name of names) classCategories[normalize(name)] = category;

interface Compiled { stat: StatEntry; matcher: Matcher; pattern: RegExp }
const matchIndex = new Map<string, Compiled[]>();
const skeleton = (text: string): string => normalize(text).replace(/\+?#|[+-]?\d+(?:\.\d+)?/g, '#');
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const stat of index.stats) for (const matcher of stat.matchers) {
  const normalized = normalize(matcher.string);
  const pattern = new RegExp(`^${normalized.split('#').map(escape).join('([+-]?\\d+(?:\\.\\d+)?)')}$`, 'i');
  const key = skeleton(matcher.string); const list = matchIndex.get(key) ?? [];
  list.push({ stat, matcher, pattern }); matchIndex.set(key, list);
}
const displayMatchers = new Map<string, { english: Matcher; chinese: Matcher; pattern: RegExp }[]>();
for (const stat of displayVocabulary.stats) for (const english of stat.english as Matcher[]) {
  const chinese = (stat.chinese as Matcher[]).find((local) => Boolean(local.negate) === Boolean(english.negate)
    && (local.string.match(/#/g)?.length ?? 0) === (english.string.match(/#/g)?.length ?? 0));
  if (!chinese) continue;
  const key = skeleton(english.string), entries = displayMatchers.get(key) ?? [];
  entries.push({ english, chinese, pattern: new RegExp(`^${normalize(english.string).split('#').map(escape).join('([+-]?\\d+(?:\\.\\d+)?)')}$`, 'i') });
  displayMatchers.set(key, entries);
}
function displayOnlyStat(text: string): string {
  if (/^Bonded:\s*/i.test(text)) {
    const effect = text.replace(/^Bonded:\s*/i, '');
    const translated = parseMod(effect, 'display-only').label;
    if (translated !== effect) return `命定：${translated}`;
  }
  const labels = (displayMatchers.get(skeleton(text)) ?? []).flatMap(({ chinese, pattern }) => {
    const match = pattern.exec(normalize(text)); if (!match) return [];
    let position = 1;
    return [simplifyEquipmentText(chinese.string.replace(/#/g, () => match[position++]!))];
  });
  return new Set(labels).size === 1 ? labels[0]! : simplifyEquipmentText(text);
}
function origin(text: string): string | undefined {
  if (/\((?:implicit|固定)\)|（固定）/i.test(text)) return 'implicit';
  if (/\((?:rune|符文)\)|（符文）/i.test(text)) return 'rune';
  if (/\((?:enchant|附魔)\)|（附魔）/i.test(text)) return 'enchant';
  if (/\((?:fractured|破裂)\)|（破裂）/i.test(text)) return 'fractured';
  if (/\((?:desecrated|褻瀆|亵渎)\)|（(?:褻瀆|亵渎)）/i.test(text)) return 'desecrated';
  return undefined;
}
function parseMod(raw: string, key: string, originHint?: string): EquipmentMod {
  const text = clean(raw); const normalized = normalize(text);
  const matches = (matchIndex.get(skeleton(text)) ?? []).flatMap((entry) => {
    const match = entry.pattern.exec(normalized);
    return match ? [{ ...entry, values: match.slice(1).map(Number) }] : [];
  });
  const refs = new Set(matches.map((m) => m.stat.ref));
  const reference = poe2dbUnmappedStat(simplifyEquipmentText(text));
  if (!matches.length && reference) return { key, raw, text, ...reference, englishText: reference.ref, recognized: true,
    ids: [], values: [], searchable: false,
    warning: '已按 PoE2DB 确认是赋予技能标记；当前官方交易索引没有独立筛选，不将游戏内部编号当作交易编号。' };
  if (!matches.length || refs.size > 1) return { key, raw, text,
    label: text.includes('[PoB数值待游戏文本核对]')
      ? `${parseMod(text.replace(/\s*\[PoB数值待游戏文本核对\]/g, ''), 'display-only').label} [PoB数值待游戏文本核对]`
      : displayOnlyStat(text), ids: [], values: numbers(text), searchable: false,
    warning: text.includes('[PoB数值待游戏文本核对]') ? '此词缀带有 PoB 导入待核对标记，尚未用于数值搜索；可读取原始 PoB2 重新识别，不等于该词缀没有官方映射。'
      : matches.length ? '存在多种属性含义，未自动加入交易条件。' : '未匹配官方交易属性；保留原文，请在官网核对。' };
  const found = matches[0]!;
  const kind = origin(raw) ?? originHint;
  // Granted skills use an official namespace independent of affix placement.
  const selectedIds = found.stat.ids.skill ?? (kind ? found.stat.ids[kind] ?? [] : found.stat.ids.explicit ?? found.stat.ids.sanctum ?? found.stat.ids.implicit ?? []);
  // Alternate placements of the same scalar are OR aliases, never independent required filters.
  const ids = [...new Set(kind ? selectedIds : [...selectedIds, ...(found.stat.ids.fractured ?? []), ...(found.stat.ids.desecrated ?? [])])];
  const values = found.values.length ? found.values : found.matcher.value === undefined || !found.stat.ref.includes('#') ? [] : [found.matcher.value];
  const damageRange = /^Adds # to # .+ Damage/i.test(found.stat.ref);
  const scalar = values.length === 1 ? values[0]! * (found.matcher.negate ? -1 : 1)
    : values.length === 2 && damageRange ? (values[0]! + values[1]!) / 2 * (found.matcher.negate ? -1 : 1) : undefined;
  const englishVariants = found.stat.matchers.filter((matcher) => !/[\u3400-\u9fff]/u.test(matcher.string));
  const chineseVariants = found.stat.matchers.filter((matcher) => /[\u3400-\u9fff]/u.test(matcher.string));
  // Constant variants can share the same trade ID/value while describing different
  // ground combinations. Keep the matching bilingual variant, not the first one.
  const variant = !found.stat.ref.includes('#') && englishVariants.length === chineseVariants.length
    ? chineseVariants[englishVariants.indexOf(found.matcher)] : undefined;
  const chinese = variant ?? found.stat.matchers.find((matcher) => /[\u3400-\u9fff]/u.test(matcher.string)
    && Boolean(matcher.negate) === Boolean(found.matcher.negate)
    && (matcher.string.match(/#/g)?.length ?? 0) === found.values.length);
  const englishMatcher = !/[\u3400-\u9fff]/u.test(found.matcher.string) ? found.matcher
    : englishVariants.length === chineseVariants.length ? englishVariants[chineseVariants.indexOf(found.matcher)]
      : englishVariants.find((matcher) => Boolean(matcher.negate) === Boolean(found.matcher.negate)
        && (matcher.string.match(/#/g)?.length ?? 0) === found.values.length);
  let englishPosition = 0;
  const englishText = englishMatcher?.string.replace(/#/g, () => String(found.values[englishPosition++] ?? '#'));
  let position = 0;
  const label = !/[\u3400-\u9fff]/u.test(text) && chinese
    ? simplifyEquipmentText(chinese.string.replace(/#/g, () => String(found.values[position++]))) : simplifyEquipmentText(text);
  return { key, raw, text, label, ids, values, searchable: ids.length > 0, recognized: true,
    ...(englishText && !englishText.includes('#') ? { englishText } : {}),
    ...(poe2dbStatReference(found.stat.id) ? { referenceUrl: poe2dbStatReference(found.stat.id) } : {}),
    ...(scalar === undefined ? {} : { value: scalar }), ref: found.stat.ref, ...(found.stat.id ? { statId: found.stat.id } : {}),
    ...(!ids.length ? { warning: '此来源没有已核对的官方交易条件。' }
      : !found.stat.ref.includes('#') && englishVariants.length > 1 ? { warning: '官方条件仅确认此机制存在；具体地面组合等版本差异仍须核对物品原文。' }
      : values.length > 1 && scalar === undefined ? { warning: '多组数值的交易计算方式尚未核验；仅搜索是否存在。' } : {}) };
}

/** Display helpers preserve official listing facts; unmatched names/effects remain visible verbatim. */
export function localizeEquipmentName(name: string): string {
  return simplifyEquipmentText(byName.get(normalize(name))?.[0]?.zh ?? name);
}
/** Random rare/magic names are not a bilingual identifier in PoB. Show the verified base
 * with rarity, retaining the original name in tooltips/raw text instead of inventing a translation. */
export function equipmentDisplayName(item: Equipment): string {
  const name = localizeEquipmentName(item.name);
  if (/[\u3400-\u9fff]/u.test(name)) return name;
  const base = localizeEquipmentName(item.baseName);
  const rarity = { normal: '普通', magic: '魔法', rare: '稀有', unique: '传奇', currency: '通货', gem: '宝石', card: '卡片' }[item.rarity];
  return /[\u3400-\u9fff]/u.test(base) ? `${rarity}${base}` : name;
}
export function localizeEquipmentStat(text: string): string { return parseMod(text, 'display').label; }
/** Match a rendered rule-snapshot line to the same official scalar as a clipboard modifier. */
export function matchEquipmentStat(text: string): EquipmentMod { return parseMod(text, 'reference'); }

const propertyNames: [string, string, string[]][] = [
  ['ward', '符文保护', ['Ward', 'Runic Ward', '符文保护']],
  ['armour', '护甲', ['Armour', '护甲', '护甲值']], ['evasion', '闪避值', ['Evasion Rating', '闪避值', '闪避']], ['energyShield', '能量护盾', ['Energy Shield', '能量护盾']],
  ['physicalDamage', '物理伤害', ['Physical Damage', '物理伤害']], ['elementalDamage', '元素伤害', ['Elemental Damage', '元素伤害']], ['chaosDamage', '混沌伤害', ['Chaos Damage', '混沌伤害']],
  ['attacksPerSecond', '每秒攻击次数', ['Attacks per Second', '每秒攻击次数', '每秒攻击速度']], ['criticalHitChance', '暴击率', ['Critical Hit Chance', '暴击几率', '暴击率']],
  ['spirit', '精魂', ['Spirit', '精魂']], ['block', '格挡率', ['Block chance', 'Chance to Block', '格挡几率', '格挡率']], ['quality', '品质', ['Quality', '品质']],
  ['mapBonus', '换界石掉落概率', ['Waystone Drop Chance', '换界石掉落机率', '换界石掉落几率', '换界石掉落概率']],
  ['mapPacksize', '怪物群大小', ['Monster Pack Size', 'Pack Size', '怪物群大小']],
];
const propertiesByLabel = new Map(propertyNames.flatMap(([name, label, aliases]) => aliases.map((alias) => [normalize(alias), { name, label }] as const)));
export function localizeEquipmentProperty(text: string): string {
  const colon = text.search(/[:：]/);
  const property = colon > 0 ? propertiesByLabel.get(normalize(text.slice(0, colon))) : undefined;
  return property ? `${property.label}：${text.slice(colon + 1).trim()}` : simplifyEquipmentText(text);
}
const ignoredLine = (line: string): boolean => /^(?:Requirements|需求|需要|需求等级|Level|等级|Strength|力量|Dexterity|敏捷|Intelligence|智慧|智力|Rune:|Sockets|插槽|孔|Item Level|物品等级|物品等級|Limited to|限定|Radius|半径|半徑|Unidentified|未鉴定|未鑑定|Corrupted|已腐化|已污染|Mirrored|已复制|已複製|Split|分裂|Note|备注|備註|Right click|右键|右鍵|Place into|放置|Can only|只能|Currently|目前|You cannot|你无法|你無法|Uses? |消耗|Charges|充能|Consumes|持续|持續|Recovers|回复|回復|恢复|恢復|Lasts|持续时间|持續時間|Charm Slots|护符栏位|護符欄位|Requires|需要)/i.test(line)
  || /^\{|^\}|^[\d\s,]+(?:\(.*\))?$/.test(line);

/** Parse any indexed tradeable equipment. No crafting tiers or crafting modifier pool are consulted. */
export function parseEquipment(raw: string): Equipment | null {
  const lines = raw.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  const rarityAt = lines.findIndex((line) => /^(?:Rarity|稀有度)[:：]/i.test(line));
  if (rarityAt < 0) return null;
  const rarityText = normalize(lines[rarityAt]!.split(/[:：]/).slice(1).join(':'));
  const rarity = /unique|传奇|独特/.test(rarityText) ? 'unique' : /rare|稀有/.test(rarityText) ? 'rare' : /magic|魔法/.test(rarityText) ? 'magic' : /normal|普通/.test(rarityText) ? 'normal'
    : /currency|通货/.test(rarityText) ? 'currency' : /gem|宝石/.test(rarityText) ? 'gem' : /divination|命运卡/.test(rarityText) ? 'card' : undefined;
  if (!rarity) return null;
  const header: string[] = [];
  for (let i = rarityAt + 1; i < lines.length && !/^-{3,}$/.test(lines[i]!); i++) header.push(lines[i]!);
  if (!header.length) return null;
  const classLine = lines.find((line) => /^(?:Item Class|物品类别|物品類別|物品種類|物品种类|物品类型|物品類型)[:：]/i.test(line));
  const classCategory = classLine ? classCategories[normalize(classLine.split(/[:：]/).slice(1).join(':'))] : undefined;
  const unique = rarity === 'unique' ? header.flatMap((line) => byName.get(normalize(line)) ?? []).find((item) => item.base) : undefined;
  let candidates = header.flatMap((line) => byName.get(normalize(line)) ?? []).filter((item) => !item.base);
  if (classCategory && candidates.some((item) => item.category === classCategory)) candidates = candidates.filter((item) => item.category === classCategory);
  const exactEnglish = candidates.filter((item) => header.some((line) => normalize(line) === normalize(item.en)));
  if (exactEnglish.length) candidates = exactEnglish;
  const distinct = [...new Map(candidates.map((item) => [item.en, item])).values()];
  const ambiguous = distinct.length > 1 && distinct.every((item) => item.group);
  let base = ambiguous ? undefined : candidates[0];
  if (!base && unique) base = byName.get(normalize(unique.base!))?.find((i) => !i.base);
  if (!base && rarity === 'magic') base = baseEntries.find((item) => header.some((line) => normalize(line).includes(normalize(item.en)) || normalize(line).includes(normalize(item.zh))));
  // The class says Waystone, but some clients print its tier only in the property block.
  const tierMatch = raw.match(/(?:Waystone Tier|Map Tier|地图阶级|地圖階級|换界石阶级|換界石階級|阶级|階級)[:：]\s*(\d+)/i);
  const tier = tierMatch ? Number(tierMatch[1]) : undefined;
  if (!base && tier !== undefined && header.some((line) => /waystone|换界石/i.test(simplifyEquipmentText(line)))) base = baseEntries.find((item) => item.category === 'map.waystone' && item.mapTier === tier);
  const category = unique?.category ?? base?.category ?? classCategory ?? (ambiguous ? distinct[0]?.category : undefined);
  if (category === undefined) return null;
  const kind = kindOf(category, base ?? unique);
  const warnings: string[] = [];
  if (!base) warnings.push(ambiguous ? '此中文名称对应多件官方物品，请先选择准确名称后查价。' : kind === 'equipment' ? '底座尚未收录，搜索仅限定装备类别；请在官网核对底座。' : '物品官方名称尚未匹配，暂不生成整个类别的估价。');
  if (rarity === 'unique' && !unique) warnings.push('传奇名称尚未匹配英文索引；搜索仅限定已识别底座与传奇稀有度。');
  const properties: EquipmentProperty[] = []; const modLines: string[] = [];
  const descriptionText: string[] = [];
  const printedNumber = (pattern: RegExp): number | undefined => { const match = raw.match(pattern); return match ? Number(match[1]!.replace(/,/g, '')) : undefined; };
  const quality = printedNumber(/(?:^|\n)(?:Quality|品質|品质)(?:[（(][^\n:：]*[）)])?[:：]\s*\+?(\d+)/i);
  const gemLevel = kind === 'gem' ? printedNumber(/(?:^|\n)(?:Level|等級|等级)[:：]\s*(\d+)/i) : undefined;
  const areaLevel = printedNumber(/(?:^|\n)(?:Area Level|區域等級|区域等级)[:：]\s*(\d+)/i);
  const stackSize = printedNumber(/(?:Stack Size|堆疊數量|堆叠数量)[:：]\s*([\d,]+)/i);
  const origins = new Map<number, string>(); let currentOrigin: string | undefined;
  const affixTypes = new Map<number, 'prefix' | 'suffix'>(); let currentAffixType: 'prefix' | 'suffix' | undefined;
  const affixGroups = new Map<number, number>(); let currentAffixGroup: number | undefined; let nextAffixGroup = 0;
  const flavourText: string[] = [], stateText: string[] = [];
  const originalBody = lines.slice(rarityAt + 1 + header.length);
  let seenAdvancedAffix = false;
  const body: string[] = [];
  const isDoubleCorrupted = (line: string) => /^(?:double\s+corrupted|twice\s+corrupted|双重\s*(?:corrupted|腐化|污染)|双重已腐化|双重已污染)$/i.test(simplifyEquipmentText(line));
  for (const section of originalBody.join('\n').split(/(?:^|\n)-{3,}(?:\n|$)/)) {
    const block = section.split('\n').filter(Boolean);
    const advanced = block.some((line) => /^\{/.test(line));
    const content = block.filter((line) => {
      if (isDoubleCorrupted(line)) { stateText.push('双重腐化'); return false; }
      if (/^(?:Sanctified|(?:已)?圣化)$/i.test(simplifyEquipmentText(line))) { stateText.push('已圣化'); return false; }
      if (/^(?:Fractured Item|破裂之物)$/i.test(line)) { stateText.push('破裂之物'); return false; }
      return true;
    });
    const candidates = content.filter((line) => !ignoredLine(simplifyEquipmentText(line)));
    const known = candidates.some((line) => { const mod = parseMod(line, 'section'); return mod.searchable || mod.recognized; })
      || candidates.length > 1 && parseMod(candidates.join('\n'), 'section').searchable;
    const flavour = rarity === 'unique' && !advanced && !known && candidates.length > 0
      && (seenAdvancedAffix && candidates.every((line) => !/\d/.test(line)) || /^["“「『]/.test(candidates[0]!));
    if (flavour) flavourText.push(...candidates.map(simplifyEquipmentText));
    else body.push(...content, '--------');
    if (advanced) seenAdvancedAffix = true;
  }
  for (const line of body) {
    if (/^-{3,}$/.test(line)) { modLines.push(''); currentOrigin = undefined; currentAffixType = undefined; currentAffixGroup = undefined; continue; }
    if (/^\{/.test(line)) {
      const metadata = simplifyEquipmentText(line);
      currentAffixType = /prefix|前缀/i.test(metadata) ? 'prefix' : /suffix|后缀/i.test(metadata) ? 'suffix' : undefined;
      currentAffixGroup = nextAffixGroup++;
      currentOrigin = /implicit|固定/i.test(metadata) ? 'implicit' : /fractured|破裂/i.test(metadata) ? 'fractured'
        : /rune|符文/i.test(metadata) ? 'rune' : /enchant|附魔/i.test(metadata) ? 'enchant'
          : /desecrated|亵渎/i.test(metadata) ? 'desecrated' : /crafted|工艺/i.test(metadata) ? 'crafted' : undefined;
      continue;
    }
    if (kind !== 'equipment' && /^(?:Can be used|Place this|Travel to|在.*(?:地图装置|地圖裝置)|透過.*(?:地图|地圖)|通过.*地图|右键|右鍵)/i.test(line)
      && !parseMod(line, 'instruction', currentOrigin).searchable) { descriptionText.push(simplifyEquipmentText(line)); continue; }
    if (kind !== 'equipment' && /^(?:Waystone Tier|Map Tier|换界石阶级|換界石階級|地图阶级|地圖階級|階級|阶级|Stack Size|堆疊數量|堆叠数量|Area Level|區域等級|区域等级|Gem Level|宝石等级|寶石等級|Quality|品質|品质)[:：]/i.test(line)) continue;
    const colon = line.search(/[:：]/);
    const property = colon > 0 ? propertiesByLabel.get(normalize(line.slice(0, colon).replace(/[（(][^（）()]*[）)]/g, ''))) : undefined;
    if (property) { properties.push({ ...property, text: line, values: numbers(clean(line.slice(colon + 1))) }); continue; }
    if ((kind === 'currency' || kind === 'gem' || kind === 'other') && !parseMod(line, 'description', currentOrigin).searchable) { descriptionText.push(simplifyEquipmentText(line)); continue; }
    if (ignoredLine(simplifyEquipmentText(line)) && !parseMod(line, 'ignored-check', currentOrigin).searchable) continue;
    if (currentOrigin) origins.set(modLines.length, currentOrigin);
    if (currentAffixType) affixTypes.set(modLines.length, currentAffixType);
    if (currentAffixGroup !== undefined) affixGroups.set(modLines.length, currentAffixGroup);
    modLines.push(line);
  }
  const mods: EquipmentMod[] = [];
  for (let i = 0; i < modLines.length; i++) {
    if (!modLines[i]) continue;
    let best = parseMod(modLines[i]!, String(i), origins.get(i)); let consumed = 0;
    // A few game stats wrap to two/three clipboard lines. Preserve one official scalar per stat.
    for (let count = 2; count <= 4 && modLines.slice(i, i + count).length === count && modLines.slice(i, i + count).every(Boolean); count++) {
      if (modLines.slice(i, i + count).some((_, offset) => origins.get(i + offset) !== origins.get(i))) break;
      if (modLines.slice(i, i + count).some((_, offset) => affixGroups.get(i + offset) !== affixGroups.get(i))) break;
      const joined = parseMod(modLines.slice(i, i + count).join('\n'), String(i), origins.get(i));
      if (joined.searchable) { best = joined; consumed = count - 1; }
    }
    if (affixTypes.has(i)) best.affixType = affixTypes.get(i);
    if (affixGroups.has(i)) best.affixGroup = affixGroups.get(i);
    mods.push(best); i += consumed;
  }
  // S identifies an augment socket, not its occupancy. PoB enumerates Rune: None
  // for empty sockets; only a complete enumeration can establish the filled count.
  const socketLine = lines.find((line) => /^(?:Sockets|插槽)[:：]/i.test(line));
  const tokens = socketLine?.split(/[:：]/).slice(1).join(':').trim().split(/\s+/) ?? [];
  const socketCount = tokens.length > 0 && tokens.length <= 6 && tokens.every((token) => token === 'S') ? tokens.length : undefined;
  const runes = lines.filter((line) => /^Rune:/i.test(line)).map((line) => line.slice(line.indexOf(':') + 1).trim());
  const filled = socketCount !== undefined && runes.length === socketCount && runes.every(Boolean)
    ? runes.filter((rune) => !/^(?:None|Empty)$/i.test(rune)).length : undefined;
  const itemLevelMatch = raw.match(/(?:Item Level|物品等级|物品等級)[:：]\s*(\d+)/i);
  const missing = mods.filter((mod) => !mod.searchable && !mod.recognized).length;
  if (missing) warnings.push(`${missing} 条文字尚未成为可搜索属性，估价条件不代表完整装备。`);
  const recognizedOnly = mods.filter((mod) => !mod.searchable && mod.recognized).length;
  if (recognizedOnly) warnings.push(`${recognizedOnly} 项效果已识别，但无独立交易条件；仍需核对机制与组合价值。`);
  return { raw, name: header[0]!, baseName: base ? (header.find((line) => normalize(line) === normalize(base.en) || normalize(line) === normalize(base.zh)) ?? base.zh) : header[header.length - 1]!,
    ...(base ? { baseNameEnglish: base.en } : {}), ...(unique ? { nameEnglish: unique.en } : {}), category, slot: slotOf(category), rarity,
    ...(stateText.includes('已圣化') ? { sanctified: true } : {}),
    ...((unique?.icon ?? base?.icon) ? { icon: unique?.icon ?? base?.icon } : {}), ...(itemLevelMatch ? { itemLevel: Number(itemLevelMatch[1]) } : {}),
    ...(socketCount === undefined ? {} : { sockets: { count: socketCount, ...(filled === undefined ? {} : { filled }) } }),
    identified: !/(?:^|\n)\s*(?:Unidentified|未鉴定|未鑑定)\s*(?:\r?\n|$)/i.test(raw), corrupted: stateText.includes('双重腐化') || /(?:^|\n)(?:Corrupted|已腐化|已污染|已汙染)(?:\r?\n|$)/i.test(raw),
    ...(stateText.includes('双重腐化') ? { doubleCorrupted: true } : {}), ...(flavourText.length ? { flavourText } : {}), ...(stateText.length ? { stateText } : {}),
    kind, ...(kind === 'waystone' && (tier ?? base?.mapTier) !== undefined ? { mapTier: tier ?? base?.mapTier } : {}),
    ...(ambiguous ? { officialTypeCandidates: distinct.map((item) => ({ type: item.en, category: item.category })) } : {}),
    ...(gemLevel === undefined ? {} : { gemLevel }), ...(quality === undefined ? {} : { quality }), ...(areaLevel === undefined ? {} : { areaLevel }),
    ...(stackSize === undefined ? {} : { stackSize }), ...(descriptionText.length ? { descriptionText } : {}),
    twoHanded: /weapon\.(?:two|bow|crossbow|staff|warstaff|talisman)/.test(category), properties, mods, warnings };
}

export interface EquipmentMetricContext { filledSockets?: number }
const socketMetrics: Record<string, readonly string[]> = {
  '# to maximum Life': ['life'], '# to maximum Mana': ['mana'], '# to Spirit': ['spirit'],
  '# to all Attributes': ['strength', 'dexterity', 'intelligence'],
  '#% to all Elemental Resistances': ['fireResistance', 'coldResistance', 'lightningResistance'],
  '#% to Chaos Resistance': ['chaosResistance'],
  '# Life Regeneration per second': ['lifeRegeneration'],
  '#% increased Global Armour, Evasion and Energy Shield': ['globalArmourPercent', 'globalEvasionPercent', 'globalEnergyShieldPercent'],
  '#% increased Maximum Life': ['lifePercent'], '#% increased Maximum Mana': ['manaPercent'],
};
export const hasSocketScaling = (item: Equipment): boolean => item.mods.some((mod) => mod.ref?.endsWith(' per Socket filled'));
export function occupiedSockets(equipment: Equipment, context: EquipmentMetricContext = {}): number | undefined {
  const count = context.filledSockets ?? equipment.sockets?.filled;
  return count !== undefined && Number.isInteger(count) && count >= 0 && count <= (equipment.sockets?.count ?? -1) ? count : undefined;
}
/** Printed local defence already includes quality and runes. Socket scaling needs a known occupancy;
 * global increased-percent bonuses remain separate from flat item defence and final character totals. */
export function equipmentMetricDetails(equipment: Equipment, context: EquipmentMetricContext = {}): {
  values: Record<string, number>; uncounted: string[]; pending: string[]; explanations: string[];
  effects: { key: string; label: string; note: string; referenceUrl?: string }[];
} {
  const values: Record<string, number> = {}; const uncounted: string[] = [], pending: string[] = [], explanations: string[] = [];
  const filled = occupiedSockets(equipment, context);
  const add = (key: string, value: number) => { values[key] = (values[key] ?? 0) + value; };
  const hasProperty = (name: string) => equipment.properties.some((property) => property.name === name);
  const printedSpirit = hasProperty('spirit');
  const absorbedLocal = (mod: EquipmentMod): boolean => {
    const id = mod.statId ?? '';
    // The game's per-socket global modifiers also start with local_. The prefix alone
    // does not mean the modifier is reflected in the item's printed defence.
    if (mod.ref?.includes('Global') || mod.ref?.includes('per Socket filled')) return false;
    if (mod.ref === '# to maximum Energy Shield' && equipment.category.startsWith('armour.')) return hasProperty('energyShield');
    if (!id.startsWith('local_')) return false;
    if (/physical_damage_reduction_rating/.test(id)) return hasProperty('armour');
    if (/evasion/.test(id)) return hasProperty('evasion');
    if (/energy_shield/.test(id)) return hasProperty('energyShield');
    if (/attack_speed/.test(id)) return hasProperty('attacksPerSecond');
    if (/physical_damage|added_physical_damage/.test(id)) return hasProperty('physicalDamage');
    if (/added_(?:fire|cold|lightning)_damage|elemental_damage/.test(id)) return hasProperty('elementalDamage');
    if (/added_chaos_damage/.test(id)) return hasProperty('chaosDamage');
    return false;
  };
  for (const property of equipment.properties) if (['armour', 'evasion', 'energyShield', 'spirit', 'block'].includes(property.name) && property.values[0] !== undefined) values[property.name] = property.values[0];
  const aps = equipment.properties.find((p) => p.name === 'attacksPerSecond')?.values[0];
  if (equipment.slot === 'weapon' && !aps) pending.push('physicalDps', 'elementalDps', 'totalDps');
  else if (equipment.slot === 'weapon' && !hasProperty('physicalDamage')) pending.push('physicalDps', 'totalDps');
  if (aps) {
    for (const [property, key] of [['physicalDamage', 'physicalDps'], ['elementalDamage', 'elementalDps'], ['chaosDamage', 'chaosDps']] as const) {
      const damage = equipment.properties.find((p) => p.name === property)?.values;
      if (damage?.length) values[key] = damage.reduce((a, b) => a + b, 0) / 2 * aps;
    }
    values.totalDps = (values.physicalDps ?? 0) + (values.elementalDps ?? 0) + (values.chaosDps ?? 0);
    if (!hasProperty('elementalDamage') && equipment.mods.some((mod) => /^Adds # to # (?:Fire|Cold|Lightning) Damage$/i.test(mod.ref ?? ''))) {
      pending.push('elementalDps', 'totalDps'); delete values.totalDps;
    }
  }
  const simple: Record<string, string> = { '# to maximum Life': 'life', '# to maximum Mana': 'mana', '# to Spirit': 'spirit',
    '# to maximum Energy Shield': 'energyShield', '# to Armour': 'armour', '# to Evasion Rating': 'evasion',
    '# to Strength': 'strength', '# to Dexterity': 'dexterity', '# to Intelligence': 'intelligence', '#% increased Movement Speed': 'movementSpeed',
    '#% to Fire Resistance': 'fireResistance', '#% to Cold Resistance': 'coldResistance', '#% to Lightning Resistance': 'lightningResistance', '#% to Chaos Resistance': 'chaosResistance' };
  for (const mod of equipment.mods) {
    const value = mod.value; const ref = mod.ref ?? '';
    const metric = simple[ref];
    if (value === undefined) { uncounted.push(mod.raw); continue; }
    if (ref.endsWith(' per Socket filled')) {
      const baseRef = ref.replace(/^\+/, '').replace(/ per Socket filled$/, '');
      const keys = socketMetrics[baseRef];
      if (!keys || filled === undefined) { uncounted.push(mod.raw); if (keys) pending.push(...keys); continue; }
      const total = Math.round(value * filled * 1e6) / 1e6;
      for (const key of keys) { if (key !== 'spirit' || !printedSpirit) add(key, total); }
      explanations.push(`${mod.label}：${value} × ${filled} 个已镶嵌插槽 = ${total}${baseRef.includes('%') ? '%' : ''}`);
      continue;
    }
    if (ref === '#% increased Global Armour, Evasion and Energy Shield') {
      for (const key of ['globalArmourPercent', 'globalEvasionPercent', 'globalEnergyShieldPercent']) add(key, value);
      continue;
    }
    if (ref === '# Life Regeneration per second' || ref === 'Regenerate # Life per second') { add('lifeRegeneration', value); continue; }
    if (absorbedLocal(mod)) continue;
    if (metric) { if (metric !== 'spirit' || !printedSpirit) add(metric, value); continue; }
    if (ref === '# to all Attributes') { for (const key of ['strength', 'dexterity', 'intelligence']) add(key, value); continue; }
    if (ref === '#% to all Elemental Resistances') { for (const key of ['fireResistance', 'coldResistance', 'lightningResistance']) add(key, value); continue; }
    if (/^#(?:% to| to) (?:Fire|Cold|Lightning|Chaos|Strength|Dexterity|Intelligence)(?: and (?:Fire|Cold|Lightning|Chaos|Strength|Dexterity|Intelligence))(?: Resistances)?$/.test(ref)) {
      for (const [term, key] of [['Fire', 'fireResistance'], ['Cold', 'coldResistance'], ['Lightning', 'lightningResistance'], ['Chaos', 'chaosResistance'], ['Strength', 'strength'], ['Dexterity', 'dexterity'], ['Intelligence', 'intelligence']]) if (ref.includes(term!)) add(key!, value);
      continue;
    }
    uncounted.push(mod.raw);
  }
  const effects = equipment.mods.filter((mod) => uncounted.includes(mod.raw) && (mod.searchable || mod.recognized)).map((mod) => ({
    key: mod.key, label: mod.label,
    note: mod.ref === '#% increased Damage for each type of Elemental Ailment on Enemy' && mod.value !== undefined
      ? `条件伤害增幅 = ${mod.value}% × 敌人实际承受的元素异常种类数；与其他伤害增加相加，不是无条件的最终 DPS 提升。`
      : mod.ref?.startsWith('Wind Skills') ? '已识别并保留疾风技能的地面强化机制；需要主技能与流派条件才能计算收益。'
        : '效果已识别，需结合技能、天赋或生效条件计算；未当作零收益，也未直接加到基础属性。',
    ...(mod.referenceUrl ? { referenceUrl: mod.referenceUrl } : {}),
  }));
  return { values, uncounted, pending: [...new Set(pending)], explanations, effects };
}
export const equipmentMetrics = (equipment: Equipment): Record<string, number> => equipmentMetricDetails(equipment).values;
