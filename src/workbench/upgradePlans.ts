import { equipmentMetricDetails, parseEquipment, type Equipment } from './genericEquipment';
import { equipRaw, type LoadoutSlot, type LoadoutState } from './loadout';
import { currentResistanceGate, equipmentSignature } from './resistanceModel';
import { activeWeaponSet } from './weaponSets';
import { skillPlan, skillTargetRows } from './skillRecommendation';
import { upgradeComponents, scoreUpgrade } from './upgradeRanking';
import { protectedUnique, workflowDamageState, workflowPreferences } from './workflowPreferences';
import type { UpgradeMarketQuote } from './upgradeWorkflow';
import type { PatchData } from '../../packages/engine/src/types';
import type { GearTrade } from '../lib/gearTrade';

export interface PlanCandidate { id: string; slot: LoadoutSlot; raw: string; quote?: UpgradeMarketQuote }
export interface CandidatePool { version: 1; basis: string; candidates: PlanCandidate[] }
export const planBasis = (state: LoadoutState) => JSON.stringify({ gear: equipmentSignature(state.slots), source: state.source, character: state.character, weapon: activeWeaponSet(state), sockets: state.socketEvidence });
export interface UpgradePlan {
  id: string; candidates: PlanCandidate[]; state: LoadoutState; gate: ReturnType<typeof currentResistanceGate>;
  total?: number; currency: string; directionDelta?: number;
  status: 'feasible' | 'review' | 'rejected'; reasons: string[];
}
const sameUnique = (left: Equipment, right: Equipment) => right.rarity === 'unique' && (left.nameEnglish ?? left.name) === (right.nameEnglish ?? right.name);
const mechanismKey = (mod: Equipment['mods'][number]) => (mod.ref ?? mod.englishText ?? mod.text).replace(/[+-]?\d+(?:\.\d+)?/g, '#').replace(/\s+/g, ' ').trim();
export function protectedReplacementError(state: LoadoutState, slot: LoadoutSlot, item: Equipment): string | undefined {
  if (!protectedUnique(state, slot)) return undefined;
  const before = parseEquipment(state.slots[slot] ?? '');
  if (!before || !sameUnique(before, item)) return '替换改变了受保护的传奇身份；需先明确解除本部位保护。';
  const mechanisms = before.mods.filter((mod) => !mod.searchable || /Grants Skill|Wind Skills|\bper\b|\bwhile\b|\bif\b|\bfor each\b/i.test(mod.ref ?? mod.englishText ?? mod.text));
  if (mechanisms.some((mod) => !item.mods.some((entry) => mechanismKey(entry) === mechanismKey(mod)))) return '候选缺少原传奇的部分机制文字，尚不能确认核心机制保留。';
  return undefined;
}

function directionDelta(state: LoadoutState, slot: LoadoutSlot, item: Equipment, data?: PatchData, trade?: GearTrade | null) {
  const before = parseEquipment(state.slots[slot] ?? ''), main = skillPlan(state);
  if (!before || !main || !data || !trade) return undefined;
  const rows = skillTargetRows({ ...before, rarity: 'rare' }, state, data, trade, 100);
  const weapon = slot === 'mainHand' && main.tags.includes('attack');
  const absorbed = (ref: string) => /^Adds # to # (?:Physical|Fire|Cold|Lightning|Chaos) Damage$|^#% increased (?:Physical Damage|Attack Speed)$/i.test(ref);
  const components = upgradeComponents(rows.filter((row) => !weapon || !absorbed(row.scoringRef ?? '')));
  const parts = scoreUpgrade(item, components).parts;
  const scalar = parts.reduce((sum, part) => sum + part.importance * part.delta / (part.referenceScale ?? 1), 0);
  if (weapon) {
    const a = equipmentMetricDetails(before), b = equipmentMetricDetails(item);
    if (a.pending.includes('totalDps') || b.pending.includes('totalDps') || !a.values.totalDps || b.values.totalDps === undefined) return parts.length ? scalar : undefined;
    return scalar + 4 * (b.values.totalDps / a.values.totalDps - 1);
  }
  return scalar;
}

