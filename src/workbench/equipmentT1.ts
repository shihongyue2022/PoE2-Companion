import type { ItemBase, Mod, PatchData } from '../../packages/engine/src/types';
import { TRADE_CATEGORY, type GearTrade } from '../lib/gearTrade';
import { equipmentStatAliases, matchEquipmentStat, type Equipment, type EquipmentMod } from './genericEquipment';
import { equipmentTradeRows, type EquipmentTradeRow } from './genericEquipmentTrade';
import { tradeLineRangeMapping } from './tradeSearch';

export interface EquipmentT1Reference {
  status: 't1' | 'fixed' | 'unverified'; note: string; min?: number; max?: number; requiredLevel?: number;
  roll?: { min: number; max: number };
  tiers?: { tier: number; min?: number; max?: number; roll: { min: number; max: number }; requiredLevel: number }[];
}
export interface EquipmentT1Result {
  rows: EquipmentTradeRow[]; references: ReadonlyMap<string, EquipmentT1Reference>; issues: string[];
  tieredCount: number; complete: boolean; patch: string;
}
const hashes = (ids: readonly string[]) => new Set(ids.map((id) => id.split('.').pop()));
const allPoolIds = (base: ItemBase): string[] => [...new Set([
  ...base.pools.normal.prefixes, ...base.pools.normal.suffixes, ...base.pools.desecrated.prefixes, ...base.pools.desecrated.suffixes,
  ...base.pools.essence.prefixes, ...base.pools.essence.suffixes,
])];

