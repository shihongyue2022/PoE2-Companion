/**
 * Concrete base names from the shipped 0.5.0 snapshot. Chinese names checked against
 * https://poe2db.tw/tw/Rings and https://poe2db.tw/tw/Amulets on 2026-10-22.
 * Simplified labels are display aliases, not identifiers sent to the international trade site.
 * The catalogue is intentionally NOT a claim that this snapshot matches the current game.
 */
export interface JewelleryBase {
  readonly english: string;
  readonly traditional: string;
  readonly simplified: string;
  readonly category: 'Rings' | 'Amulets';
  readonly supported: boolean;
  readonly unsupportedReason?: string;
  readonly aliases?: readonly string[];
}

type Entry = readonly [english: string, traditional: string, simplified: string, unsupportedReason?: string];
const SPECIAL_LIMITS = '该底座改变前后缀数量上限；当前引擎只支持常规 3 前缀 / 3 后缀，请先使用官方交易搜索。';
const SPECIAL_SOCKET = '该底座使用其他部位的插槽加成规则，当前工作台尚未建模。';

const rings: readonly Entry[] = [
  ['Abyssal Signet', '深淵之記', '深渊之记'],
  ['Amethyst Ring', '紫晶戒指', '紫晶戒指'],
  ['Biostatic Ring', '恆生之戒', '恒生之戒'],
  ['Breach Ring', '裂痕戒指', '裂痕戒指'],
  ['Dusk Ring', '幽暗戒指', '幽暗戒指', SPECIAL_LIMITS],
  ['Emerald Ring', '綠寶石戒指', '绿宝石戒指'],
  ['Gloam Ring', '黃昏戒指', '黄昏戒指', SPECIAL_LIMITS],
  ['Gold Ring', '金光戒指', '金光戒指'],
  ['Grasping Ring', '抓取之戒', '抓取之戒', SPECIAL_SOCKET],
  ['Iron Ring', '鍛鐵戒指', '锻铁戒指'],
  ['Kinetic Ring', '動力之戒', '动力之戒'],
  ['Lazuli Ring', '青金石戒指', '青金石戒指'],
  ['Mnemonic Ring', '憶念之戒', '忆念之戒'],
  ['Oneiric Ring', '夢境之戒', '梦境之戒'],
  ['Pearl Ring', '珍珠戒指', '珍珠戒指'],
  ['Penumbra Ring', '半影戒指', '半影戒指', SPECIAL_LIMITS],
  ['Prismatic Ring', '三相戒指', '三相戒指'],
  ['Refined Breach Ring', '精製裂痕戒指', '精制裂痕戒指'],
  ['Ring', '戒指', '戒指', '通用名称“戒指”不能唯一确认可制作底座；请核对具体底座。'],
  ['Ruby Ring', '紅玉戒指', '红玉戒指'],
  ['Sapphire Ring', '藍玉戒指', '蓝玉戒指'],
  ['Tenebrous Ring', '黑暗戒指', '黑暗戒指', SPECIAL_LIMITS],
  ['Topaz Ring', '黃玉戒指', '黄玉戒指'],
  ['Two-Stone Ring', '雙玉戒指', '双玉戒指'],
  ['Unset Ring', '潛能之戒', '潜能之戒'],
  ['Vitalic Ring', '維生之戒', '维生之戒'],
];

const amulets: readonly Entry[] = [
  ['Absent Amulet', '虛無護身符', '虚无护身符', SPECIAL_LIMITS],
  ['Amber Amulet', '琥珀護身符', '琥珀护身符'],
  ['Azure Amulet', '蒼藍項鍊', '苍蓝项链'],
  ['Bloodstone Amulet', '血石項鍊', '血石项链'],
  ['Corona Amulet', '日冕護身符', '日冕护身符', SPECIAL_SOCKET],
  ['Crimson Amulet', '赤紅項鍊', '赤红项链'],
  ['Distorted Amulet', '歪曲護身符', '歪曲护身符', SPECIAL_LIMITS],
  ['Dusk Amulet', '幽暗項鍊', '幽暗项链', SPECIAL_LIMITS],
  ['Gloam Amulet', '黃昏項鍊', '黄昏项链', SPECIAL_LIMITS],
  ['Gold Amulet', '帝金護身符', '帝金护身符'],
  ['Jade Amulet', '翠玉護身符', '翠玉护身符'],
  ['Lament Amulet', '悼亡護身符', '悼亡护身符', SPECIAL_LIMITS],
  ['Lapis Amulet', '海玉護身符', '海玉护身符'],
  ['Lunar Amulet', '月神項鍊', '月神项链'],
  ['Pearlescent Amulet', '珠光項鍊', '珠光项链'],
  ['Penumbra Amulet', '半影項鍊', '半影项链', SPECIAL_LIMITS],
  ['Portent Amulet', '惡兆護身符', '恶兆护身符', SPECIAL_LIMITS],
  ['Runemastered Veridical Chain', '符煉幻象鎖鏈', '符炼幻象锁链'],
  ['Solar Amulet', '日耀項鍊', '日耀项链'],
  ['Stellar Amulet', '恆星項鍊', '恒星项链'],
  ['Tenebrous Amulet', '黑暗項鍊', '黑暗项链', SPECIAL_LIMITS],
  ['Twisted Amulet', '扭曲項鍊', '扭曲项链', SPECIAL_LIMITS],
  ['Veridical Chain', '幻象鎖鏈', '幻象锁链'],
];

function makeEntries(entries: readonly Entry[], category: JewelleryBase['category']): JewelleryBase[] {
  return entries.map(([english, traditional, simplified, unsupportedReason]) => ({
    english, traditional, simplified, category,
    supported: unsupportedReason === undefined,
    ...(unsupportedReason ? { unsupportedReason } : {}),
    // Both 項鍊 and 項鏈 appear in copied text and user input.
    ...(traditional.includes('鍊') ? { aliases: [traditional.replace(/鍊/g, '鏈')] } : {}),
  }));
}

export const JEWELLERY_BASES: readonly JewelleryBase[] = [
  ...makeEntries(rings, 'Rings'),
  ...makeEntries(amulets, 'Amulets'),
];

const normalize = (text: string): string => text.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
const names = JEWELLERY_BASES.flatMap((base) =>
  [...new Set([base.english, base.traditional, base.simplified, ...(base.aliases ?? [])])]
    .map((name) => ({ name: normalize(name), base })),
).sort((a, b) => b.name.length - a.name.length);

/** Longest name wins: "Refined Breach Ring" must never become "Breach Ring" or "Ring". */
export function findJewelleryBase(text: string): JewelleryBase | undefined {
  const haystack = normalize(text);
  for (const { name, base } of names) {
    const index = haystack.indexOf(name);
    if (index === -1) continue;
    if (/^[a-z]/.test(name)) {
      const before = haystack[index - 1];
      const after = haystack[index + name.length];
      if ((before && /[a-z]/.test(before)) || (after && /[a-z]/.test(after))) continue;
    }
    return base;
  }
  return undefined;
}
