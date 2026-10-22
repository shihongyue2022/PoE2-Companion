import localizedStats from './data/localized-stats.json';
import { findJewelleryBase } from './catalog';
import type { EngineMod } from '../lib/engineTypes';

/** Local display only: game IDs and the engine's English templates never change.
 * Character pairs follow OpenCC TSCharacters.txt (Apache-2.0); this deliberately small
 * table covers this catalogue rather than claiming to be a general Chinese converter.
 * https://github.com/BYVoid/OpenCC/blob/master/data/dictionary/TSCharacters.txt
 */
const SIMPLIFIED: Readonly<Record<string, string>> = {
  "調": "调",
  "褻": "亵",
  "瀆": "渎",
  "來": "来",
  "個": "个",
  "備": "备",
  "傷": "伤",
  "償": "偿",
  "內": "内",
  "凍": "冻",
  "動": "动",
  "卻": "却",
  "喚": "唤",
  "圍": "围",
  "圖": "图",
  "寶": "宝",
  "帶": "带",
  "後": "后",
  "從": "从",
  "復": "复",
  "戰": "战",
  "撿": "捡",
  "擊": "击",
  "敵": "敌",
  "時": "时",
  "曬": "晒",
  "榮": "荣",
  "機": "机",
  "殺": "杀",
  "淵": "渊",
  "減": "减",
  "滿": "满",
  "為": "为",
  "獲": "获",
  "環": "环",
  "產": "产",
  "積": "积",
  "範": "范",
  "級": "级",
  "綴": "缀",
  "續": "续",
  "與": "与",
  "術": "术",
  "補": "补",
  "裝": "装",
  "記": "记",
  "詞": "词",
  "護": "护",
  "變": "变",
  "貧": "贫",
  "質": "质",
  "跡": "迹",
  "過": "过",
  "遠": "远",
  "閃": "闪",
  "間": "间",
  "離": "离",
  "電": "电",
  "領": "领",
  "顆": "颗",
  "願": "愿",
  "體": "体",
  "點": "点",
  "種": "种",
  "類": "类",
  "鍊": "链",
  "鏈": "链",
  "項": "项",
  "汙": "污",
  "傳": "传",
  "鏡": "镜",
  "複": "复",
  "製": "制",
  "鑑": "鉴",
  "鑒": "鉴",
  "欄": "栏",
  "綁": "绑",
  "賦": "赋",
  "強": "强",
  "優": "优",
  "階": "阶",
  "層": "层",
  "綠": "绿",
  "黃": "黄",
  "藍": "蓝",
  "紅": "红",
  "琺": "珐",
  "鍛": "锻",
  "鐵": "铁",
  "雙": "双",
  "恆": "恒",
  "憶": "忆",
  "夢": "梦",
  "煉": "炼",
  "總": "总",
  "數": "数",
  "誕": "诞",
  "隨": "随",
  "遺": "遗",
  "毀": "毁",
  "虛": "虚",
  "靈": "灵",
  "異": "异",
  "難": "难",
  "錦": "锦",
  "織": "织",
  "獄": "狱",
  "驚": "惊",
  "駭": "骇",
  "懼": "惧",
  "聖": "圣",
  "獻": "献",
  "終": "终",
  "結": "结",
  "誠": "诚",
  "轉": "转",
  "換": "换",
  "儀": "仪",
  "堅": "坚",
  "韌": "韧",
  "鍍": "镀"
};

export function toSimplified(text: string): string {
  return [...text].map((char) => SIMPLIFIED[char] ?? char).join('');
}

interface LocalStat {
  readonly english: string;
  readonly traditional: readonly string[];
}

