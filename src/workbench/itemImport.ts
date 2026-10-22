import type { PatchData } from '../../packages/engine/src/types.ts';
import { parseItemText } from '../../packages/engine/src/parseItem.ts';
import type { ItemModInput } from '../lib/engineTypes.ts';
import { readPastedItem, itemModsFrom, isSettled, NO_CHOICES } from '../lib/pasteItem.ts';
import type { PasteChoices, PasteRow, PasteReading } from '../lib/pasteItem.ts';
import { findJewelleryBase } from './catalog';
import { toEngineMod, toSimplified } from './localization';

export interface WorkbenchItemImport {
  readonly rawText: string;
  readonly normalizedText: string;
  /** Verbatim printed base; use baseNameEnglish for the English trade site's type filter. */
  readonly baseName: string;
  readonly baseNameEnglish?: string;
  readonly baseId?: string;
  readonly level?: number;
  readonly rarity: 'normal' | 'magic' | 'rare' | 'unique';
  readonly prefixes: ItemModInput[];
  readonly suffixes: ItemModInput[];
  readonly rows: readonly PasteRow[];
  readonly unmatchedLines: readonly string[];
  readonly warnings: readonly string[];
  readonly skipped: PasteReading['skipped'];
  readonly corrupted: boolean;
  /** Item restrictions remain separate from editable parse warnings. Clearing a
   * manual-review warning must never make mirrored/unidentified gear craftable.
   */
  readonly craftingBlocked: boolean;
  readonly blockedReason?: string;
  /** False means the caller must resolve the warnings before trusting a plan. */
  readonly complete: boolean;
}

const RARITIES: Readonly<Record<string, string>> = {
  '中': 'Normal', '一般': 'Normal', '普通': 'Normal',
  '魔法': 'Magic', '稀有': 'Rare', '传奇': 'Unique',
};
const FLAGS: Readonly<Record<string, string>> = {
  '已污染': 'Corrupted', '污染': 'Corrupted',
  '已腐化': 'Corrupted', '腐化': 'Corrupted',
  '已复制': 'Mirrored', '复制': 'Mirrored',
  '不可调整的': 'Unmodifiable', '无法修改': 'Unmodifiable',
  '破裂之物': 'Fractured Item', '未鉴定': 'Unidentified',
  '已亵渎': 'Desecrated', '已分割': 'Split',
};
const ANNOTATIONS: Readonly<Record<string, string>> = {
  '固定': 'implicit', '固定词缀': 'implicit', '基底': 'implicit', '基底词缀': 'implicit',
  '符文': 'rune', '附魔': 'enchant', '污染附魔': 'enchant',
  '已破裂': 'fractured', '破裂': 'fractured',
  '已亵渎': 'desecrated', '亵渎': 'desecrated',
  '已工艺': 'crafted', '工艺': 'crafted',
};
const CLASSES: Readonly<Record<string, 'Rings' | 'Amulets'>> = {
  '戒指': 'Rings', '戒指类': 'Rings', '项链': 'Amulets', '护身符': 'Amulets',
};
const PROPERTY_LABELS: Readonly<Record<string, string>> = {
  '物品等级': 'Item Level', '品质': 'Quality', '需求': 'Requirements',
  '等级': 'Level', '力量': 'Strength', '敏捷': 'Dexterity', '智慧': 'Intelligence',
  '智力': 'Intelligence', '插槽': 'Sockets', '护甲值': 'Armour',
  '闪避值': 'Evasion Rating', '能量护盾': 'Energy Shield',
  '精魂': 'Spirit', '护符栏位': 'Charm Slots', '备注': 'Note',
};

