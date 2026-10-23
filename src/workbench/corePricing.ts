import { buildEquipmentTrade, type EquipmentTradeOptions, type EquipmentTradeRow } from './genericEquipmentTrade';
import { equipmentMetrics, type Equipment } from './genericEquipment';
import type { EstimateListing } from './marketEstimate';
import { equipmentFromListing } from './upgradeRanking';

export function corePriceAxes(item: Equipment, rows: readonly EquipmentTradeRow[]) {
  return rows.filter((row) => ((row.actualValue !== undefined && row.actualValue > 0 && !row.suggested) || !!row.searchPresets?.length) && !row.referenceOnly &&
    (row.equipmentFilter ? ['pdps', 'edps', 'ar', 'ev', 'es', 'spirit', 'ilvl'].includes(row.equipmentFilter) :
      row.ids.length > 0 && new Set(row.ids.map((id) => id.split('.').at(-1))).size === 1))
    .map((row) => ({ ...row, priority: row.equipmentFilter === 'ilvl' ? -10 : row.suggested ? -5 : row.equipmentFilter === 'pdps' && item.slot === 'weapon' ? 100 :
      /Damage.*for each|for each.*Damage/i.test(item.mods.find((mod) => `mod:${mod.key}` === row.key)?.ref ?? '') ? 110 :
      /Damage|Skill|Speed|Critical/i.test(item.mods.find((mod) => `mod:${mod.key}` === row.key)?.ref ?? '') ? 80 :
      row.equipmentFilter ? 60 : /Resistance|抗性/.test(row.label) ? 10 : 30 }))
    .sort((a, b) => b.priority - a.priority);
}

export interface CorePriceSelection { row: EquipmentTradeRow; mode?: 'at-least' | 'same'; gain?: number; preset?: string }

function coreConstraint({ row: core, mode = 'at-least', gain = 0, preset }: CorePriceSelection): { row: EquipmentTradeRow; min?: number; max?: number; current?: number; rangeLabel: string } {
  if (preset) {
    const choice = core.searchPresets?.find((entry) => entry.id === preset);
    if (!choice || choice.min === undefined && choice.max === undefined || [choice.min, choice.max].some((value) => value !== undefined && !Number.isFinite(value))) throw new Error('属性档位已变化，请重新选择。');
    return { row: core, min: choice.min, max: choice.max, current: core.actualValue, rangeLabel: choice.min === undefined ? `≤ ${choice.max}` : `≥ ${choice.min}${choice.max === undefined ? '' : `，≤ ${choice.max}`}` };
  }
  const value = core.actualValue!;
  if (!Number.isFinite(value) || value <= 0 || !['at-least', 'same'].includes(mode) || ![0, 1, 3, 5].includes(gain) || mode === 'same' && gain !== 0) throw new Error('核心属性或提升要求无效。');
  const min = gain === 0 ? value : Math.max(value, Number((value * (1 + gain / 100)).toFixed(6)));
  const max = mode === 'same' ? value : undefined;
  return { row: core, min, max, current: value, rangeLabel: max === undefined ? `≥ ${min}` : `= ${min}` };
}

/** Every selected core is a hard AND condition. Only one controls descending
 * order, so a stronger roll cannot compensate for another failing its floor. */
export function jointCorePriceQuery(options: EquipmentTradeOptions, selections: readonly CorePriceSelection[], sortKey?: string, overview = false) {
  if (!selections.length) throw new Error('请至少添加一项核心属性。');
  const keys = new Set(selections.map(({ row }) => row.key));
  if (keys.size !== selections.length || selections.some(({ row }) => !options.rows.some((entry) => entry.key === row.key))) throw new Error('联合检索属性重复或已变化，请重新选择。');
  const constraints = selections.map(coreConstraint);
  const primary = constraints.find(({ row }) => row.key === sortKey && row.filterGroup !== 'misc_filters') ?? constraints.find(({ row }) => row.filterGroup !== 'misc_filters') ?? constraints[0]!;
  if (overview && primary.row.filterGroup === 'misc_filters') throw new Error('物品等级只作筛选，请另选一项属性进行降序比较。');
  const rows = options.rows.map((row) => {
    const condition = constraints.find((entry) => entry.row.key === row.key);
    return condition ? { ...condition.row, enabled: true, presenceOnly: false, min: condition.min === undefined ? '' : String(condition.min), max: condition.max === undefined ? '' : String(condition.max), weight: '0' }
      : { ...row, enabled: !!row.locked && row.enabled, weight: '0' };
  });
  const result = buildEquipmentTrade({ ...options, rows, ranking: true, constraintOnly: true, damageSort: false });
  const query = !overview ? result.query : primary.row.equipmentFilter ? { ...result.query, sort: { [primary.row.equipmentFilter]: 'desc' as const } } : {
    ...result.query, query: { ...result.query.query, stats: [{ type: 'weight' as const, disabled: false as const,
      filters: primary.row.ids.map((id) => ({ id, disabled: false as const, value: { weight: 1 } })) }, ...result.query.query.stats] }, sort: { 'statgroup.0': 'desc' as const },
  };
  const url = `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(options.league)}?q=${encodeURIComponent(JSON.stringify(query))}`;
  return { query, url, constraints, primaryKey: primary.row.key, overview, summary: constraints.map(({ row, rangeLabel }) => `${row.label} ${rangeLabel}`).join('；') };
}

export function corePriceQuery(options: EquipmentTradeOptions, core: EquipmentTradeRow,
  { mode = 'at-least', gain = 0, overview = false }: { mode?: 'at-least' | 'same'; gain?: number; overview?: boolean } = {}) {
  const result = jointCorePriceQuery(options, [{ row: core, mode, gain }], core.key, overview), condition = result.constraints[0]!;
  return { ...result, min: condition.min, max: condition.max, current: condition.current, label: core.label, rangeLabel: condition.rangeLabel };
}

export function listingCoreMatch(listing: EstimateListing, constraints: ReturnType<typeof jointCorePriceQuery>['constraints']) {
  const values = constraints.map(({ row }) => listingCoreValue(listing, row));
  return { values, matches: constraints.length > 0 && constraints.every(({ min, max }, index) => {
    const value = values[index]; return value !== undefined && (min === undefined || value >= min) && (max === undefined || value <= max);
  }) };
}

export function listingCoreValue(listing: EstimateListing, core: EquipmentTradeRow): number | undefined {
  if (core.equipmentFilter === 'ilvl') return listing.itemLevel;
  const item = equipmentFromListing(listing); if (!item) return undefined;
  if (core.equipmentFilter) return equipmentMetrics(item)[({ pdps: 'physicalDps', edps: 'elementalDps', ar: 'armour', ev: 'evasion', es: 'energyShield', spirit: 'spirit' } as Record<string, string>)[core.equipmentFilter]!];
  const matches = item.mods.filter((mod) => mod.ids.some((id) => core.ids.includes(id)));
  return matches.length && matches.every((mod) => mod.value !== undefined) ? matches.reduce((sum, mod) => sum + mod.value!, 0) : undefined;
}