const stats: readonly LocalStat[] = localizedStats.stats;
const EXTRA_ALIASES: Readonly<Record<string, readonly string[]>> = {
  '+# to Intelligence': ['+#点智力', '+#智力', '+#智慧'],
  '+# to Strength': ['+#力量'],
  '+# to Dexterity': ['+#敏捷'],
  '+# to all Attributes': ['+#全部属性', '+#全属性', '+#所有属性'],
  '+#% to all Elemental Resistances': ['+#%所有元素抗性', '+#%全部元素抗性'],
  '+# to maximum Mana': ['+#最大法力'],
  '# Life Regeneration per second': ['每秒回复#生命', '每秒恢复#生命', '每秒生命回复#'],
  '+# to Level of all Spell Skills': ['所有法术技能等级+#', '所有法术技能的等级+#'],
  '+# to Level of all Minion Skills': ['所有召唤物技能等级+#'],
  '+# to Level of all Melee Skills': ['所有近战技能等级+#'],
  '+# to Level of all Projectile Skills': ['所有投射物技能等级+#'],
  '+1 to Level of all Skills': ['所有技能等级+#'],
};

const DISPLAY_FALLBACK: Readonly<Record<string, string>> = {
  '#% increased Strength, Dexterity or Intelligence': '力量、敏捷或智力提高#%',
};

const key = (text: string): string => toSimplified(text)
  .toLowerCase()
  .replace(/[＋]/g, '+')
  .replace(/[％]/g, '%')
  .replace(/至/g, '到')
  .replace(/[與和]/g, '与')
  .replace(/\s+/g, '')
  .replace(/[，、]/g, ',');