/** Convert only recognized syntax. Unrecognized modifier text is preserved for correction. */
function normalizeLine(raw: string): string {
  const line = raw.trim().replace(/：\s*/g, ': ').replace(/（/g, '(').replace(/）/g, ')');
  const simplified = toSimplified(line);
  const property = /^([^:]+):\s*(.*)$/.exec(simplified);
  if (property) {
    const label = property[1]!.trim();
    const value = property[2]!.trim();
    if (['物品种类', '物品类别', '物品类型'].includes(label)) {
      return 'Item Class: ' + (CLASSES[value] ?? value);
    }
    if (label === '稀有度') return 'Rarity: ' + (RARITIES[value] ?? value);
    if (PROPERTY_LABELS[label]) return PROPERTY_LABELS[label] + ': ' + (value || '-');
  }
  if (simplified === '需求') return 'Requirements: -';
  if (/^未鉴定(?:\s*\((?:阶级|阶层):?\s*\d+\))?$/.test(simplified)) return 'Unidentified';
  if (FLAGS[simplified]) return FLAGS[simplified];
  // Advanced-copy side/tier names remain attached. Chinese tier names are not guessed as English.
  if (line.startsWith('{')) {
    return simplified
      .replace(/^\{\s*(?:(?:已亵渎|亵渎|已破裂|破裂|Desecrated|Fractured)\s*)+/i, '{ ')
      .replace(/前缀(?:词缀)?/, 'Prefix Modifier')
      .replace(/后缀(?:词缀)?/, 'Suffix Modifier')
      .replace(/固定词缀/, 'Implicit Modifier')
      .replace(/(?:阶层|阶级|等级):\s*/g, 'Tier: ');
  }
  const annotations: string[] = [];
  let stat = line;
  for (;;) {
    const match = /\s*[（(]([^()（）]+)[）)]\s*$/.exec(stat);
    if (!match) break;
    const value = ANNOTATIONS[toSimplified(match[1]!).toLowerCase()]
      ?? (/^(implicit|rune|enchant|fractured|desecrated|crafted)$/i.test(match[1]!) ? match[1]!.toLowerCase() : undefined);
    if (!value) break;
    annotations.unshift(value);
    stat = stat.slice(0, match.index);
  }
  return toEngineMod(stat) + annotations.map((value) => ' (' + value + ')').join('');
}

export function parseWorkbenchItem(
  data: PatchData, text: string, choices: PasteChoices = NO_CHOICES,
): WorkbenchItemImport | null {
  const rawLines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  // Advanced-copy flags belong to the group header, while the engine reads flags
  // on its stat lines. Carry them across instead of losing a fractured/desecrated
  // group (whose Chinese prefix would otherwise prevent the header matching).
  let groupFlags: string[] = [];
  const normalizedLines = rawLines.map((raw) => {
    const simple = toSimplified(raw.trim());
    if (/^-{4,}$/.test(simple)) groupFlags = [];
    if (simple.startsWith('{')) {
      const leading = /^\{\s*((?:(?:已亵渎|亵渎|已破裂|破裂|Desecrated|Fractured)\s*)+)/i.exec(simple)?.[1] ?? '';
      groupFlags = [
        ...(/亵渎|Desecrated/i.test(leading) ? ['desecrated'] : []),
        ...(/破裂|Fractured/i.test(leading) ? ['fractured'] : []),
      ];
      return normalizeLine(raw);
    }
    const normalized = normalizeLine(raw);
    return normalized && !/^-{4,}$/.test(normalized)
      ? normalized + groupFlags.filter((flag) => !normalized.includes('(' + flag + ')'))
        .map((flag) => ' (' + flag + ')').join('')
      : normalized;
  });
  const originalParsed = parseItemText(normalizedLines.join('\n'));
  if (!originalParsed?.rarity) return null;

  const headerEnd = normalizedLines.findIndex((line) => /^-{4,}$/.test(line));
  const header = normalizedLines.slice(0, headerEnd < 0 ? normalizedLines.length : headerEnd);
  const nameIndexes = header.flatMap((line, index) =>
    /^(Item Class|Rarity):/.test(line) || !line.trim() ? [] : [index]);
  const baseIndex = nameIndexes.at(-1);
  const baseName = baseIndex === undefined ? '' : rawLines[baseIndex]!.trim();
  const catalogBase = findJewelleryBase(baseName);
  const rawClass = originalParsed.itemClass;
  const category = catalogBase?.category
    ?? (rawClass === 'Rings' || rawClass === 'Amulets' ? rawClass : CLASSES[toSimplified(rawClass ?? '')]);
  const fallbackBase = category ? data.bases.get(category)?.bases?.[0] : undefined;
  if (baseIndex !== undefined && category) {
    // The engine stores jewellery by class pool, while trade needs the concrete name.
    normalizedLines[baseIndex] = catalogBase?.english ?? fallbackBase ?? baseName;
  }
  const normalizedText = normalizedLines.join('\n');
  let reading = readPastedItem(data, normalizedText, choices);
  if (!reading) return null;
  // A copied affix header states its side. Use that evidence to distinguish e.g.
  // rarity's otherwise identical prefix and suffix; keep the upstream normal-over-
  // essence preference within that side, and preserve explicit player choices.
  if (reading.advanced) {
    const groups = parseItemText(normalizedText)?.mods ?? [];
    const inferred = new Map(choices.modId);
    for (const row of reading.rows) {
      if (inferred.has(row.key)) continue;
      const group = groups.find((candidate) => candidate.lines.join('\n') === row.key);
      if (!group?.side) continue;
      const matching = row.modIds.filter((id) => data.mods.get(id)?.type === group.side);
      const ordinary = matching.filter((id) => data.mods.get(id)?.source === 'normal');
      const selected = matching.length === 1 ? matching[0] : ordinary.length === 1 ? ordinary[0] : undefined;
      if (selected) inferred.set(row.key, selected);
    }
    reading = readPastedItem(data, normalizedText, { ...choices, modId: inferred }) ?? reading;
  }

  const warnings: string[] = [];
  const blockingReasons: string[] = [];
  if (!category || !reading.baseId || !['Rings', 'Amulets'].includes(reading.baseId)) {
    warnings.push('第一版只支持戒指和项链；无法确定这件装备的词缀池。');
  }
  if (!catalogBase && category) {
    warnings.push('未识别具体底座，暂按' + (category === 'Rings' ? '戒指' : '项链') + '通用词缀池读取；请核对底座及词缀槽位。');
  }
  if (catalogBase && !catalogBase.supported) {
    warnings.push(catalogBase.unsupportedReason ?? '该底座具有尚未建模的特殊制作限制。');
  }
  if (reading.level === undefined) warnings.push('缺少物品等级，无法可靠确定可出现的词缀阶级。');
  else if (!Number.isInteger(reading.level) || reading.level < 1 || reading.level > 100) {
    warnings.push('物品等级必须是 1～100 的整数。');
  }
  if (originalParsed.rarity === 'unique') blockingReasons.push('传奇装备不能使用当前制作规划器修改词缀。');
  if (originalParsed.corrupted) blockingReasons.push('这件装备已污染，不能继续使用当前规划器支持的制作通货。');
  if (normalizedLines.includes('Mirrored')) blockingReasons.push('这件装备已复制，不能继续制作。');
  if (normalizedLines.includes('Unmodifiable')) blockingReasons.push('这件装备不可调整，不能继续制作。');
  if (normalizedLines.some((line) => /^(?:Sanctified|(?:已)?圣化)$/i.test(toSimplified(line)))) blockingReasons.push('这件装备已圣化，当前制作规划器不支持继续修改。');
  if (normalizedLines.includes('Unidentified')) blockingReasons.push('装备尚未鉴定，无法读取已有词缀。');
  warnings.push(...blockingReasons);

  const originalByNormalized = new Map<string, string>();
  normalizedLines.forEach((line, index) => {
    originalByNormalized.set(line, rawLines[index]!.trim());
    originalByNormalized.set(line.replace(/\s*\((implicit|rune|enchant|fractured|desecrated|crafted)\)\s*$/i, ''), rawLines[index]!.trim());
  });
  const originalLine = (line: string): string => originalByNormalized.get(line) ?? line;
  const unmatchedLines = reading.unresolved.map(originalLine);
  // When no base resolves, upstream cannot attempt the lines; still report every explicit line.
  if (!reading.baseId) unmatchedLines.push(...originalParsed.mods
    .filter((mod) => mod.kind === 'explicit').flatMap((mod) => mod.lines).map(originalLine));
  if (unmatchedLines.length) warnings.push('有 ' + unmatchedLines.length + ' 行词缀未匹配，已保留原文；请手动确认。');
  const uncertain = reading.rows.filter((row) => !isSettled(row) || row.canSplit);
  if (uncertain.length) warnings.push('有 ' + uncertain.length + ' 组词缀的来源、阶级或组合存在歧义，需手动确认。');
  const mods = itemModsFrom(reading);
  if (mods.dropped) warnings.push('词缀数量超出通用槽位限制，有 ' + mods.dropped + ' 条未导入；请核对词缀组合。');
  if (reading.rows.some((row) => row.sanctified)) {
    warnings.push('部分词缀数值超过当前数据范围；可能经过圣化或品质加成，需核对其阶级。');
  }
  return {
    rawText: text, normalizedText, baseName,
    ...(catalogBase ? { baseNameEnglish: catalogBase.english } : {}),
    ...(category && reading.baseId ? { baseId: reading.baseId } : {}),
    ...(reading.level === undefined ? {} : { level: reading.level }),
    rarity: originalParsed.rarity,
    prefixes: mods.prefixes, suffixes: mods.suffixes,
    rows: reading.rows, unmatchedLines, warnings, skipped: reading.skipped,
    corrupted: originalParsed.corrupted,
    craftingBlocked: blockingReasons.length > 0,
    ...(blockingReasons.length ? { blockedReason: blockingReasons.join(' ') } : {}),
    complete: warnings.length === 0,
  };
}

/** Deterministic examples drawn from the shipped 0.5.0 ranges, not claimed market listings. */
export const EXAMPLE_RING = `物品種類: 戒指
稀有度: 稀有
暮色之環
紅玉戒指
--------
需求:
等級: 60
--------
物品等級: 82
--------
+25%火焰抗性 (固定)
--------
+110最大生命
+42%火焰抗性
+31點力量`;

export const EXAMPLE_AMULET = `物品種類: 項鍊
稀有度: 稀有
星辰之心
日耀項鍊
--------
物品等級: 82
--------
+15精魂 (固定)
--------
+48精魂
+185最大魔力
全部法術技能等級+3`;