export function referenceFor(modifier: EquipmentMod, pool: readonly Mod[], data: PatchData, trade: GearTrade, allowedRunes: readonly string[] = []): EquipmentT1Reference {
  const placements = new Set(modifier.ids.map((id) => id.split('.')[0]));
  if (['implicit', 'enchant', 'rune'].some((origin) => placements.has(origin))) return { status: 'fixed', note: '固定／附魔／符文效果不按普通词缀评 T1；保留原属性条件。' };
  if (!modifier.searchable || !modifier.ref) return { status: 'unverified', note: '尚未识别为唯一的官方交易属性，不能确认 T1。' };
  const expected = hashes(modifier.ids);
  const source = placements.has('desecrated') && !placements.has('explicit') && !placements.has('fractured') ? 'desecrated' : 'normal';
  const candidates: { min?: number; max?: number; roll?: { min: number; max: number }; tiers?: EquipmentT1Reference['tiers']; requiredLevel: number; fixed: boolean; family: string; source: string }[] = [];
  for (const mod of pool) {
    if (mod.rune && !allowedRunes.includes(mod.rune) || modifier.affixType && mod.type !== modifier.affixType) continue;
    // Desecration can mark an ordinary mod too; prefer its special pool only when it actually matches.
    if (!['normal', ...(source === 'desecrated' ? ['desecrated'] : [])].includes(mod.source) || !mod.text) continue;
    const tier = mod.tiers.at(-1); if (!tier) continue;
    const lines = mod.text.split('\n');
    for (const [index, entry] of (trade.mods[mod.id] ?? []).entries()) {
      if (!entry) continue;
      const shared = trade.rows[entry[0]];
      if (!shared?.ids.some((id) => expected.has(id.split('.').pop()))) continue;
      const layout = tradeLineRangeMapping(mod, entry, index);
      const ranges = tier.ranges.slice(layout.first, layout.first + layout.count);
      if (ranges.length !== layout.count || ranges.some((range) => !Number.isFinite(range[0]) || !Number.isFinite(range[1]) || range[0]! > range[1]!)) continue;
      let template = lines[index] ?? '';
      if (layout.count === 2 && /^Adds (?:#|[+-]?\d+) to (?:#|[+-]?\d+) .+ damage/i.test(template)) template = template.replace(/^Adds (?:#|[+-]?\d+) to (?:#|[+-]?\d+)/i, 'Adds # to #');
      const render = (end: 0 | 1, sourceRanges = ranges) => {
        let at = 0;
        return template.replace(/#/g, () => String(sourceRanges[at++]?.[end] ?? NaN));
      };
      // An ambiguous upstream row may list near-matching IDs. Require exact meaning after rendering,
      // rather than using the broad ID list as proof that the tier belongs to this clipboard effect.
      const low = matchEquipmentStat(render(0)), high = matchEquipmentStat(render(1));
      if (low.ref !== modifier.ref || high.ref !== modifier.ref) continue;
      if (low.value === undefined || high.value === undefined) {
        if (!layout.count && mod.tiers.length === 1) candidates.push({ requiredLevel: tier.ilvl, fixed: true, family: mod.family, source: mod.source });
        continue;
      }
      const min = Math.min(low.value, high.value), max = Math.max(low.value, high.value);
      // Signed reduced/cost stats need an upper bound. Do not reuse the positive-stat lower-bound rule.
      const previous = mod.tiers.at(-2)?.ranges.slice(layout.first, layout.first + layout.count);
      const previousLow = previous ? matchEquipmentStat(render(0, previous)).value : undefined;
      const previousHigh = previous ? matchEquipmentStat(render(1, previous)).value : undefined;
      const lowerIsBetter = previousLow !== undefined && previousHigh !== undefined
        ? min + max < previousLow + previousHigh : modifier.value !== undefined && modifier.value < 0;
      const tiers = mod.tiers.flatMap((entry, index) => {
        const ranges = entry.ranges.slice(layout.first, layout.first + layout.count);
        if (ranges.length !== layout.count || ranges.some((range) => !Number.isFinite(range[0]) || !Number.isFinite(range[1]) || range[0]! > range[1]!)) return [];
        const a = matchEquipmentStat(render(0, ranges)), b = matchEquipmentStat(render(1, ranges));
        if (a.ref !== modifier.ref || b.ref !== modifier.ref || a.value === undefined || b.value === undefined) return [];
        const low = Math.min(a.value, b.value), high = Math.max(a.value, b.value);
        return [{ tier: mod.tiers.length - index, ...(lowerIsBetter ? { max: high } : { min: low }), roll: { min: low, max: high }, requiredLevel: entry.ilvl }];
      }).sort((a, b) => a.tier - b.tier);
      candidates.push({ ...(lowerIsBetter ? { max } : { min }), roll: { min, max }, tiers, requiredLevel: tier.ilvl, fixed: false, family: mod.family, source: mod.source });
    }
  }
  const preferred = source === 'desecrated' && candidates.some((candidate) => candidate.source === 'desecrated') ? candidates.filter((candidate) => candidate.source === 'desecrated') : candidates;
  if (!preferred.length) return { status: 'unverified', note: '当前底座词池没有可核对的 T1 阶层；不会沿用原数值冒充 T1。' };
  const signatures = new Set(preferred.map(({ min, max, roll, fixed, family, source }) => JSON.stringify({ min, max, roll, fixed, family, source })));
  if (signatures.size !== 1) return { status: 'unverified', note: '此属性可能来自不同词缀或混合词缀，T1 范围不唯一。请使用 Ctrl+Alt+C 高级复制后核对前后缀。' };
  const found = preferred[0]!;
  // A unique T1 can remain valid even when lower tiers differ. Expose a full
  // ladder only when it is unambiguous, rather than inventing T2/T3 thresholds.
  const tiers = new Set(preferred.map((entry) => JSON.stringify(entry.tiers))).size === 1 ? found.tiers : undefined;
  return found.fixed ? { status: 'fixed', note: '此效果在规则中只有固定机制，没有可提高的数值阶层。' }
    : { status: 't1', min: found.min, max: found.max, roll: found.roll, tiers, requiredLevel: found.requiredLevel,
      note: `T1 参考${found.max === undefined ? '下限' : '上限'} ${found.min ?? found.max} · 规则 ${data.patch} · 所需物等 ${found.requiredLevel}` };
}

/** Every printed affix direction remains required; no pseudo totals or three-stat substitutions. */
export function buildEquipmentT1Rows(equipment: Equipment, data: PatchData, trade: GearTrade): EquipmentT1Result {
  const references = new Map<string, EquipmentT1Reference>(), issues: string[] = [];
  const bases = [...data.bases.values()].filter((base) => TRADE_CATEGORY[base.category] === equipment.category);
  const base = bases.find((base) => base.bases?.some((name) => name.toLowerCase() === equipment.baseNameEnglish?.toLowerCase()))
    ?? (bases.length === 1 ? bases[0] : undefined);
  const pool = base ? allPoolIds(base).flatMap((id) => data.mods.get(id) ?? []) : [];
  const allowed = (equipment.kind === undefined || equipment.kind === 'equipment') && equipment.rarity !== 'unique' && equipment.identified;
  if (!allowed) issues.push('全词缀 T1 用于已鉴定的非传奇装备；传奇、宝石和材料不能套用普通词缀 T1。');
  if (!base) issues.push('当前底座尚未匹配唯一的规则词池，无法安全生成全 T1 条件。');
  for (const modifier of equipment.mods) {
    const reference = referenceFor(modifier, pool, data, trade);
    references.set(`mod:${modifier.key}`, reference);
    if (reference.status === 'unverified') issues.push(`${modifier.label}：${reference.note}`);
  }
  let tieredCount = 0;
  const rows = equipmentTradeRows(equipment, 'strict').map((row): EquipmentTradeRow => {
    const reference = references.get(row.key);
    // Printed armour/DPS are item totals, not independently tiered affixes.
    if (row.equipmentFilter) return { ...row, enabled: false, min: '', max: '' };
    if (reference?.status === 't1') {
      tieredCount++;
      const modifier = equipment.mods.find((modifier) => `mod:${modifier.key}` === row.key);
      const ids = modifier?.ref ? equipmentStatAliases(modifier.ref, row.ids) : row.ids;
      return { ...row, ids, enabled: true, min: reference.min === undefined ? '' : String(reference.min), max: reference.max === undefined ? '' : String(reference.max) };
    }
    return { ...row, enabled: true, min: '', max: '', ...(reference?.status === 'unverified' ? { warning: reference.note } : {}) };
  });
  if (!tieredCount) issues.push('没有可生成 T1 数值门槛的随机词缀。');
  return { rows, references, issues: [...new Set(issues)], tieredCount,
    complete: allowed && Boolean(base) && tieredCount > 0 && !issues.length, patch: data.patch };
}

export function equipmentT1Satisfied(result: EquipmentT1Result, rows: readonly EquipmentTradeRow[]): boolean {
  return result.complete && [...result.references].every(([key, reference]) => {
    const row = rows.find((entry) => entry.key === key);
    return row?.enabled && (reference.min === undefined || row.min.trim() !== '' && Number(row.min) >= reference.min)
      && (reference.max === undefined || row.max.trim() !== '' && Number(row.max) <= reference.max);
  });
}
