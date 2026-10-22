import type { PatchData } from '../../packages/engine/src/types';
import type { GearTrade } from '../lib/gearTrade';
import { tradeLineRangeMapping, type TradeFilterRow } from './tradeSearch';
import { tradePseudoMultiplier, TRADE_PSEUDO_SOURCE } from './tradePseudo';

export type TopGearGrade = 't2' | 't1' | 'high' | 'perfect';

export interface TopGearReference {
  readonly label: string;
  /** Reference before protecting a better actual roll. This is not an item's actual value. */
  readonly value?: number;
  readonly note?: string;
}

interface TopGearOptions {
  readonly grade: TopGearGrade;
  readonly keepCurrent: boolean;
}

const referenceLabels: Readonly<Record<TopGearGrade, string>> = {
  t2: 'T2 下限', t1: 'T1 下限', high: 'T1 区间 80% 位置', perfect: 'T1 满值',
};

// Keep decimal damage averages and avoid floating point artifacts in editable inputs and URLs.
const tidy = (value: number): number => Math.round(value * 1e8) / 1e8;

function explicitReference(
  data: PatchData,
  trade: GearTrade,
  row: TradeFilterRow,
  grade: TopGearGrade,
): TopGearReference {
  const label = referenceLabels[grade];
  if (!row.ids.length) return { label, note: '尚无已核验的交易属性映射，无法生成顶配数值。' };
  const mod = row.modId ? data.mods.get(row.modId) : undefined;
  const lineIndex = row.lineIndex;
  const mapping = mod && lineIndex !== undefined ? trade.mods[mod.id]?.[lineIndex] : undefined;
  const shared = mapping ? trade.rows[mapping[0]] : undefined;
  if (row.ambiguous || shared?.ambiguous) {
    return { label, note: '该交易映射包含近似属性，顶配模式仅要求属性存在，请手动核对数值。' };
  }
  if (!mod || !mapping || lineIndex === undefined || !shared?.ids.length) {
    return { label, note: '缺少可对应的词缀阶层或交易映射，顶配模式仅要求属性存在。' };
  }
  const layout = tradeLineRangeMapping(mod, mapping, lineIndex);
  if (layout.count <= 0 || layout.first < 0) {
    return { label, note: '官方数值方向尚未核验，顶配模式仅要求属性存在。' };
  }
  const display = grade === 't2' ? Math.min(2, mod.tiers.length) : 1;
  const tier = mod.tiers[mod.tiers.length - display];
  const ranges = tier?.ranges.slice(layout.first, layout.first + layout.count);
  if (!ranges || ranges.length !== layout.count || ranges.some((range) =>
    !Number.isFinite(range[0]) || !Number.isFinite(range[1]) || range[0]! > range[1]!)) {
    return { label, note: '规则快照中的阶层数值不完整，顶配模式仅要求属性存在。' };
  }
  const low = ranges.reduce((sum, range) => sum + range[0]!, 0) / layout.count;
  const high = ranges.reduce((sum, range) => sum + range[1]!, 0) / layout.count;
  const value = tidy(grade === 'perfect' ? high : grade === 'high' ? low + 0.8 * (high - low) : low);
  return {
    label: grade === 't2' && display === 1 ? 'T1 下限（无 T2）' : label,
    value,
    ...(low < 0 || high < 0 ? { note: '按交易属性的有符号数值设置下限，请核对该属性的收益方向。' } : {}),
  };
}

/**
 * Search for higher rolls in the same stat directions using the entire snapshot's tier ladder.
 * An imported item's level is intentionally irrelevant: the market may offer higher-level items.
 * This does not infer prices, market rank, current-patch ceilings, or quality multipliers.
 */
export function buildTopGearRows(
  data: PatchData,
  trade: GearTrade,
  rows: readonly TradeFilterRow[],
  options: TopGearOptions,
): {
  readonly rows: TradeFilterRow[];
  readonly references: ReadonlyMap<string, TopGearReference>;
  readonly warnings: string[];
} {
  const references = new Map<string, TopGearReference>();
  const original = [...new Map(rows.filter((row) => row.origin !== 'pseudo').map((row) => [row.key, row])).values()];
  for (const row of original) references.set(row.key, explicitReference(data, trade, row, options.grade));

  for (const row of rows.filter((entry) => entry.origin === 'pseudo')) {
    const kind = row.ids.length === 1 && row.ids[0] === TRADE_PSEUDO_SOURCE.elemental ? 'elemental-resistance'
      : row.ids.length === 1 && row.ids[0] === TRADE_PSEUDO_SOURCE.attributes ? 'attributes' : undefined;
    const parts = kind ? original.flatMap((part) => {
      const factor = tradePseudoMultiplier(part, kind);
      return factor === undefined ? [] : [{ reference: references.get(part.key), factor }];
    }) : [];
    const complete = !row.ambiguous && parts.length > 0 && parts.every(({ reference }) => reference?.value !== undefined);
    references.set(row.key, {
      label: `${referenceLabels[options.grade]}合计`,
      ...(complete ? { value: tidy(parts.reduce((sum, { reference, factor }) => sum + reference!.value! * factor, 0)) }
        : { note: '组成属性缺少已核验的顶配数值，合计条件暂仅要求存在，请手动核对。' }),
    });
  }

  const warnings: string[] = [];
  const upgraded = rows.map((row): TradeFilterRow => {
    const reference = references.get(row.key);
    const value = reference?.value;
    const min = value === undefined ? '' : String(tidy(options.keepCurrent && Number.isFinite(row.actualValue)
      ? Math.max(value, row.actualValue!) : value));
    if (row.enabled && reference?.note) warnings.push(`${row.label}：${reference.note}`);
    // Actual provenance and labels stay intact. Only the editable search bounds change.
    return { ...row, min, max: '' };
  });
  return { rows: upgraded, references, warnings: [...new Set(warnings)] };
}
