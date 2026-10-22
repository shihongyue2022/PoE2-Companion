import type { PatchData } from '../../packages/engine/src/types.ts';
import type { ExistingItem, ItemModInput } from '../lib/engineTypes.ts';
import type { GearTrade } from '../lib/gearTrade.ts';
import { parseWorkbenchItem } from './itemImport.ts';
import { translateMod } from './localization.ts';
import { tradeLineRangeMapping } from './tradeSearch.ts';
import type { TradeActualStat } from './tradeSearch.ts';

export interface TradeActualValues {
  readonly stats: readonly TradeActualStat[];
  readonly warnings: readonly string[];
}

const signature = (entries: readonly ItemModInput[]): string => entries.map((entry) =>
  [entry.modId, entry.tierDisplay, entry.fractured === true, entry.desecrated === true].join(':'))
  .sort().join('|');

/**
 * Preserve the numbers printed on the item for comparison searches. The crafting engine stores
 * tiers, not rolls; deriving search amounts from tiers loses both good rolls and quality bonuses.
 * A stale clipboard must not supply values after the item has changed in the simulator/editor.
 */
export function extractTradeActualStats(
  data: PatchData,
  trade: GearTrade,
  raw: string,
  current: ExistingItem,
): TradeActualValues {
  if (!raw.trim()) return { stats: [], warnings: [] };
  const imported = parseWorkbenchItem(data, raw);
  if (!imported || imported.baseId !== current.baseId || imported.rarity !== current.rarity
    || imported.level !== current.level
    || imported.unmatchedLines.length > 0
    || imported.rows.some((row) => !row.modId || row.tierDisplay === undefined || row.canSplit)
    || imported.rows.length !== imported.prefixes.length + imported.suffixes.length
    || signature(imported.prefixes) !== signature(current.prefixes)
    || signature(imported.suffixes) !== signature(current.suffixes)) {
    return {
      stats: [],
      warnings: ['当前装备已不同于粘贴原文，或原文仍有未识别的词缀；检索数值暂按阶级参考值显示。重新导入装备可恢复实际数值。'],
    };
  }

  const stats: TradeActualStat[] = [];
  const warnings: string[] = [];
  for (const row of imported.rows) {
    const modId = row.modId;
    if (!modId || row.tierDisplay === undefined) continue;
    const mod = data.mods.get(modId);
    const mappings = trade.mods[modId];
    if (!mod || !mappings) continue;
    const tier = mod.tiers[mod.tiers.length - row.tierDisplay];
    if (!tier) continue;
    // parseWorkbenchItem already removes advanced-copy range hints. Keep this defensive cleanup
    // local too: a 28(25-29) roll contributes 28, never the annotation's 25 or 29.
    const cleaned = row.lines.map((line) => line.replace(
      /([+-]?\d+(?:\.\d+)?)\((?:[+-]?\d+(?:\.\d+)?)(?:\s*[-–—]\s*[+-]?\d+(?:\.\d+)?)?\)/g,
      '$1',
    ));
    const values = cleaned.join('\n').match(/[+-]?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    // A prose number (e.g. a distance) is not a rolled range. Refuse to guess its alignment.
    if (values.length !== tier.ranges.length || values.some((value) => !Number.isFinite(value))) {
      warnings.push(`${translateMod(mod.text ?? row.modId)}：无法安全对应实际数值，保留阶级参考值。`);
      continue;
    }
    mappings.forEach((mapping, lineIndex) => {
      if (!mapping) return;
      const { first: firstRange, count: ranges } = tradeLineRangeMapping(mod, mapping, lineIndex);
      // ranges=0 is used upstream when the numeric direction or stat transformation is unknown.
      // In particular an unsigned "reduced" roll must not become a positive official minimum.
      if (ranges <= 0 || firstRange < 0 || firstRange + ranges > values.length) return;
      const selected = values.slice(firstRange, firstRange + ranges);
      const value = selected.reduce((sum, amount) => sum + amount, 0) / selected.length;
      stats.push({
        modId, lineIndex, value,
        ...(cleaned[lineIndex] ? { label: translateMod(cleaned[lineIndex]) } : {}),
      });
    });
  }
  return { stats, warnings };
}
