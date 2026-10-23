import type { ItemBase, Mod, PatchData } from '../../packages/engine/src/types';
import { limitsOf } from '../../packages/engine/src/item';
import { TRADE_CATEGORY, type GearTrade } from '../lib/gearTrade';
import { equipmentStatAliases, matchEquipmentStat, type Equipment, type EquipmentMod } from './genericEquipment';
import { referenceFor, type EquipmentT1Reference } from './equipmentT1';
import { tradeLineRangeMapping } from './tradeSearch';
import type { EquipmentTradeRow } from './genericEquipmentTrade';
import type { LoadoutContext } from './loadoutIntegration';
import { resistanceGate, RESISTANCE_GOALS } from './resistanceModel';

export function affixBase(equipment: Equipment, data?: PatchData): ItemBase | undefined {
  const bases = [...data?.bases.values() ?? []].filter((base) => TRADE_CATEGORY[base.category] === equipment.category);
  return bases.find((base) => base.bases?.some((name) => name.toLowerCase() === equipment.baseNameEnglish?.toLowerCase()));
}
export interface AvailableAffix {
  mod: EquipmentMod; type: 'prefix' | 'suffix'; family: string;
  reference: EquipmentT1Reference;
  requiredRune?: string;
}
/** Only verified, ordinary affixes from this base. Unique mods are a separate item definition. */
export function availableAffixes(equipment: Equipment, data?: PatchData, trade?: GearTrade | null, allowedRunes: readonly string[] = []): AvailableAffix[] {
  const base = data && affixBase(equipment, data);
  if (!base || !data || !trade || equipment.rarity === 'unique') return [];
  const pool = [...new Set([...base.pools.normal.prefixes, ...base.pools.normal.suffixes,
    ...allowedRunes.flatMap((id) => { const pool = base.pools.rune?.[id]; return pool ? [...pool.prefixes, ...pool.suffixes] : []; })])].flatMap((id) => data.mods.get(id) ?? []);
  const found = new Map<string, AvailableAffix>();
  for (const entry of pool) {
    if (entry.source !== 'normal' || entry.rune && !allowedRunes.includes(entry.rune)) continue;
    for (const [line, mapping] of (trade.mods[entry.id] ?? []).entries()) {
      if (!mapping || !trade.rows[mapping[0]]?.ids.length) continue;
      const layout = tradeLineRangeMapping(entry, mapping, line), mod = probeAffix(entry, line, layout.first, layout.count);
      if (!mod?.searchable || !mod.ref) continue;
      const reference = referenceFor(mod, pool, data, trade, allowedRunes);
      if (reference.status !== 't1' || !reference.roll) continue;
      found.set(`${entry.type}:${entry.family}:${mod.ref}`, { mod, type: entry.type, family: entry.family, reference, requiredRune: entry.rune });
    }
  }
  return [...found.values()];
}
function probeAffix(entry: Mod, line: number, first: number, count: number): EquipmentMod | undefined {
  const ranges = entry.tiers.at(-1)?.ranges.slice(first, first + count);
  if (!ranges || !count || ranges.length !== count) return undefined;
  let at = 0, template = entry.text?.split('\n')[line] ?? '';
  if (count === 2 && /^Adds (?:#|\d+) to (?:#|\d+)/i.test(template)) template = template.replace(/^Adds (?:#|\d+) to (?:#|\d+)/i, 'Adds # to #');
  return { ...matchEquipmentStat(template.replace(/#/g, () => String(ranges[at++]?.[1] ?? NaN))), affixType: entry.type };
}
export function affixTargetMetadata(affix: AvailableAffix, patch?: string): Partial<EquipmentTradeRow> {
  return { affixType: affix.type, affixFamily: affix.family, targetRange: affix.reference.roll,
    targetTiers: affix.reference.tiers, targetFloor: { min: affix.reference.min, max: affix.reference.max }, targetPatch: patch, requiredRune: affix.requiredRune };
}
export function describeAffixRows(rows: readonly EquipmentTradeRow[], equipment: Equipment, catalogue: readonly AvailableAffix[], patch?: string) {
  return rows.map((row) => {
    const current = equipment.mods.find((mod) => row.key === `mod:${mod.key}`);
    const ref = row.scoringRef ?? current?.ref;
    const matches = catalogue.filter((entry) => entry.mod.ref === ref && (!current?.affixType || entry.type === current.affixType));
    return matches.length === 1 ? { ...affixTargetMetadata(matches[0]!, patch), ...row, affixType: current?.affixType ?? matches[0]!.type }
      : { ...row, affixType: row.affixType ?? current?.affixType };
  });
}
export function affixRowGroups(rows: readonly EquipmentTradeRow[], unique: boolean) {
  const group = (row: EquipmentTradeRow) => row.locked ? '整套抗性硬约束' : row.affixType === 'prefix' ? '前缀' : row.affixType === 'suffix' ? '后缀'
    : row.equipmentFilter ? '物品面板' : unique ? '传奇／固定效果' : '固定效果与待核对来源';
  return ['整套抗性硬约束', '前缀', '后缀', '物品面板', '传奇／固定效果', '固定效果与待核对来源']
    .map((label) => ({ label, rows: rows.filter((row) => group(row) === label) })).filter((entry) => entry.rows.length);
}
export function rareAlternative(equipment: Equipment, data?: PatchData, trade?: GearTrade | null): Equipment {
  const rare = { ...equipment, rarity: 'rare' as const };
  const refs = new Set(availableAffixes(rare, data, trade).map((entry) => entry.mod.ref));
  return { ...rare, mods: equipment.mods.filter((mod) => refs.has(mod.ref) && !mod.ids.some((id) => /^(?:implicit|enchant|rune)\./.test(id))) };
}
/** Add real missing resist affixes without making every possible solution mandatory.
 * The existing pseudo-total constraint accepts hybrid, implicit and other legal contributions. */
export function addResistanceAffixRows(rows: readonly EquipmentTradeRow[], equipment: Equipment, context: LoadoutContext | undefined,
  catalogue: readonly AvailableAffix[], patch?: string): EquipmentTradeRow[] {
  if (!context || context.state.slots[context.slot] !== context.raw) return [...rows];
  const gate = resistanceGate(context.state, context.slot, equipment);
  const elements = ['Fire', 'Cold', 'Lightning', 'Chaos'];
  const result = [...rows];
  for (const [index, goal] of RESISTANCE_GOALS.entries()) {
    const need = gate.rows.find((entry) => entry.key === goal.key)?.requiredOnItem;
    if (need === undefined || need <= 0) continue;
    const affix = catalogue.find((entry) => entry.mod.ref === `#% to ${elements[index]} Resistance`);
    if (!affix) continue;
    const existing = result.findIndex((row) => row.key === `need:${goal.key}` || row.scoringRef === affix.mod.ref || equipment.mods.some((mod) => row.key === `mod:${mod.key}` && mod.ref === affix.mod.ref));
    const metadata = affixTargetMetadata(affix, patch);
    const recommendation = `补${goal.label}：移除旧${equipment.slot === 'belt' ? '腰带' : '本栏装备'}后，本栏合计需要至少 ${Number(need.toFixed(2))}%。可由这条词缀或其他合法抗性组合满足；抗性溢出不计伤害分。`;
    if (existing >= 0) result[existing] = { ...result[existing]!, ...metadata, scoringRef: affix.mod.ref, recommendation };
    else result.push({ key: `need:${goal.key}`, label: affix.mod.label.replace(/[+-]?\d+(?:\.\d+)?/g, '#'),
      ids: equipmentStatAliases(affix.mod.ref!, affix.mod.ids, ['implicit', 'enchant', 'rune']),
      enabled: false, min: '', max: '', actualValue: 0, weight: '0', scoringRef: affix.mod.ref, suggested: true,
      ...metadata, recommendation });
  }
  return result;
}
export function affixStructure(equipment: Equipment, data?: PatchData) {
  if (equipment.rarity === 'unique') return { title: '传奇固定词缀组 · 不套稀有装备前后缀上限', complete: false, prefixes: 0, suffixes: 0, unknown: 0 };
  const limits = equipment.rarity === 'magic' ? { prefixes: 1, suffixes: 1 } : limitsOf(affixBase(equipment, data));
  const groups = new Map<number, EquipmentMod['affixType']>(); let unknown = 0;
  for (const mod of equipment.mods) {
    if (mod.ids.some((id) => /^(?:implicit|enchant|rune)\./.test(id))) continue;
    if (mod.affixGroup === undefined || !mod.affixType) { unknown++; continue; }
    groups.set(mod.affixGroup, mod.affixType);
  }
  const prefixes = [...groups.values()].filter((side) => side === 'prefix').length;
  const suffixes = [...groups.values()].filter((side) => side === 'suffix').length;
  const complete = !unknown && equipment.identified && prefixes <= limits.prefixes && suffixes <= limits.suffixes;
  return { prefixes, suffixes, unknown, complete, limits,
    title: `前缀 ${prefixes}/${limits.prefixes} · 后缀 ${suffixes}/${limits.suffixes} · ${!complete ? '词缀位待核对（需游戏高级复制）' : prefixes === limits.prefixes && suffixes === limits.suffixes ? '已满词缀' : `空余 ${limits.prefixes - prefixes} 前缀 / ${limits.suffixes - suffixes} 后缀`}` };
}
