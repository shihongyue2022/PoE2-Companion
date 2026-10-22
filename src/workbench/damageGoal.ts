import { equipmentMetricDetails, parseEquipment, type Equipment, type EquipmentMod } from './genericEquipment';
import { equipmentSignature, validCharacterPanel } from './characterPanel';
import { classifySkillMod, skillPlan, skillWeaponWarning } from './skillRecommendation';
import type { LoadoutSlot, LoadoutState, ResistanceKey } from './loadout';
import type { EquipmentTradeRow } from './genericEquipmentTrade';
import { scoreUpgrade, upgradeComponents } from './upgradeRanking';

export const CAPPED_DAMAGE_OBJECTIVE = 'capped-damage' as const;
export const RESISTANCE_GOALS = [
  { key: 'fireResistance', label: '火焰抗性', id: 'pseudo.pseudo_total_fire_resistance' },
  { key: 'coldResistance', label: '冰冷抗性', id: 'pseudo.pseudo_total_cold_resistance' },
  { key: 'lightningResistance', label: '闪电抗性', id: 'pseudo.pseudo_total_lightning_resistance' },
  { key: 'chaosResistance', label: '混沌抗性', id: 'pseudo.pseudo_total_chaos_resistance' },
] as const;
export function usesDamageGoal(state: LoadoutState) { return state.goals.objective === CAPPED_DAMAGE_OBJECTIVE; }
export function resistanceBaseline(state: LoadoutState) {
  if (validCharacterPanel(state) && state.character) return { ...state.character, origin: '游戏面板基准' };
  if (state.source?.equipmentSignature === equipmentSignature(state.slots) && state.source.reference) {
    return { ...state.source.reference, origin: 'PoB2 保存的角色总值' };
  }
  return undefined;
}
export function damageSkill(state: LoadoutState) {
  return skillPlan(state);
}
function offensive(mod: EquipmentMod, tags: readonly string[]) {
  const ref = mod.ref ?? '';
  if (!ref || /Minion|Allies|Damage taken|Enemy.*Resistance|\bper\b|\bfor each\b|\bwhile\b|\bif\b|\bwhen\b|Recently|Nearby|During|Requirements|Cost|Duration/i.test(ref)) return false;
  if (/Critical (?:Damage|Hit|Strike)/i.test(ref)) return tags.includes('attack') || tags.includes('spell');
  if (/Attack Speed/i.test(ref)) return tags.includes('attack');
  if (/Cast Speed|Spell Damage/i.test(ref)) return tags.includes('spell');
  if (/Projectile Damage/i.test(ref)) return tags.includes('projectile');
  if (/Melee Damage/i.test(ref)) return tags.includes('melee');
  if (/^Adds # to # .+ Damage to Attacks$/i.test(ref)) return tags.includes('attack');
  if (/^Adds # to # .+ Damage to Spells$/i.test(ref)) return tags.includes('spell');
  if (/^Adds # to # .+ Damage$/i.test(ref)) return tags.includes('attack');
  if (/increased (?:Physical|Elemental|Fire|Cold|Lightning|Chaos|Attack) Damage/i.test(ref)) {
    if (/Attack/i.test(ref) && !tags.includes('attack')) return false;
    return tags.includes('attack') || tags.includes('spell');
  }
  return false;
}

/** Resistances are constraints. Non-offensive life/defence/overflow never enter the score. */
export function damageGoalRows(rows: readonly EquipmentTradeRow[], equipment: Equipment, state: LoadoutState): EquipmentTradeRow[] {
  const plan = skillPlan(state);
  if (state.goals.mainSkill && !plan) return rows.map((row) => ({ ...row, weight: '0' }));
  const tags = plan?.tags ?? (equipment.slot === 'weapon' && !/wand|sceptre|staff/.test(equipment.category) ? ['attack'] : []);
  return rows.map((row) => {
    const mod = equipment.mods.find((entry) => `mod:${entry.key}` === row.key) ?? (row.scoringRef ? { ref: row.scoringRef } : undefined);
    const advice = plan && mod ? classifySkillMod(plan, mod, equipment) : undefined;
    const damage = !!mod && (advice ? advice.weight > 0 : offensive(mod as EquipmentMod, tags)) && !row.presenceOnly && ((row.actualValue ?? 0) > 0 || !!row.referenceScale);
    const preserve = !row.equipmentFilter && (row.presenceOnly || row.actualValue === undefined || row.ids.some((id) => id.startsWith('skill.')));
    return { ...row, enabled: damage || preserve, weight: damage ? row.recommendation ? row.weight || '1' : String(advice?.weight ?? Number(row.weight || '1')) : '0', min: '', max: '', scoringRef: damage ? mod?.ref : undefined,
      recommendation: advice?.reason ?? row.recommendation };
  });
}
export interface ResistanceGoalRow {
  key: ResistanceKey; label: string; before?: number; after?: number; cap?: number;
  minimum?: number; requiredOnItem?: number; met?: boolean;
}
export interface ResistanceGate {
  status: 'met' | 'unmet' | 'unknown'; origin?: string; rows: ResistanceGoalRow[]; notes: string[];
}
const ordinaryResistance = (mod: EquipmentMod) => /^#% to (?:all Elemental Resistances|(?:Fire|Cold|Lightning|Chaos)(?: and (?:Fire|Cold|Lightning|Chaos))? Resistances?)(?: per Socket filled)?$/.test(mod.ref ?? '');
function changedResistanceMechanic(before: Equipment | null, after: Equipment) {
  const special = (item: Equipment | null) => (item?.mods ?? []).filter((mod) => /Resistance/i.test(mod.ref ?? mod.englishText ?? mod.text)
    && !ordinaryResistance(mod))
    .map((mod) => `${mod.ref ?? mod.text}:${mod.values.join(',')}`).sort().join('|');
  return special(before) !== special(after);
}
export function resistanceGate(state: LoadoutState, slot: LoadoutSlot, candidate: Equipment,
  context: { beforeFilledSockets?: number; afterFilledSockets?: number } = {}): ResistanceGate {
  const baseline = resistanceBaseline(state), previous = parseEquipment(state.slots[slot] ?? '');
  const oldDetails: Pick<ReturnType<typeof equipmentMetricDetails>, 'values' | 'pending'> = previous ? equipmentMetricDetails(previous, { filledSockets: context.beforeFilledSockets }) : { values: {}, pending: [] };
  const newDetails = equipmentMetricDetails(candidate, { filledSockets: context.afterFilledSockets });
  const notes: string[] = [];
  if (!baseline) notes.push('缺少对应当前装备的角色未封顶总抗性，请更新 PoB2 或录入游戏面板；装备抗性之和不能代替角色总值。');
  const changedMechanic = changedResistanceMechanic(previous, candidate);
  if (changedMechanic) notes.push('候选改变了抗性上限、条件抗性或未完整解析的抗性机制，需要 PoB2／游戏复核。');
  const wornMods = Object.values(state.slots).flatMap((raw) => { const item = parseEquipment(raw); return item && item.slot !== 'flask' && item.slot !== 'charm' ? item.mods : []; });
  const scaling = [...wornMods, ...candidate.mods]
    .some((mod) => !ordinaryResistance(mod) && /(?:increased|reduced|less|more|\bper\b|\bwhile\b|\bif\b|\bwhen\b|based on).*Resistances?|Resistances?.*(?:increased|reduced|less|more|\bper\b|\bwhile\b|\bif\b|\bwhen\b|based on)/i.test(mod.ref ?? mod.englishText ?? mod.text));
  if (scaling) notes.push('装备含抗性缩放机制，不能用普通加减保证封顶，请在 PoB2 复核。');
  const unresolved = [...(previous?.mods ?? []), ...candidate.mods].some((mod) => /Resistance/i.test(mod.ref ?? mod.englishText ?? mod.text)
    && (!mod.ref || ordinaryResistance(mod) && mod.value === undefined));
  if (unresolved) notes.push('替换栏位存在未核对的抗性数值，不把缺失贡献当作零。');
  const rows = RESISTANCE_GOALS.map(({ key, label }): ResistanceGoalRow => {
    const before = baseline?.values[key], cap = baseline?.caps[key] ?? (baseline?.origin === '游戏面板基准' ? 75 : undefined);
    const minimum = cap === undefined ? undefined : Math.max(cap, state.goals.minimums[key] ?? cap);
    const complete = before !== undefined && minimum !== undefined && !!previous?.identified && candidate.identified
      && !oldDetails.pending.includes(key) && !newDetails.pending.includes(key) && !changedMechanic && !scaling && !unresolved;
    const requiredOnItem = complete ? Math.max(0, minimum - before + (oldDetails.values[key] ?? 0)) : undefined;
    const after = complete ? before - (oldDetails.values[key] ?? 0) + (newDetails.values[key] ?? 0) : undefined;
    return { key, label, before, after, cap, minimum, requiredOnItem, met: after === undefined || minimum === undefined ? undefined : after + 1e-6 >= minimum };
  });
  if (baseline && rows.some((row) => row.before === undefined)) notes.push('部分抗性只有封顶后的有效值或尚未保存；不能据此推断溢出余量。');
  if (baseline && rows.some((row) => row.cap === undefined)) notes.push('PoB2 未保存部分抗性上限，请在游戏面板基准中补齐；不把未知上限统一当作 75%。');
  if ([...oldDetails.pending, ...newDetails.pending].some((key) => /Resistance$/.test(key))) notes.push('每插槽抗性尚未确认镶嵌数量，相关抗性保留待核对。');
  return { status: rows.some((row) => row.met === false) ? 'unmet' : rows.every((row) => row.met === true) ? 'met' : 'unknown', origin: baseline?.origin, rows, notes };
}

/** Official per-element totals include all-res, hybrid and different affix placements. */
export function resistanceQueryRows(state: LoadoutState, slot: LoadoutSlot, current: Equipment): EquipmentTradeRow[] {
  const gate = resistanceGate(state, slot, current);
  return gate.rows.flatMap((row) => row.requiredOnItem !== undefined && row.requiredOnItem > 0 ? [{
    key: `goal:${row.key}`, label: `封顶所需${row.label}合计`, ids: [RESISTANCE_GOALS.find((entry) => entry.key === row.key)!.id],
    enabled: true, min: String(Math.ceil(row.requiredOnItem * 1e6) / 1e6), max: '', weight: '0', presenceOnly: true,
    warning: `按${gate.origin}与本栏贡献推算的硬门槛；含固定、全抗和复合抗性，返回后仍核对完整候选。`,
    locked: true,
  }] : []);
}

export function enforceDamageGoalRows(rows: readonly EquipmentTradeRow[], equipment: Equipment, state: LoadoutState, slot: LoadoutSlot) {
  const allowed = new Map(damageGoalRows(rows, equipment, state).filter((row) => Number(row.weight) > 0).map((row) => [row.key, row.scoringRef]));
  return [...rows.filter((row) => !row.key.startsWith('goal:')).map((row) => ({ ...row, weight: allowed.has(row.key) ? row.weight : '0', scoringRef: allowed.get(row.key) })),
    ...resistanceQueryRows(state, slot, equipment)];
}

export interface DamageGoalAssessment {
  gate: ResistanceGate; damageScore?: number; damageDelta?: number; basis: string;
  baselineScore?: number;
  status: 'candidate' | 'rejected' | 'review' | 'unchanged'; title: string;
}
export function assessDamageGoal(state: LoadoutState, slot: LoadoutSlot, candidate: Equipment, rows: readonly EquipmentTradeRow[],
  context: { beforeFilledSockets?: number; afterFilledSockets?: number } = {}): DamageGoalAssessment {
  const gate = resistanceGate(state, slot, candidate, context), current = parseEquipment(state.slots[slot] ?? '');
  const skill = damageSkill(state);
  const incompatible = skill && skillWeaponWarning(skill, candidate);
  const weapon = current?.slot === 'weapon' && candidate.slot === 'weapon' && (!skill && !state.goals.mainSkill || skill?.tags.includes('attack'));
  const before = current && equipmentMetricDetails(current), after = equipmentMetricDetails(candidate);
  let damageScore: number | undefined, baselineScore = 100, basis = `${skill?.label ?? '当前技能方向'}的已识别伤害词缀分（非技能 DPS）`;
  if (weapon && before && !before.pending.includes('totalDps') && !after.pending.includes('totalDps') && (before.values.totalDps ?? 0) > 0 && after.values.totalDps !== undefined) {
    const ratio = after.values.totalDps / before.values.totalDps!;
    if (rows.some((row) => row.referenceScale)) {
      const absorbed = (ref: string) => /^Adds # to # (?:Physical|Fire|Cold|Lightning|Chaos) Damage$|^#% increased (?:Physical Damage|Attack Speed)$/i.test(ref);
      const components = upgradeComponents(rows.filter((row) => !absorbed(row.scoringRef ?? '')));
      const parts = scoreUpgrade(candidate, components).parts;
      const beforePoints = 4 + parts.reduce((sum, part) => sum + part.importance * part.baseline / (part.referenceScale ?? (part.baseline || 1)), 0);
      const afterPoints = 4 * ratio + parts.reduce((sum, part) => sum + part.importance * part.after / (part.referenceScale ?? (part.baseline || 1)), 0);
      damageScore = 100 * afterPoints / beforePoints;
      basis = '武器面板 DPS＋主技能相关全域词缀方向分（局部伤害与攻速只计一次，非技能 DPS）';
    } else { damageScore = ratio * 100; basis = '武器面板总攻击 DPS 比值（非技能 DPS）'; }
  } else {
    const components = upgradeComponents(rows);
    if (components.length) { const scored = scoreUpgrade(candidate, components); damageScore = scored.score; baselineScore = scored.baselineScore; }
    if (rows.some((row) => row.referenceScale)) basis = `${skill?.label ?? 'BD'}的潜在词缀评分（按底座 T1 尺度归一，非技能 DPS）`;
  }
  const status = incompatible || gate.status === 'unmet' ? 'rejected' : gate.status === 'unknown' || damageScore === undefined ? 'review'
    : damageScore > baselineScore + .001 ? 'candidate' : 'unchanged';
  const title = incompatible ?? (status === 'rejected' ? '抗性未达上限，不符合配装目标' : gate.status === 'unknown' ? '抗性数据待核对，暂不能推荐'
    : status === 'candidate' ? '四抗达标，伤害方向更高 · 候选待 PoB2 验证' : damageScore === undefined ? '四抗达标，技能伤害收益待计算' : '四抗达标，未发现伤害方向提升');
  return { gate, damageScore, baselineScore, damageDelta: damageScore === undefined ? undefined : damageScore - baselineScore, basis, status, title };
}
