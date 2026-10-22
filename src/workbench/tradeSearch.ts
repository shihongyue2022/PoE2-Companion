import type { Mod, PatchData } from '../../packages/engine/src/types.ts';
import type { ItemModInput } from '../lib/engineTypes.ts';
import type { GearTrade } from '../lib/gearTrade.ts';
import { findJewelleryBase } from './catalog.ts';
import { translateMod } from './localization.ts';

/** A printed line's actual scalar in official trade semantics (damage ranges use their average). */
export interface TradeActualStat {
  readonly modId: string;
  readonly lineIndex: number;
  readonly value: number;
  readonly label?: string;
}

/** Each visible row is independently selectable; a hybrid modifier has one row per printed line. */
export interface TradeFilterRow {
  readonly key: string;
  readonly label: string;
  readonly sourceLabel?: string;
  readonly modId?: string;
  readonly lineIndex?: number;
  readonly ids: readonly string[];
  readonly enabled: boolean;
  readonly min: string;
  readonly max: string;
  readonly actualValue?: number;
  readonly origin: 'actual' | 'tier' | 'pseudo';
  readonly ambiguous?: boolean;
  readonly warning?: string;
}

const isDamagePair = (text: string): boolean => /\bAdds\s+(?:#|[+-]?\d+(?:\.\d+)?)\s+to\s+(?:#|[+-]?\d+(?:\.\d+)?)\s+.*damage\b/i.test(text);

/**
 * A few upstream templates hard-code one worst-tier damage endpoint ("Adds # to 3 ...").
 * Its mapping counted only #, although the tier stores both endpoints. Correct that layout for
 * both tier defaults and clipboard values, including offsets for any following hybrid lines.
 */
export function tradeLineRangeMapping(
  mod: Pick<Mod, 'text'>,
  mapping: readonly [number, number, number],
  lineIndex: number,
): { readonly first: number; readonly count: number } {
  const lines = (mod.text ?? '').split('\n');
  const extra = lines.slice(0, lineIndex).reduce((sum, line) => {
    const hashes = (line.match(/#/g) ?? []).length;
    return sum + (isDamagePair(line) && hashes === 1 ? 1 : 0);
  }, 0);
  return {
    first: mapping[1] + extra,
    count: mapping[2] > 0 && isDamagePair(lines[lineIndex] ?? '') ? 2 : mapping[2],
  };
}

/**
 * Keep verified upstream IDs, but expose each condition instead of silently requiring every affix.
 * Rows start unchecked. Callers choose a preset or let the user select meaningful comparison stats.
 * ranges=0 deliberately lacks sign/direction information in the upstream mapping: search presence
 * only there, rather than pretending an unsigned "reduced" roll is a positive official minimum.
 */
export function buildTradeFilterRows(
  data: PatchData,
  trade: GearTrade,
  entries: readonly ItemModInput[],
  actualStats: readonly TradeActualStat[] = [],
): TradeFilterRow[] {
  return entries.flatMap((entry, entryIndex) => {
    const mod = data.mods.get(entry.modId);
    const lines = (mod?.text ?? entry.modId).split('\n');
    const tier = mod?.tiers[mod.tiers.length - entry.tierDisplay];
    const mapped = trade.mods[entry.modId];
    return lines.map((line, lineIndex): TradeFilterRow => {
      const mapping = mapped?.[lineIndex];
      const shared = mapping ? trade.rows[mapping[0]] : undefined;
      const ids = [...new Set(shared?.ids ?? [])];
      const actual = actualStats.find((stat) => stat.modId === entry.modId && stat.lineIndex === lineIndex
        && Number.isFinite(stat.value));
      const layout = mod && mapping ? tradeLineRangeMapping(mod, mapping, lineIndex) : undefined;
      const ranges = layout?.count ?? 0;
      const lowRanges = tier && mapping && ranges > 0
        ? tier.ranges.slice(layout!.first, layout!.first + ranges).map((range) => range[0]) : [];
      const lows = lowRanges.filter((value): value is number => value !== undefined && Number.isFinite(value));
      const tierValue = ranges > 0 && lows.length === ranges
        ? lows.reduce((sum, value) => sum + value, 0) / ranges : undefined;
      // The actual-value extractor promises official signed semantics; unlike tier ranges it may
      // supply a verified scalar even for a mapping whose numeric defaults were suppressed.
      const actualValue = actual?.value;
      const value = actualValue ?? tierValue;
      const warnings: string[] = [];
      if (!ids.length) warnings.push('该属性尚未映射到官方交易条件，请在官网手动核对。');
      if (shared?.ambiguous) warnings.push('该映射包含近似属性，请核对官网搜索结果。');
      if (ranges === 0 && actualValue === undefined && /#|\d/.test(line)) {
        warnings.push('此属性的官方数值方向尚未核验，默认只搜索是否存在，请在官网核对数值。');
      }
      return {
        key: `${entryIndex}:${entry.modId}:${lineIndex}`,
        label: actual?.label ? translateMod(actual.label) : translateMod(line),
        sourceLabel: line,
        modId: entry.modId,
        lineIndex,
        ids,
        enabled: false,
        min: value === undefined ? '' : String(value),
        max: '',
        ...(actualValue === undefined ? {} : { actualValue }),
        origin: actualValue === undefined ? 'tier' : 'actual',
        ...(shared?.ambiguous ? { ambiguous: true } : {}),
        ...(warnings.length ? { warning: warnings.join(' ') } : {}),
      };
    });
  });
}

export interface FlexibleTradeOptions {
  readonly league: string;
  readonly baseId: string;
  readonly baseName?: string;
  readonly rarity?: 'normal' | 'magic' | 'rare' | 'nonunique' | 'unique';
  readonly status?: 'any' | 'online' | 'securable';
  readonly itemLevelMin?: number;
  readonly itemLevelMax?: number;
  readonly rows: readonly TradeFilterRow[];
  readonly matching?: 'all' | 'count';
  readonly minMatches?: number;
}

interface StatFilter {
  readonly id: string;
  readonly value?: { readonly min?: number; readonly max?: number; readonly weight?: number };
  readonly disabled: false;
}

interface StatGroup {
  readonly type: 'and' | 'count' | 'weight';
  readonly value?: { readonly min: number };
  readonly filters: readonly StatFilter[];
  readonly disabled: false;
}

export interface FlexibleTradeDocument {
  readonly query: {
    readonly name?: string;
    readonly type?: string;
    readonly status: { readonly option: 'any' | 'online' | 'securable' };
    readonly filters: {
      readonly type_filters: { readonly filters: {
        readonly category?: { readonly option: string };
        readonly rarity?: { readonly option: NonNullable<FlexibleTradeOptions['rarity']> };
        readonly ilvl?: { readonly min?: number; readonly max?: number };
        readonly quality?: { readonly min?: number; readonly max?: number };
      } };
      readonly equipment_filters?: { readonly filters: Readonly<Record<string, { readonly min?: number; readonly max?: number }>> };
      readonly map_filters?: { readonly filters: Readonly<Record<string, { readonly min?: number; readonly max?: number }>> };
      readonly trade_filters?: { readonly filters: { readonly price: { readonly max: number; readonly option: string } } };
      readonly misc_filters?: { readonly filters: {
        readonly ilvl?: { readonly min?: number; readonly max?: number };
        readonly identified?: { readonly option: 'true' | 'false' };
        readonly corrupted?: { readonly option: 'true' | 'false' };
        readonly twice_corrupted?: { readonly option: 'true' | 'false' };
        readonly gem_level?: { readonly min?: number; readonly max?: number };
        readonly area_level?: { readonly min?: number; readonly max?: number };
      } };
    };
    readonly stats: readonly StatGroup[];
  };
  readonly sort: { readonly price: 'asc' } | { readonly 'statgroup.0': 'desc' };
}

function readNumber(text: string, label: string): number | undefined {
  const value = text.trim();
  if (!value) return undefined;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value))) {
    throw new Error(`“${label}”的数值必须为有效数字。`);
  }
  return Number(value);
}

