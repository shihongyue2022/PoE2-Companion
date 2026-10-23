import { RESISTANCE_GOALS, resistanceGate, type ResistanceGate } from './resistanceModel';
export { RESISTANCE_GOALS, resistanceGate, resistanceBaseline } from './resistanceModel';
export type { ResistanceGate, ResistanceGoalRow } from './resistanceModel';
import { equipmentMetricDetails, parseEquipment, type Equipment, type EquipmentMod } from './genericEquipment';
import { classifySkillMod, skillPlan, skillWeaponWarning } from './skillRecommendation';
import type { LoadoutSlot, LoadoutState } from './loadout';
import type { EquipmentTradeRow } from './genericEquipmentTrade';
import { scoreUpgrade, upgradeComponents } from './upgradeRanking';

export const CAPPED_DAMAGE_OBJECTIVE = 'capped-damage' as const;
export function usesDamageGoal(state: LoadoutState) { return state.goals.objective === CAPPED_DAMAGE_OBJECTIVE; }
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
  if ((state.goals.mainSkill || state.goals.skillBar !== undefined) && !plan) return rows.map((row) => ({ ...row, weight: '0' }));
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
