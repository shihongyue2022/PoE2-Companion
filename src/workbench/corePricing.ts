import { buildEquipmentTrade, type EquipmentTradeOptions, type EquipmentTradeRow } from './genericEquipmentTrade';
import { equipmentMetrics, type Equipment } from './genericEquipment';
import type { EstimateListing } from './marketEstimate';
import { equipmentFromListing } from './upgradeRanking';
import type { RollGuide } from './searchGuidance';

export function corePriceAxes(item: Equipment, rows: readonly EquipmentTradeRow[]) {
  return rows.filter((row) => row.actualValue !== undefined && row.actualValue > 0 && !row.referenceOnly && !row.suggested &&
    (row.equipmentFilter ? ['pdps', 'edps', 'ar', 'ev', 'es', 'spirit'].includes(row.equipmentFilter) :
      row.ids.length > 0 && new Set(row.ids.map((id) => id.split('.').at(-1))).size === 1))
    .map((row) => ({ ...row, priority: row.equipmentFilter === 'pdps' && item.slot === 'weapon' ? 100 :
      /Damage.*for each|for each.*Damage/i.test(item.mods.find((mod) => `mod:${mod.key}` === row.key)?.ref ?? '') ? 110 :
      /Damage|Skill|Speed|Critical/i.test(item.mods.find((mod) => `mod:${mod.key}` === row.key)?.ref ?? '') ? 80 :
      row.equipmentFilter ? 60 : /Resistance|抗性/.test(row.label) ? 10 : 30 }))
    .sort((a, b) => b.priority - a.priority);
}

/** The single native stat is the price axis. Other optional rolls must not silently
 * exclude cheap items. User locked constraints, identity and corruption remain. */
export function corePriceQuery(options: EquipmentTradeOptions, core: EquipmentTradeRow, width: number, offset: -1 | 0 | 1,
  overview = false, guide?: RollGuide) {
  const value = core.actualValue!;
  if (!Number.isFinite(value) || value <= 0 || ![0, 1, 3, 5].includes(width)) throw new Error('核心属性或相近档位无效。');
  const step = width === 0 ? 1 : Math.max(1, Math.abs(value) * width / 100);
  const center = value + offset * step * (width === 0 ? 1 : 2);
  let min = width === 0 ? center : center - step, max = width === 0 ? center : center + step;
  if (!overview && guide?.safe && guide.unique && guide.top) { min = Math.max(min, guide.top.min); max = Math.min(max, guide.top.max); }
  if (min > max) throw new Error('这一档超出已核对的词缀范围。');
  min = Number(min.toFixed(4)); max = Number(max.toFixed(4));
  const selected = { ...core, enabled: true, presenceOnly: false, min: overview ? '' : String(min), max: overview ? '' : String(max), weight: '1' };
  const rows = options.rows.map((row) => row.key === core.key ? selected : { ...row, enabled: !!row.locked && row.enabled, weight: '0' });
  const result = buildEquipmentTrade({ ...options, rows, ranking: true, constraintOnly: !overview || !!core.equipmentFilter, damageSort: false });
  const query = overview && core.equipmentFilter ? { ...result.query, sort: { [core.equipmentFilter]: 'desc' as const } } : result.query;
  const url = `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(options.league)}?q=${encodeURIComponent(JSON.stringify(query))}`;
  return { query, url, min, max, current: value, overview, label: core.label };
}

export function listingCoreValue(listing: EstimateListing, core: EquipmentTradeRow): number | undefined {
  const item = equipmentFromListing(listing); if (!item) return undefined;
  if (core.equipmentFilter) return equipmentMetrics(item)[({ pdps: 'physicalDps', edps: 'elementalDps', ar: 'armour', ev: 'evasion', es: 'energyShield', spirit: 'spirit' } as Record<string, string>)[core.equipmentFilter]!];
  const matches = item.mods.filter((mod) => mod.ids.some((id) => core.ids.includes(id)));
  return matches.length && matches.every((mod) => mod.value !== undefined) ? matches.reduce((sum, mod) => sum + mod.value!, 0) : undefined;
}
