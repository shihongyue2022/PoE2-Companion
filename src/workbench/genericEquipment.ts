import source from './data/equipment-index.json';

export type EquipmentSlot = 'weapon' | 'offhand' | 'helmet' | 'body' | 'gloves' | 'boots' | 'ring' | 'amulet' | 'belt' | 'jewel' | 'flask' | 'charm' | 'relic' | 'other';
export interface EquipmentProperty { name: string; label: string; values: number[]; text: string }
export interface EquipmentMod {
  key: string; raw: string; text: string; label: string; ids: string[]; values: number[];
  searchable: boolean; value?: number; warning?: string; ref?: string; statId?: string;
}
export interface Equipment {
  raw: string; name: string; baseName: string; baseNameEnglish?: string; nameEnglish?: string;
  category: string; slot: EquipmentSlot; rarity: 'normal' | 'magic' | 'rare' | 'unique'; icon?: string;
  itemLevel?: number; identified: boolean; corrupted: boolean; twoHanded: boolean;
  properties: EquipmentProperty[]; mods: EquipmentMod[]; warnings: string[];
}
interface ItemEntry { en: string; zh: string; category: string; base?: string; icon?: string }
interface Matcher { string: string; negate?: boolean; value?: number }
interface StatEntry { ref: string; id?: string; matchers: Matcher[]; ids: Record<string, string[]> }
interface Index { categories: string[]; simplify: Record<string, string>; items: ItemEntry[]; stats: StatEntry[] }
const rawIndex = source as unknown as Index;
// Some unreleased bases have no localized name. Keep their verified English entry without
// passing a missing translation into Unicode normalization or discarding the whole catalogue.
const index: Index = { ...rawIndex, items: rawIndex.items.filter((item) => typeof item.en === 'string')
  .map((item) => ({ ...item, zh: typeof item.zh === 'string' ? item.zh : item.en })) };