export function assessUpgradePlan(state: LoadoutState, candidates: PlanCandidate[], data?: PatchData, trade?: GearTrade | null): UpgradePlan {
  const preferences = workflowPreferences(state), reasons: string[] = [], currency = preferences.currency;
  let next = state;
  const limit = preferences.replacement === 'single' ? 1 : preferences.replacement === 'pair' ? 2 : 10;
  if (!candidates.length || candidates.length > limit) reasons.push('超出当前换装范围。');
  if (new Set(candidates.map((entry) => entry.slot)).size !== candidates.length) reasons.push('同一个部位不能同时采用两件装备。');
  const marketIds = candidates.flatMap((entry) => entry.quote?.id ? [entry.quote.id] : []);
  if (new Set(marketIds).size !== marketIds.length) reasons.push('同一件挂牌不能在两个栏位重复使用。');
  let total = 0, priceKnown = true, scoreKnown = true, score = 0;
  const scoreState = workflowDamageState(state);
  for (const candidate of candidates) {
    const item = parseEquipment(candidate.raw);
    if (!item || !item.identified) { reasons.push('候选未识别或未鉴定。'); continue; }
    const protectedError = protectedReplacementError(state, candidate.slot, item); if (protectedError) reasons.push(protectedError);
    const equipped = equipRaw(next, candidate.slot, item.raw);
    if (!equipped.ok) reasons.push(equipped.error);
    else next = equipped.state;
    const delta = directionDelta(scoreState, candidate.slot, item, data, trade);
    if (delta === undefined) scoreKnown = false; else score += delta;
    if (!candidate.quote || !Number.isFinite(candidate.quote.amount) || candidate.quote.amount <= 0 || candidate.quote.currency !== currency) priceKnown = false;
    else total += candidate.quote.amount;
  }
  const gate = currentResistanceGate(next);
  if (gate?.status === 'unmet') reasons.push('组合换入后整套四抗仍有缺口。');
  if (priceKnown && preferences.budget !== undefined && total > preferences.budget + 1e-8) reasons.push('组合购买价超过总预算。');
  const rejected = reasons.length > 0;
  if (!priceKnown) reasons.push('缺少所选通货的完整购买价，不按零价格或假定汇率计算。');
  if (gate?.status !== 'met' && gate?.status !== 'unmet') reasons.push('整套抗性尚未核对，未知不视为达标。');
  if (candidates.some((entry) => !entry.quote || !Number.isFinite(Date.parse(entry.quote.sampledAt)) || Date.now() - Date.parse(entry.quote.sampledAt) > 86_400_000)) reasons.push('挂牌价格缺少读取时间或已超过一天，请重新核价。');
  if (!scoreKnown) reasons.push('部分部位缺少可核验的伤害方向，组合伤害需 PoB 重算。');
  return { id: candidates.map((entry) => entry.id).sort().join('|'), candidates, state: next, gate, total: priceKnown ? total : undefined, currency,
    directionDelta: scoreKnown ? score : undefined, status: rejected ? 'rejected' : reasons.length ? 'review' : 'feasible', reasons };
}

/** Search the observed candidate pool only; this is not a claim of a market-wide optimum. */
export function buildUpgradePlans(state: LoadoutState, pool: CandidatePool, data?: PatchData, trade?: GearTrade | null): UpgradePlan[] {
  if (pool.basis !== planBasis(state)) return [];
  const entries = pool.candidates.slice(-24), combinations = entries.map((entry) => [entry]);
  if (workflowPreferences(state).replacement !== 'single') for (let a = 0; a < entries.length; a++) for (let b = a + 1; b < entries.length; b++) {
    if (entries[a]!.slot !== entries[b]!.slot && (!entries[a]!.quote || entries[a]!.quote!.id !== entries[b]!.quote?.id)) combinations.push([entries[a]!, entries[b]!]);
  }
  const cache = new Map(entries.map((entry) => { const item = parseEquipment(entry.raw); return [entry.id, item ? directionDelta(workflowDamageState(state), entry.slot, item, data, trade) : undefined]; }));
  return combinations.map((entries) => {
    const plan = assessUpgradePlan(state, entries);
    const scores = entries.map((entry) => cache.get(entry.id));
    plan.directionDelta = scores.every((value) => value !== undefined) ? scores.reduce((sum, value) => sum + value, 0) : undefined;
    plan.reasons = plan.reasons.filter((reason) => reason !== '部分部位缺少可核验的伤害方向，组合伤害需 PoB 重算。');
    if (plan.directionDelta === undefined) plan.reasons.push('部分部位缺少可核验的伤害方向，组合伤害需 PoB 重算。');
    if (plan.status !== 'rejected') plan.status = plan.reasons.length ? 'review' : 'feasible';
    return plan;
  }).sort((a, b) => ({ feasible: 0, review: 1, rejected: 2 })[a.status] - ({ feasible: 0, review: 1, rejected: 2 })[b.status]
    || (b.directionDelta ?? -Infinity) - (a.directionDelta ?? -Infinity) || (a.total ?? Infinity) - (b.total ?? Infinity));
}