const escapeRegExp = (text: string): string => text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
const TOKEN = /[+-]?(?:#|\d+(?:\.\d+)?)/g;
const VALUE = String.raw`([+-]?(?:#|\d+(?:\.\d+)?(?:[–—-]\d+(?:\.\d+)?)?))`;

function pattern(template: string): RegExp {
  const text = key(template);
  let source = '';
  let at = 0;
  for (const match of text.matchAll(TOKEN)) {
    source += escapeRegExp(text.slice(at, match.index)) + VALUE;
    at = match.index + match[0].length;
  }
  return new RegExp('^' + source + escapeRegExp(text.slice(at)) + '$', 'i');
}

function fill(template: string, values: readonly string[]): string {
  let at = 0;
  return template.replace(TOKEN, (token) => {
    const value = values[at++];
    if (value === undefined) return token;
    if (token.startsWith('+') && !/^[+-]/.test(value)) return '+' + value;
    return value;
  });
}

// The engine stores this light-radius line as half of a two-line hybrid; clipboard
// conversion runs line by line before the resolver rejoins that hybrid.
const rules = [...stats, { english: '#% increased Light Radius', traditional: ['增加#%照亮範圍'] }].map((stat) => ({
  ...stat,
  englishPattern: pattern(stat.english),
  localPatterns: [...stat.traditional, ...stat.traditional.map(toSimplified),
    ...(EXTRA_ALIASES[stat.english] ?? [])].map(pattern),
}));

/** Translate a stored English template or a rendered line for the Chinese interface.
 * Unknown lines remain visible (with character conversion only).
 */
export function translateMod(text: string): string {
  const clean = text.trim();
  // Route targets wrap the same stat templates the item reader knows. Translate that structure
  // separately so "removes ..." or an add/remove pair does not hide an otherwise known modifier.
  const removal = /^removes?\s+([\s\S]+)$/i.exec(clean);
  if (removal) return `移除：${translateMod(removal[1]!)}`;
  const throwaway = /^any (prefix|suffix)\s*[—–-]\s*a throwaway for the next step to remove$/i.exec(clean);
  if (throwaway) return `任意${throwaway[1]!.toLowerCase() === 'prefix' ? '前缀' : '后缀'}，作为下一步移除用的过渡词缀`;
  const namedThrowaway = /^the throwaway (prefix|suffix)$/i.exec(clean);
  if (namedThrowaway) return `过渡${namedThrowaway[1]!.toLowerCase() === 'prefix' ? '前缀' : '后缀'}`;
  const swap = /^−([\s\S]+?)\s{2,}\+([\s\S]+)$/.exec(clean);
  if (swap) return `移除：${translateMod(swap[1]!)}；添加：${translateMod(swap[2]!)}`;
  const perfectSwap = /^\+([\s\S]+?)\s{2,}−([\s\S]+?)(\s*\(random\))?$/i.exec(clean);
  if (perfectSwap) return `添加：${translateMod(perfectSwap[1]!)}；${perfectSwap[3] ? '随机' : ''}移除：${translateMod(perfectSwap[2]!)}`;
  if (text.includes('\n')) return text.split('\n').map(translateMod).join('\n');
  for (const rule of rules) {
    const match = rule.englishPattern.exec(key(text));
    if (match) {
      const target = rule.traditional[0] ?? DISPLAY_FALLBACK[rule.english];
      const values = match.slice(1);
      // A few stored damage templates contain a worst-tier literal endpoint. When the other
      // endpoint is still #, neither endpoint represents a selected tier or an actual rolled item.
      // Numeric rendered values and selected-tier ranges are kept exactly as supplied.
      const rendered = /^Adds /i.test(rule.english) && values.includes('#') ? values.map(() => '#') : values;
      return target ? toSimplified(fill(target, rendered)) : text;
    }
  }
  const doubled = clean.split(/\s{2,}(?=\+)/);
  if (doubled.length > 1) return doubled.map((part) => translateMod(part)).join('；');
  const combined = clean.split(/\s+\+\s+/);
  if (combined.length > 1) return combined.map(translateMod).join(' + ');
  const alternatives = clean.split(/\s+or\s+/i);
  if (alternatives.length > 1) return alternatives.map(translateMod).join(' 或 ');
  if (/^\+(?=[A-Za-z+#])/.test(clean)) return `添加：${translateMod(clean.slice(1))}`;
  // Compact route labels can omit spaces and the trailing "damage to Attacks". This is a DISPLAY
  // fallback only: toEngineMod still requires an exact recognized game-text template for imports.
  const compactDamage = /^Adds\s*([+#\d.–—-]+)\s*to\s*([#\d.–—-]+)\s*(Physical|Fire|Cold|Lightning|Chaos)(?:\s*damage(?:\s*to\s*Attacks)?)?$/i.exec(clean);
  if (compactDamage) {
    const elements: Readonly<Record<string, string>> = { physical: '物理', fire: '火焰', cold: '冰冷', lightning: '闪电', chaos: '混沌' };
    const unresolved = compactDamage[1]!.includes('#') || compactDamage[2]!.includes('#');
    return `攻击附加${unresolved ? '#' : compactDamage[1]}至${unresolved ? '#' : compactDamage[2]}${elements[compactDamage[3]!.toLowerCase()]}伤害`;
  }
  return toSimplified(text);
}

/** The upstream snapshot has literal worst-tier numbers in a few templates, e.g.
 * "Adds # to 3 Physical Damage". Fill those numbers as well as # placeholders from
 * the actual tier ranges, so the workbench never shows 3 as a top-tier maximum.
 */
export function translateModAtTier(mod: EngineMod, tierDisplay: number): string {
  const tier = mod.tiers.find((candidate) => candidate.display === tierDisplay);
  return translateMod(tier?.values.length ? fill(mod.text, tier.values) : mod.text);
}

/** Convert recognized Chinese game text into the EXACT template language read by
 * the upstream resolver. No fuzzy English guesses are passed to the engine.
 */
export function toEngineMod(text: string): string {
  // Advanced copy includes the roll followed by the allowed range.
  const clean = text.replace(/([+-]?\d+(?:\.\d+)?)\([+-]?\d+(?:\.\d+)?(?:[-–—][+-]?\d+(?:\.\d+)?)?\)/g, '$1');
  for (const rule of rules) {
    for (const local of rule.localPatterns) {
      const match = local.exec(key(clean));
      if (match) return fill(rule.english, match.slice(1));
    }
  }
  return clean;
}

export function translateBase(text: string): string {
  const base = findJewelleryBase(text);
  return base?.simplified ?? (text === 'Rings' ? '戒指' : text === 'Amulets' ? '项链' : toSimplified(text));
}

/** Search both the player's Simplified input and the dataset's English/Traditional text. */
export function searchText(...values: string[]): string {
  const searchKey = (value: string) => key(value)
    .replace(/智力/g, '智慧').replace(/法力/g, '魔力')
    .replace(/属性/g, '能力值').replace(/能盾/g, '能量护盾')
    .replace(/法伤/g, '法术伤害').replace(/恢复/g, '回复');
  return [...new Set(values.flatMap((value) => [value, translateMod(value), translateBase(value)]).map(searchKey))].join(' ');
}

const CURRENCY_WORDS: readonly (readonly [string, string])[] = [
  // Named Exaltation/Whittling items follow PoE2DB's Traditional Chinese catalogue. Directional
  // labels below also describe an action's affected side; all are display text, never currency IDs.
  // https://poe2db.tw/tw/Omen_of_Greater_Exaltation
  // https://poe2db.tw/tw/Omen_of_Whittling
  // https://poe2db.tw/tw/Omen_of_Sinistral_Exaltation
  ['Omen of Greater Exaltation', '大幅提升之兆'], ['Greater Exaltation', '大幅提升之兆'],
  ['Omen of Whittling', '削切之兆'], ['Whittling', '削切之兆'],
  ['Omen of Sinistral Exaltation', '左旋提升之兆'],
  ['Omen of Dextral Exaltation', '右旋提升之兆'],
  ['Omen of Sinistral Annulment', '前缀定向剥离预兆'],
  ['Omen of Dextral Annulment', '后缀定向剥离预兆'],
  ['Omen of Sinistral Crystallisation', '前缀定向结晶预兆'],
  ['Omen of Dextral Crystallisation', '后缀定向结晶预兆'],
  ['Omen of Sinistral Necromancy', '前缀定向亵渎预兆'],
  ['Omen of Dextral Necromancy', '后缀定向亵渎预兆'],
  ['Omen of Light', '光明预兆'], ['Omen of Abyssal Echoes', '深渊回响预兆'],
  ['Orb of Transmutation', '蜕变石'], ['Orb of Augmentation', '增幅石'],
  ['Orb of Annulment', '剥离石'], ['Orb of Alchemy', '点金石'],
  ['Exalted Orb', '崇高石'], ['Regal Orb', '富豪石'], ['Chaos Orb', '混沌石'],
  ['Divine Orb', '神圣石'], ['Vaal Orb', '瓦尔宝珠'],
  ['Transmute', '蜕变石'], ['Augment', '增幅石'], ['Annul', '剥离石'],
  ['Regal', '富豪石'], ['Exalt', '崇高石'], ['Exalted', '崇高石'], ['Annulment', '剥离石'], ['Chaos', '混沌石'],
  ['Transmutation', '蜕变石'], ['Augmentation', '增幅石'],
  ['Desecrate', '亵渎'], ['Desecration', '亵渎'], ['Perfect', '完美'],
  ['Ancient', '远古'],
  ['Greater', '高阶'], ['Lesser', '低阶'], ['Essence of', '精华：'],
  ['Essence', '精华'], ['Sinistral', '左旋（前缀）'], ['Dextral', '右旋（后缀）'],
  ['Omen of the', '预兆：'], ['Omen of', '预兆：'], ['Omen', '预兆'], ['Start over with a new base', '更换底材重新开始'],
  ['Start over', '重新开始'], ['restart', '更换底材'], ['Alchemy', '点金石'],
  ['transmute', '蜕变石'], ['augment', '增幅石'], ['annul', '剥离石'],
  ['regal', '富豪石'], ['exalt', '崇高石'], ['chaos', '混沌石'],
];
// Whole names must win before their component words (e.g. Greater inside a named omen).
const currencyWordsLongestFirst = [...CURRENCY_WORDS].sort(([a], [b]) => b.length - a.length);

export function translateCurrency(text: string): string {
  let translated = text.replace(/\bOmen\s*:\s*/gi, 'Omen of ');
  for (const [english, chinese] of currencyWordsLongestFirst) {
    translated = translated.replace(new RegExp('\\b' + escapeRegExp(english) + '\\b', 'gi'), chinese);
  }
  return toSimplified(translated);
}