export const EQUIPMENT_TRADE_CATEGORIES: readonly string[] = index.categories;
/** OpenCC character conversion only: translations still come from the pinned game vocabulary. */
export const simplifyEquipmentText = (text: string): string => [...text].map((c) => index.simplify[c] ?? c).join('');
const normalize = (text: string): string => simplifyEquipmentText(text).toLowerCase().replace(/[\u00a0\s]/g, '').replace(/[：]/g, ':').replace(/[，]/g, ',').replace(/[−–]/g, '-');
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
  if (!matches.length || refs.size > 1) return { key, raw, text, label: simplifyEquipmentText(text), ids: [], values: numbers(text), searchable: false,
    warning: matches.length ? '存在多种属性含义，未自动加入交易条件。' : '未匹配官方交易属性；保留原文，请在官网核对。' };
  const found = matches[0]!;
  const kind = origin(raw) ?? originHint;
  const selectedIds = kind ? found.stat.ids[kind] ?? [] : found.stat.ids.explicit ?? found.stat.ids.sanctum ?? found.stat.ids.implicit ?? [];
  // Alternate placements of the same scalar are OR aliases, never independent required filters.
  const ids = [...new Set(kind ? selectedIds : [...selectedIds, ...(found.stat.ids.fractured ?? []), ...(found.stat.ids.desecrated ?? [])])];
  const values = found.values.length ? found.values : found.matcher.value === undefined ? [] : [found.matcher.value];
  const damageRange = /^Adds # to # .+ Damage/.test(found.stat.ref);
  const scalar = values.length === 1 ? values[0]! * (found.matcher.negate ? -1 : 1)
    : values.length === 2 && damageRange ? (values[0]! + values[1]!) / 2 * (found.matcher.negate ? -1 : 1) : undefined;
  const chinese = found.stat.matchers.find((matcher) => /[\u3400-\u9fff]/u.test(matcher.string)
    && Boolean(matcher.negate) === Boolean(found.matcher.negate)
    && (matcher.string.match(/#/g)?.length ?? 0) === found.values.length);
  let position = 0;
  const label = chinese && (found.values.length <= 1 || damageRange)
    ? simplifyEquipmentText(chinese.string.replace(/#/g, () => String(found.values[position++]))) : simplifyEquipmentText(text);
  return { key, raw, text, label, ids, values, searchable: ids.length > 0,
    ...(scalar === undefined ? {} : { value: scalar }), ref: found.stat.ref, ...(found.stat.id ? { statId: found.stat.id } : {}),
    ...(!ids.length ? { warning: '此来源没有已核对的官方交易条件。' }
      : values.length > 1 && scalar === undefined ? { warning: '多组数值的交易计算方式尚未核验；仅搜索是否存在。' } : {}) };
}

/** Display helpers preserve official listing facts; unmatched names/effects remain visible verbatim. */
export function localizeEquipmentName(name: string): string {
  return simplifyEquipmentText(byName.get(normalize(name))?.[0]?.zh ?? name);
}
export function localizeEquipmentStat(text: string): string { return parseMod(text, 'display').label; }

const propertyNames: [string, string, string[]][] = [
  ['armour', '护甲', ['Armour', '护甲']], ['evasion', '闪避值', ['Evasion Rating', '闪避值', '闪避']], ['energyShield', '能量护盾', ['Energy Shield', '能量护盾']],
  ['physicalDamage', '物理伤害', ['Physical Damage', '物理伤害']], ['elementalDamage', '元素伤害', ['Elemental Damage', '元素伤害']], ['chaosDamage', '混沌伤害', ['Chaos Damage', '混沌伤害']],
  ['attacksPerSecond', '每秒攻击次数', ['Attacks per Second', '每秒攻击次数', '每秒攻击速度']], ['criticalHitChance', '暴击率', ['Critical Hit Chance', '暴击几率', '暴击率']],
  ['spirit', '精魂', ['Spirit', '精魂']], ['block', '格挡率', ['Block chance', 'Chance to Block', '格挡几率', '格挡率']], ['quality', '品质', ['Quality', '品质']],
];
const propertiesByLabel = new Map(propertyNames.flatMap(([name, label, aliases]) => aliases.map((alias) => [normalize(alias), { name, label }] as const)));
export function localizeEquipmentProperty(text: string): string {
  const colon = text.search(/[:：]/);
  const property = colon > 0 ? propertiesByLabel.get(normalize(text.slice(0, colon))) : undefined;
  return property ? `${property.label}：${text.slice(colon + 1).trim()}` : simplifyEquipmentText(text);
}
const ignoredLine = (line: string): boolean => /^(?:Requirements|需求|需要|需求等级|Level|等级|Strength|力量|Dexterity|敏捷|Intelligence|智慧|智力|Sockets|插槽|孔|Item Level|物品等级|物品等級|Limited to|限定|Radius|半径|半徑|Unidentified|未鉴定|未鑑定|Corrupted|已腐化|已污染|Mirrored|已复制|已複製|Split|分裂|Note|备注|備註|Right click|右键|右鍵|Place into|放置|Can only|只能|Currently|目前|You cannot|你无法|你無法|Uses? |消耗|Charges|充能|Consumes|持续|持續|Recovers|回复|回復|恢复|恢復|Lasts|持续时间|持續時間|Charm Slots|护符栏位|護符欄位|Requires|需要)/i.test(line)
  || /^\{|^\}|^[\d\s,]+(?:\(.*\))?$/.test(line);

/** Parse any indexed tradeable equipment. No crafting tiers or crafting modifier pool are consulted. */
export function parseEquipment(raw: string): Equipment | null {
  const lines = raw.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  const rarityAt = lines.findIndex((line) => /^(?:Rarity|稀有度)[:：]/i.test(line));
  if (rarityAt < 0) return null;
  const rarityText = normalize(lines[rarityAt]!.split(/[:：]/).slice(1).join(':'));
  const rarity = /unique|传奇|独特/.test(rarityText) ? 'unique' : /rare|稀有/.test(rarityText) ? 'rare' : /magic|魔法/.test(rarityText) ? 'magic' : /normal|普通/.test(rarityText) ? 'normal' : undefined;
  if (!rarity) return null;
  const header: string[] = [];
  for (let i = rarityAt + 1; i < lines.length && !/^-{3,}$/.test(lines[i]!); i++) header.push(lines[i]!);
  if (!header.length) return null;
  const unique = rarity === 'unique' ? header.flatMap((line) => byName.get(normalize(line)) ?? []).find((item) => item.base) : undefined;
  let base = header.flatMap((line) => byName.get(normalize(line)) ?? []).find((item) => !item.base);
  if (!base && unique) base = byName.get(normalize(unique.base!))?.find((i) => !i.base);
  if (!base && rarity === 'magic') base = baseEntries.find((item) => header.some((line) => normalize(line).includes(normalize(item.en)) || normalize(line).includes(normalize(item.zh))));
  const classLine = lines.find((line) => /^(?:Item Class|物品类别|物品類別|物品種類|物品种类|物品类型|物品類型)[:：]/i.test(line));
  const classCategory = classLine ? classCategories[normalize(classLine.split(/[:：]/).slice(1).join(':'))] : undefined;
  const category = unique?.category ?? base?.category ?? classCategory;
  if (!category) return null;
  const warnings: string[] = [];
  if (!base) warnings.push('底座尚未收录，搜索仅限定装备类别；请在官网核对底座。');
  if (rarity === 'unique' && !unique) warnings.push('传奇名称尚未匹配英文索引；搜索仅限定已识别底座与传奇稀有度。');
  const properties: EquipmentProperty[] = []; const modLines: string[] = [];
  const origins = new Map<number, string>(); let currentOrigin: string | undefined;
  const body = lines.slice(rarityAt + 1 + header.length);
  for (const line of body) {
    if (/^-{3,}$/.test(line)) { modLines.push(''); currentOrigin = undefined; continue; }
    if (/^\{/.test(line)) {
      const metadata = simplifyEquipmentText(line);
      currentOrigin = /implicit|固定/i.test(metadata) ? 'implicit' : /fractured|破裂/i.test(metadata) ? 'fractured'
        : /rune|符文/i.test(metadata) ? 'rune' : /enchant|附魔/i.test(metadata) ? 'enchant'
          : /desecrated|亵渎/i.test(metadata) ? 'desecrated' : /crafted|工艺/i.test(metadata) ? 'crafted' : undefined;
      continue;
    }
    const colon = line.search(/[:：]/);
    const property = colon > 0 ? propertiesByLabel.get(normalize(line.slice(0, colon).replace(/[（(][^（）()]*[）)]/g, ''))) : undefined;
    if (property) { properties.push({ ...property, text: line, values: numbers(clean(line.slice(colon + 1))) }); continue; }
    if (ignoredLine(simplifyEquipmentText(line))) continue;
    if (currentOrigin) origins.set(modLines.length, currentOrigin);
    modLines.push(line);
  }
  const mods: EquipmentMod[] = [];
  for (let i = 0; i < modLines.length; i++) {
    if (!modLines[i]) continue;
    let best = parseMod(modLines[i]!, String(i), origins.get(i)); let consumed = 0;
    // A few game stats wrap to two/three clipboard lines. Preserve one official scalar per stat.
    for (let count = 2; count <= 4 && modLines.slice(i, i + count).length === count && modLines.slice(i, i + count).every(Boolean); count++) {
      if (modLines.slice(i, i + count).some((_, offset) => origins.get(i + offset) !== origins.get(i))) break;
      const joined = parseMod(modLines.slice(i, i + count).join('\n'), String(i), origins.get(i));
      if (joined.searchable) { best = joined; consumed = count - 1; }
    }
    mods.push(best); i += consumed;
  }
  const itemLevelMatch = raw.match(/(?:Item Level|物品等级|物品等級)[:：]\s*(\d+)/i);
  const missing = mods.filter((mod) => !mod.searchable).length;
  if (missing) warnings.push(`${missing} 条文字尚未成为可搜索属性，估价条件不代表完整装备。`);
  return { raw, name: header[0]!, baseName: base ? (header.find((line) => normalize(line) === normalize(base.en) || normalize(line) === normalize(base.zh)) ?? base.zh) : header[header.length - 1]!,
    ...(base ? { baseNameEnglish: base.en } : {}), ...(unique ? { nameEnglish: unique.en } : {}), category, slot: slotOf(category), rarity,
    ...((unique?.icon ?? base?.icon) ? { icon: unique?.icon ?? base?.icon } : {}), ...(itemLevelMatch ? { itemLevel: Number(itemLevelMatch[1]) } : {}),
    identified: !/Unidentified|未鉴定|未鑑定/i.test(raw), corrupted: /(?:^|\n)(?:Corrupted|已腐化|已污染)(?:\r?\n|$)/i.test(raw),
    twoHanded: /weapon\.(?:two|bow|crossbow|staff|warstaff|talisman)/.test(category), properties, mods, warnings };
}

/** Only additive, unconditional sheet stats are summed. Local rolls are already in printed properties. */
export function equipmentMetricDetails(equipment: Equipment): { values: Record<string, number>; uncounted: string[] } {
  const values: Record<string, number> = {}; const uncounted: string[] = [];
  const add = (key: string, value: number) => { values[key] = (values[key] ?? 0) + value; };
  const hasProperty = (name: string) => equipment.properties.some((property) => property.name === name);
  const printedSpirit = hasProperty('spirit');
  const absorbedLocal = (mod: EquipmentMod): boolean => {
    const id = mod.statId ?? '';
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
  if (aps) {
    for (const [property, key] of [['physicalDamage', 'physicalDps'], ['elementalDamage', 'elementalDps'], ['chaosDamage', 'chaosDps']] as const) {
      const damage = equipment.properties.find((p) => p.name === property)?.values;
      if (damage?.length) values[key] = damage.reduce((a, b) => a + b, 0) / 2 * aps;
    }
    values.totalDps = (values.physicalDps ?? 0) + (values.elementalDps ?? 0) + (values.chaosDps ?? 0);
  }
  const simple: Record<string, string> = { '# to maximum Life': 'life', '# to maximum Mana': 'mana', '# to Spirit': 'spirit',
    '# to Strength': 'strength', '# to Dexterity': 'dexterity', '# to Intelligence': 'intelligence', '#% increased Movement Speed': 'movementSpeed',
    '#% to Fire Resistance': 'fireResistance', '#% to Cold Resistance': 'coldResistance', '#% to Lightning Resistance': 'lightningResistance', '#% to Chaos Resistance': 'chaosResistance' };
  for (const mod of equipment.mods) {
    const value = mod.value; const ref = mod.ref ?? '';
    const metric = simple[ref];
    if (value === undefined) { uncounted.push(mod.raw); continue; }
    if (metric) { if (metric !== 'spirit' || !printedSpirit) add(metric, value); continue; }
    if (ref === '# to all Attributes') { for (const key of ['strength', 'dexterity', 'intelligence']) add(key, value); continue; }
    if (ref === '#% to all Elemental Resistances') { for (const key of ['fireResistance', 'coldResistance', 'lightningResistance']) add(key, value); continue; }
    if (/^#(?:% to| to) (?:Fire|Cold|Lightning|Chaos|Strength|Dexterity|Intelligence)(?: and (?:Fire|Cold|Lightning|Chaos|Strength|Dexterity|Intelligence))(?: Resistances)?$/.test(ref)) {
      for (const [term, key] of [['Fire', 'fireResistance'], ['Cold', 'coldResistance'], ['Lightning', 'lightningResistance'], ['Chaos', 'chaosResistance'], ['Strength', 'strength'], ['Dexterity', 'dexterity'], ['Intelligence', 'intelligence']]) if (ref.includes(term!)) add(key!, value);
      continue;
    }
    if (!absorbedLocal(mod)) uncounted.push(mod.raw);
  }
  return { values, uncounted };
}
export const equipmentMetrics = (equipment: Equipment): Record<string, number> => equipmentMetricDetails(equipment).values;
