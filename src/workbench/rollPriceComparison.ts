import { buildEquipmentTrade, type EquipmentTradeOptions, type EquipmentTradeRow } from './genericEquipmentTrade';
import type { RollGuide } from './searchGuidance';

/** Vary one stat only. Every other hard requirement, budget and unique identity stays fixed. */
export function affixPriceBands(options: EquipmentTradeOptions, row: EquipmentTradeRow, guide?: RollGuide) {
  // A conditional numeric unique mod can drive price even when it is excluded
  // from unconditional damage scoring. Its verified roll is still comparable.
  if (row.locked || row.equipmentFilter || row.referenceOnly || !row.ids.length || !guide?.safe || !guide.top) return [];
  const bound = (value: number) => guide.lowerIsBetter ? { min: '', max: String(value) } : { min: String(value), max: '' };
  const { min, max } = guide.top;
  const bands = [
    ...(row.actualValue !== undefined && row.actualValue > 0 ? [{ key: 'current', label: '当前数值起步', ...bound(row.actualValue) }] : []),
    { key: 't1', label: guide.unique ? '传奇范围起步' : 'T1 起步', ...bound(guide.lowerIsBetter ? max : min) },
    { key: 'high', label: '高 roll（90%）', ...bound(Number((guide.lowerIsBetter ? min + (max - min) * .1 : min + (max - min) * .9).toFixed(6))) },
    { key: 'perfect', label: '满 roll', ...bound(guide.lowerIsBetter ? min : max) },
  ].sort((a, b) => guide.lowerIsBetter ? Number(b.max) - Number(a.max) : Number(a.min) - Number(b.min));
  const seen = new Set<string>();
  return bands.flatMap((band) => {
    const key = `${band.min}:${band.max}`; if (seen.has(key)) return []; seen.add(key);
    const rows = options.rows.map((entry) => entry.key === row.key ? { ...entry, enabled: true, min: band.min, max: band.max } : entry);
    // Ranking mode skips unconstrained scoring rows rather than turning them into existence requirements.
    const result = buildEquipmentTrade({ ...options, rows, ranking: true, constraintOnly: true, damageSort: false });
    return [{ ...band, ...result }];
  });
}
