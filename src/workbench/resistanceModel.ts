import { equipmentMetricDetails, occupiedSockets, parseEquipment, type Equipment, type EquipmentMod } from './genericEquipment';
import type { LoadoutSlot, LoadoutState, ResistanceKey } from './loadout';
import { activeWeaponSet } from './weaponSets';

export const RESISTANCE_GOALS = [
  { key: 'fireResistance', label: '火焰抗性', id: 'pseudo.pseudo_total_fire_resistance' },
  { key: 'coldResistance', label: '冰冷抗性', id: 'pseudo.pseudo_total_cold_resistance' },
  { key: 'lightningResistance', label: '闪电抗性', id: 'pseudo.pseudo_total_lightning_resistance' },
  { key: 'chaosResistance', label: '混沌抗性', id: 'pseudo.pseudo_total_chaos_resistance' },
] as const;
export interface SocketEvidence { itemText: string; filled: number; assumed?: boolean }
export interface ResistanceContext { beforeFilledSockets?: number; afterFilledSockets?: number; socketScenario?: boolean }
export interface ResistanceGoalRow {
  key: ResistanceKey; label: string; before?: number; after?: number; cap?: number;
  minimum?: number; requiredOnItem?: number; met?: boolean;
  effectiveBefore?: number; effectiveAfter?: number; overflowBefore?: number; overflowAfter?: number;
}
export interface ResistanceGate { status: 'met' | 'unmet' | 'unknown'; origin?: string; rows: ResistanceGoalRow[]; notes: string[] }
export const equipmentSignature = (slots: LoadoutState['slots']) => JSON.stringify(Object.entries(slots).sort(([a], [b]) => a.localeCompare(b)));
const keys = RESISTANCE_GOALS.map((entry) => entry.key);
const ordinary = (mod: EquipmentMod) => /^#% to (?:all Elemental Resistances|(?:Fire|Cold|Lightning|Chaos)(?: and (?:Fire|Cold|Lightning|Chaos))? Resistances?)(?: per Socket filled)?$/.test(mod.ref ?? '');
const resistanceText = (mod: EquipmentMod) => /Resistance|抗性/i.test(mod.ref ?? mod.englishText ?? mod.text);
function special(item: Equipment | null) {
  return (item?.mods ?? []).filter((mod) => resistanceText(mod) && !ordinary(mod)).map((mod) => `${mod.ref ?? mod.text}:${mod.values.join(',')}`).sort().join('|');
}
function anchor(state: LoadoutState) {
  if (state.character && (state.character.weaponSet ?? (state.source?.secondWeapons ? 2 : 1)) === activeWeaponSet(state) && keys.some((key) => state.character!.values[key] !== undefined)) return { ...state.character, origin: '游戏面板基准' };
  if (state.source?.reference && (state.source.secondWeapons ? 2 : 1) === activeWeaponSet(state)) return { ...state.source.reference, equipmentSignature: state.source.equipmentSignature, origin: 'PoB2 保存的角色总值' };
  return undefined;
}
function anchorSlots(signature: string): LoadoutState['slots'] | undefined {
  try {
    const entries: unknown = JSON.parse(signature);
    if (!Array.isArray(entries) || entries.length > 20 || entries.some((entry: unknown) => !Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || typeof entry[1] !== 'string' || entry[1].length > 100_000)) return undefined;
    const names = entries.map((entry: [string, string]) => entry[0]);
    if (new Set(names).size !== names.length || names.some((name: string) => !/^(?:mainHand|offHand|helmet|body|gloves|boots|belt|amulet|ring[12]|flask[12]|charm[123])$/.test(name))) return undefined;
    return Object.fromEntries(entries as [string, string][]);
  } catch { return undefined; }
}
export function knownFilledSockets(state: LoadoutState, item: Equipment, override?: number) {
  return occupiedSockets(item, { filledSockets: override ?? state.socketEvidence?.find((entry) => entry.itemText.trim() === item.raw.trim())?.filled });
}
export function recordSocketEvidence(state: LoadoutState, before: Equipment | null, after: Equipment, context: ResistanceContext): SocketEvidence[] | undefined {
  const evidence = new Map((state.socketEvidence ?? []).map((entry) => [entry.itemText, entry]));
  for (const [item, count] of [[before, context.beforeFilledSockets], [after, context.afterFilledSockets]] as const) {
    if (!item || count === undefined || occupiedSockets(item, { filledSockets: count }) === undefined) continue;
    evidence.set(item.raw.trim(), { itemText: item.raw.trim(), filled: count, ...(context.socketScenario ? { assumed: true } : {}) });
  }
  return evidence.size ? [...evidence.values()].slice(-50) : undefined;
}
function project(state: LoadoutState, slots: LoadoutState['slots'], hints: Map<string, number>) {
  const base = anchor(state), original = base && anchorSlots(base.equipmentSignature), notes: string[] = [];
  const values: Partial<Record<ResistanceKey, number>> = {};
  if (!base || !original) return { values, caps: base?.caps ?? {}, notes: [state.weaponSets ? '当前武器组缺少对应的角色面板基准；武器组专属天赋和技能可能不同，请在本组校准游戏面板或用 PoB2 保存本组后更新。' : '缺少可追溯的角色总抗性基准，请更新 PoB2 或录入游戏面板；装备抗性之和不能代替角色总值。'], origin: base?.origin };
  for (const key of keys) {
    if (base.values[key] !== undefined) values[key] = base.values[key];
    else if (base.origin === 'PoB2 保存的角色总值' && state.source?.reference?.effective?.[key] !== undefined && state.goals.resistanceCaps?.[key] !== undefined
      && state.source.reference.effective[key] < state.goals.resistanceCaps[key]) values[key] = state.source.reference.effective[key];
  }
  const changed = [...new Set([...Object.keys(original), ...Object.keys(slots)])].filter((slot) => original[slot as LoadoutSlot] !== slots[slot as LoadoutSlot] && !/^(?:flask|charm)/.test(slot));
  const invalidate = (affected: readonly ResistanceKey[], message: string) => { for (const key of affected) delete values[key]; notes.push(message); };
  for (const slot of changed) {
    const oldRaw = original[slot as LoadoutSlot], newRaw = slots[slot as LoadoutSlot];
    const old = oldRaw ? parseEquipment(oldRaw) : null, next = newRaw ? parseEquipment(newRaw) : null;
    if (oldRaw && (!old || !old.identified) || newRaw && (!next || !next.identified)) { invalidate(keys, '换装记录存在未识别或未鉴定装备，不能按零抗性推算。'); continue; }
    if (special(old) !== special(next)) { invalidate(keys, '换装改变了抗性上限、条件或特殊抗性机制，需要 PoB2／游戏复核。'); continue; }
    if ([...(old?.mods ?? []), ...(next?.mods ?? [])].some((mod) => resistanceText(mod) && (!mod.ref || ordinary(mod) && mod.value === undefined))) { invalidate(keys, '替换栏位存在未核对的抗性数值，不能当作零贡献。'); continue; }
    const details = (item: Equipment | null): Pick<ReturnType<typeof equipmentMetricDetails>, 'values' | 'pending'> => item ? equipmentMetricDetails(item, { filledSockets: knownFilledSockets(state, item, hints.get(item.raw)) }) : { values: {}, pending: [] };
    const before = details(old), after = details(next);
    for (const key of keys) {
      if (before.pending.includes(key) || after.pending.includes(key)) { invalidate([key], '每插槽抗性尚未确认实际镶嵌数量，相关抗性保留待核对。'); continue; }
      if (values[key] !== undefined) values[key] = Math.round((values[key] - (before.values[key] ?? 0) + (after.values[key] ?? 0)) * 1e6) / 1e6;
    }
  }
  if (changed.length) {
    const worn = [...Object.entries(original), ...Object.entries(slots)].filter(([slot]) => !/^(?:flask|charm)/.test(slot)).flatMap(([, raw]) => parseEquipment(raw)?.mods ?? []);
    if (worn.some((mod) => !ordinary(mod) && /(?:increased|reduced|less|more|\bper\b|\bwhile\b|\bif\b|\bwhen\b|based on).*Resistances?|Resistances?.*(?:increased|reduced|less|more|\bper\b|\bwhile\b|\bif\b|\bwhen\b|based on)/i.test(mod.ref ?? mod.englishText ?? mod.text))) invalidate(keys, '装备含抗性缩放机制，不能用普通加减保证封顶，请在 PoB2 复核。');
    notes.push('按原角色总值与整套装备累计差值推算，天赋、技能和剧情状态须保持不变；这不是新的游戏实测面板。');
  }
  return { values, caps: base.caps, notes: [...new Set(notes)], origin: base.origin, projected: changed.length > 0 };
}
export function resistanceBaseline(state: LoadoutState) { return project(state, state.slots, new Map()); }
export function currentResistanceGate(state: LoadoutState) {
  for (const [slot, raw] of Object.entries(state.slots)) {
    if (/^(?:flask|charm)/.test(slot)) continue;
    const item = parseEquipment(raw); if (item) return resistanceGate(state, slot as LoadoutSlot, item);
  }
  return undefined;
}
export function resistanceGate(state: LoadoutState, slot: LoadoutSlot, candidate: Equipment, context: ResistanceContext = {}): ResistanceGate {
  const old = parseEquipment(state.slots[slot] ?? ''), hints = new Map<string, number>();
  if (old && context.beforeFilledSockets !== undefined) hints.set(old.raw, context.beforeFilledSockets);
  const before = project(state, state.slots, hints);
  const afterHints = new Map(hints);
  if (context.afterFilledSockets !== undefined) afterHints.set(candidate.raw, context.afterFilledSockets);
  // Identical raw text can represent two different occupancy scenarios; project each separately.
  const nextSlots = { ...state.slots, [slot]: candidate.raw };
  let after = project(state, nextSlots, afterHints);
  const base = anchor(state);
  if (old && old.raw === candidate.raw && context.beforeFilledSockets !== context.afterFilledSockets && context.afterFilledSockets !== undefined) {
    const oldDetails = equipmentMetricDetails(old, { filledSockets: knownFilledSockets(state, old, context.beforeFilledSockets) });
    const newDetails = equipmentMetricDetails(candidate, { filledSockets: context.afterFilledSockets });
    after = { ...before, values: { ...before.values } };
    for (const key of keys) if (oldDetails.pending.includes(key) || newDetails.pending.includes(key)) delete after.values[key];
    else if (after.values[key] !== undefined) after.values[key] = after.values[key] - (oldDetails.values[key] ?? 0) + (newDetails.values[key] ?? 0);
  }
  const item = old && equipmentMetricDetails(old, { filledSockets: knownFilledSockets(state, old, context.beforeFilledSockets) });
  const rows = RESISTANCE_GOALS.map(({ key, label }): ResistanceGoalRow => {
    const cap = state.goals.resistanceCaps?.[key] ?? before.caps[key] ?? (base?.origin === '游戏面板基准' ? 75 : undefined), value = before.values[key], next = after.values[key];
    const minimum = cap === undefined ? undefined : Math.max(cap, state.goals.minimums[key] ?? cap);
    return { key, label, before: value, after: next, cap, minimum,
      requiredOnItem: value !== undefined && minimum !== undefined && item && !item.pending.includes(key) ? Math.max(0, minimum - value + (item.values[key] ?? 0)) : undefined,
      met: next !== undefined && minimum !== undefined ? next + 1e-6 >= minimum : undefined,
      effectiveBefore: cap === undefined || value === undefined ? undefined : Math.min(value, cap), effectiveAfter: cap === undefined || next === undefined ? undefined : Math.min(next, cap),
      overflowBefore: cap === undefined || value === undefined ? undefined : Math.max(0, value - cap), overflowAfter: cap === undefined || next === undefined ? undefined : Math.max(0, next - cap) };
  });
  const notes = [...new Set([...before.notes, ...after.notes])];
  if (context.socketScenario || state.socketEvidence?.some((entry) => entry.assumed)) notes.push('包含满孔镶嵌情景，需核对实际镶嵌数量；此处是配装推算，不是新的游戏实测面板。');
  if (rows.some((row) => row.before === undefined)) notes.push('部分抗性总值未知，不能把封顶显示值当作未封顶总值或假定已经达标。');
  if (rows.some((row) => row.cap === undefined)) notes.push('部分抗性上限尚未确认，请在游戏面板基准中补齐。');
  return { rows, notes, origin: before.origin, status: rows.some((row) => row.met === false) ? 'unmet' : rows.every((row) => row.met === true) ? 'met' : 'unknown' };
}