function filtersForRow(row: TradeFilterRow): StatFilter[] {
  const ids = [...new Set(row.ids)];
  if (!ids.length) throw new Error(`“${row.label}”没有可用的官方交易属性，请取消勾选后重试。`);
  const min = readNumber(row.min, row.label);
  const max = readNumber(row.max, row.label);
  if (min !== undefined && max !== undefined && min > max) {
    throw new Error(`“${row.label}”的下限不能大于上限。`);
  }
  const value = min === undefined && max === undefined ? undefined : {
    ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }),
  };
  return ids.map((id) => ({ id, ...(value ? { value } : {}), disabled: false }));
}

const anyGroup = (filters: readonly StatFilter[]): StatGroup => ({
  type: 'count', value: { min: 1 }, filters, disabled: false,
});

/**
 * At least k ROWS, not k aliases. For multi-ID rows the flat API cannot nest OR inside count.
 * Use the equivalent CNF: every subset of n-k+1 rows must contain a matching row. Each clause is
 * one ordinary official count>=1 group. This prevents explicit+fractured aliases satisfying two
 * selected rows. Bound the expansion rather than silently issuing a different search.
 */
function countGroups(rows: readonly (readonly StatFilter[])[], minMatches: number): StatGroup[] {
  if (!Number.isInteger(minMatches) || minMatches < 1 || minMatches > rows.length) {
    throw new Error(`至少匹配的属性数必须是 1 至 ${rows.length} 的整数。`);
  }
  if (rows.every((row) => row.length === 1)) {
    return [{ type: 'count', value: { min: minMatches }, filters: rows.flat(), disabled: false }];
  }
  const width = rows.length - minMatches + 1;
  const groups: StatGroup[] = [];
  function choose(start: number, chosen: readonly (readonly StatFilter[])[]) {
    if (chosen.length === width) {
      if (groups.length >= 64) {
        throw new Error('这些属性包含多种官方映射，部分匹配的组合过多。请减少勾选属性、提高至少匹配数，或改用全部匹配。');
      }
      const seen = new Set<string>();
      const filters = chosen.flat().filter((filter) => {
        const key = JSON.stringify(filter);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      groups.push(anyGroup(filters));
      return;
    }
    for (let i = start; i <= rows.length - (width - chosen.length); i++) {
      choose(i + 1, [...chosen, rows[i]!]);
    }
  }
  choose(0, []);
  return groups;
}

/** Build a deliberate user-opened official URL. No listing requests or hidden equality filters. */
export function buildFlexibleTrade(options: FlexibleTradeOptions): {
  readonly url: string;
  readonly query: FlexibleTradeDocument;
  readonly warnings: string[];
  readonly activeCount: number;
} {
  const league = options.league.trim();
  if (!league) throw new Error('请先填写或选择官方交易赛季。');
  const category = options.baseId === 'Rings' ? 'accessory.ring'
    : options.baseId === 'Amulets' ? 'accessory.amulet' : undefined;
  if (!category) throw new Error('当前交易搜索只支持戒指和项链。');
  for (const level of [options.itemLevelMin, options.itemLevelMax]) {
    if (level !== undefined && (!Number.isInteger(level) || level < 1 || level > 100)) {
      throw new Error('交易物品等级必须是 1 至 100 的整数。');
    }
  }
  if (options.itemLevelMin !== undefined && options.itemLevelMax !== undefined
    && options.itemLevelMin > options.itemLevelMax) {
    throw new Error('交易物品等级下限不能大于上限。');
  }
  const warnings: string[] = [];
  let baseName: string | undefined;
  if (options.baseName?.trim()) {
    const name = options.baseName.trim();
    const known = findJewelleryBase(name);
    if (known && known.category !== options.baseId) throw new Error('交易底座与装备类别不一致。');
    baseName = known?.english ?? name;
    if (!known) warnings.push(`底座“${name}”尚未识别，请在官方页面核对名称。`);
  }
  const active = options.rows.filter((row) => row.enabled);
  const rows = active.map(filtersForRow);
  for (const row of active) if (row.warning && !warnings.includes(row.warning)) warnings.push(row.warning);
  let stats: StatGroup[];
  if (options.matching === 'count' && rows.length) {
    stats = countGroups(rows, options.minMatches ?? Math.min(2, rows.length));
  } else {
    stats = [{ type: 'and', filters: rows.filter((row) => row.length === 1).flat(), disabled: false },
      ...rows.filter((row) => row.length > 1).map(anyGroup)];
  }
  const query: FlexibleTradeDocument = {
    query: {
      status: { option: options.status ?? 'any' },
      ...(baseName ? { type: baseName } : {}),
      filters: {
        type_filters: { filters: { category: { option: category }, rarity: { option: options.rarity ?? 'nonunique' } } },
        ...(options.itemLevelMin === undefined && options.itemLevelMax === undefined ? {} : {
          misc_filters: { filters: { ilvl: {
            ...(options.itemLevelMin === undefined ? {} : { min: options.itemLevelMin }),
            ...(options.itemLevelMax === undefined ? {} : { max: options.itemLevelMax }),
          } } },
        }),
      },
      stats,
    },
    sort: { price: 'asc' },
  };
  return {
    url: `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(league)}?q=${encodeURIComponent(JSON.stringify(query))}`,
    query,
    warnings,
    activeCount: active.length,
  };
}
