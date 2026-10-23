import { matchEquipmentStat, type Equipment, type EquipmentMod } from './genericEquipment';
import type { EquipmentT1Result, EquipmentT1Reference } from './equipmentT1';
import type { AffixReferenceResult } from './affixReference';
import type { EquipmentTradeRow } from './genericEquipmentTrade';

export type SearchAmbition = 'auto' | 'current' | 't1' | 'near-max';
export interface ScalarRoll { min: number; max: number }
export interface RollGuide {
  current?: ScalarRoll; top?: ScalarRoll; currentPercent?: number;
  tierFloor?: { min?: number; max?: number }; lowerIsBetter: boolean;
  source?: string; note: string; safe: boolean;
  unique?: boolean;
  tiers?: EquipmentT1Reference['tiers'];
}
export function automaticUtilityRows(rows: EquipmentTradeRow[], equipment: Equipment) {
  return rows.map((row) => {
    const mod = equipment.mods.find((entry) => `mod:${entry.key}` === row.key);
    return /maximum Quality|Rarity of Items|Quantity of Items|Light Radius/i.test(mod?.ref ?? '')
      ? { ...row, enabled: false, weight: '0' } : row;
  });
}
const scalar = (low: string, high: string, modifier: EquipmentMod): ScalarRoll | undefined => {
  const a = matchEquipmentStat(low), b = matchEquipmentStat(high);
  return a.ref === modifier.ref && b.ref === modifier.ref && a.value !== undefined && b.value !== undefined
    && Number.isFinite(a.value) && Number.isFinite(b.value) && Math.abs(a.value) <= 1e12 && Math.abs(b.value) <= 1e12
    ? { min: Math.min(a.value, b.value), max: Math.max(a.value, b.value) } : undefined;
};
function clipboardRange(mod: EquipmentMod): ScalarRoll | undefined {
  const pattern = /([+-]?\d+(?:\.\d+)?)\(\s*([+-]?\d+(?:\.\d+)?)\s*[-–—]\s*([+-]?\d+(?:\.\d+)?)\s*\)/g;
  if (![...mod.raw.matchAll(pattern)].length) return undefined;
  const render = (end: 2 | 3) => mod.raw.replace(pattern, (_whole, actual: string, low: string, high: string) => {
    const value = end === 2 ? low : high;
    return actual.startsWith('-') && Number(value) >= 0 ? `-${value}` : actual.startsWith('+') && Number(value) >= 0 ? `+${value}` : value;
  });
  return scalar(render(2), render(3), mod);
}
function wikiRange(mod: EquipmentMod, result?: AffixReferenceResult): ScalarRoll | undefined {
  const found = (result?.modifiers ?? []).flatMap((entry) => {
    const implicit = mod.ids.some((id) => id.startsWith('implicit.'));
    if (implicit !== (entry.origin === 'implicit') || !/\([+-]?\d+(?:\.\d+)?\s*[—–-]/.test(entry.english)) return [];
    const render = (end: 1 | 2) => entry.english.replace(/\(([+-]?\d+(?:\.\d+)?)\s*[—–-]\s*([+-]?\d+(?:\.\d+)?)\)/g,
      (_whole, low: string, high: string) => end === 1 ? low : high);
    const range = scalar(render(1), render(2), mod);
    return range ? [range] : [];
  });
  return found.length && found.every((row) => row.min === found[0]!.min && row.max === found[0]!.max) ? found[0] : undefined;
}
export function rollGuides(equipment: Equipment, t1?: EquipmentT1Result | null, reference?: AffixReferenceResult, rows: readonly EquipmentTradeRow[] = []): Map<string, RollGuide> {
  const result = new Map(equipment.mods.map((mod): [string, RollGuide] => {
    const tier = equipment.rarity !== 'unique' ? t1?.references.get(`mod:${mod.key}`) : undefined;
    const current = clipboardRange(mod) ?? (equipment.rarity === 'unique' ? wikiRange(mod, reference) : undefined);
    const top = equipment.rarity === 'unique' ? current : tier?.roll;
    const lowerIsBetter = tier?.max !== undefined || (mod.value ?? 0) < 0;
    const hasQuality = (equipment.quality ?? 0) > 0 && (equipment.slot === 'ring' || equipment.slot === 'amulet');
    const outside = current && mod.value !== undefined && (mod.value < current.min - 1e-6 || mod.value > current.max + 1e-6);
    const safe = !!(current || top) && !hasQuality && !outside && mod.value !== undefined;
    const currentPercent = safe && current && current.max > current.min
      ? 100 * (lowerIsBetter ? current.max - mod.value! : mod.value! - current.min) / (current.max - current.min) : undefined;
    const note = hasQuality ? '原始范围未计首饰品质，暂不据此设置满 roll 门槛；自动排序使用当前显示值。'
      : outside ? '当前值超出资料范围，可能涉及品质或版本差异，保留自动排序。'
        : tier?.status === 'fixed' ? '固定／符文效果不套普通 T1 阶层。'
          : !current && !top ? tier?.note ?? '尚无已确认的 roll 范围，保持自动排序，无需猜数字。' : '';
    const tierFloor = tier?.status === 't1' ? { min: tier.min, max: tier.max } : undefined;
    return [`mod:${mod.key}`, { current, top, currentPercent, tierFloor, lowerIsBetter,
      source: equipment.rarity === 'unique' && current ? '传奇英文资料／游戏复制范围' : top ? `底座词池 ${t1?.patch}` : current ? '游戏高级复制范围' : undefined,
      safe, note, unique: equipment.rarity === 'unique', tiers: tier?.tiers }];
  }));
  for (const row of rows) if (row.targetRange && (!result.has(row.key) || !result.get(row.key)?.top)) result.set(row.key, { ...result.get(row.key), top: row.targetRange, tierFloor: row.targetFloor, lowerIsBetter: row.targetFloor?.max !== undefined,
    tiers: row.targetTiers,
    safe: !(equipment.quality && ['ring', 'amulet'].includes(equipment.slot)), source: `底座词池 ${row.targetPatch ?? ''}`, note: row.suggested ? row.key.startsWith('need:') ? '补齐推荐属性，当前未拥有；已用抗性合计保证底线，勾选本条可进一步限定补齐方式。' : 'BD 潜在属性，当前未拥有；参与候选排序，不强制所有潜在词缀同时出现。' : '' });
  return result;
}
const tidy = (value: number) => String(Math.round(value * 1e6) / 1e6);
export function guidedSearchRows(rows: readonly EquipmentTradeRow[], guides: ReadonlyMap<string, RollGuide>, ambition: SearchAmbition) {
  let applied = 0, unavailable = 0;
  const next = rows.map((row) => {
    if (!row.enabled || row.locked || row.referenceOnly || row.presenceOnly) return row;
    const cleared = { ...row, min: '', max: '' };
    if (row.suggested) return cleared;
    if (ambition === 'auto') return cleared;
    const guide = guides.get(row.key);
    if (ambition === 'current' && row.actualValue !== undefined) {
      applied++; return { ...cleared, ...(guide?.lowerIsBetter ? { max: tidy(row.actualValue) } : { min: tidy(row.actualValue) }) };
    }
    if (!guide?.safe || (ambition === 't1' ? !guide.tierFloor : !guide.top)) { unavailable++; return cleared; }
    applied++;
    if (ambition === 't1') return { ...cleared, min: guide.tierFloor!.min === undefined ? '' : tidy(guide.tierFloor!.min), max: guide.tierFloor!.max === undefined ? '' : tidy(guide.tierFloor!.max) };
    const range = guide.top!, target = guide.lowerIsBetter ? range.min + (range.max - range.min) * .1 : range.min + (range.max - range.min) * .9;
    return { ...cleared, ...(guide.lowerIsBetter ? { max: tidy(target) } : { min: tidy(target) }) };
  });
  return { rows: next, applied, unavailable };
}
