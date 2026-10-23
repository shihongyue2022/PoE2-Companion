import { parseEquipment } from './genericEquipment';
import type { LoadoutSlot, LoadoutState } from './loadout';
import { isLoadoutSlot } from './loadout';
import { focusRoutineSkill, skillSelectionKey, twisterRoutinePreset, setSkillRoutine } from './skillRoutine';

export interface WorkflowPreferences {
  version: 1;
  encounter: 'boss-sustained' | 'boss-burst' | 'mapping';
  replacement: 'single' | 'pair' | 'loadout';
  budget?: number;
  currency: 'divine' | 'exalted';
  unlockedSlots: LoadoutSlot[];
  conditions: Partial<Record<'whirlwind' | 'ignitedGround', 'always' | 'sometimes' | 'off'>>;
}
export const DEFAULT_WORKFLOW: WorkflowPreferences = { version: 1, encounter: 'boss-sustained', replacement: 'pair', currency: 'divine', unlockedSlots: [], conditions: {} };
export function readWorkflow(value: unknown): WorkflowPreferences | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || !['boss-sustained', 'boss-burst', 'mapping'].includes(String(row.encounter)) || !['single', 'pair', 'loadout'].includes(String(row.replacement))
    || !['divine', 'exalted'].includes(String(row.currency)) || row.budget !== undefined && (typeof row.budget !== 'number' || !Number.isFinite(row.budget) || row.budget < 0 || row.budget > 1e9)) return undefined;
  const conditions: WorkflowPreferences['conditions'] = {};
  if (row.conditions && typeof row.conditions === 'object') for (const key of ['whirlwind', 'ignitedGround'] as const) {
    const condition = (row.conditions as Record<string, unknown>)[key];
    if (condition === 'always' || condition === 'sometimes' || condition === 'off') conditions[key] = condition;
  }
  return { version: 1, encounter: row.encounter as WorkflowPreferences['encounter'], replacement: row.replacement as WorkflowPreferences['replacement'], currency: row.currency as WorkflowPreferences['currency'],
    ...(typeof row.budget === 'number' ? { budget: row.budget } : {}), conditions,
    unlockedSlots: Array.isArray(row.unlockedSlots) ? [...new Set((row.unlockedSlots as unknown[]).filter((slot): slot is LoadoutSlot => typeof slot === 'string' && isLoadoutSlot(slot)))].slice(0, 15) : [] };
}
export const workflowPreferences = (state: LoadoutState) => state.goals.workflow ?? DEFAULT_WORKFLOW;
export function applyDefaultWorkflow(state: LoadoutState): LoadoutState {
  const set = state.goals.skillBar?.[0]?.setId ?? state.source?.combat?.activeSet ?? '';
  const preset = twisterRoutinePreset(state, set);
  const prepared = !state.goals.skillBar?.length && preset ? setSkillRoutine(state, preset, preset[0]) : state;
  return { ...prepared, goals: { ...prepared.goals, objective: 'capped-damage', workflow: { ...DEFAULT_WORKFLOW, conditions: {}, unlockedSlots: [] } } };
}
/** Main damage role is independent of the affix currently being inspected/searched. */
export function workflowDamageState(state: LoadoutState): LoadoutState {
  const twister = state.goals.skillBar?.find((entry) => entry.name === 'Twister');
  if (!twister) return state;
  try { return focusRoutineSkill(state, twister); }
  catch { return { ...state, goals: { ...state.goals, mainSkill: twister } }; }
}
export function workflowRole(state: LoadoutState, key: string) {
  const entry = state.goals.skillBar?.find((skill) => skillSelectionKey(skill) === key);
  if (entry?.name === 'Twister') return '主输出';
  if (entry?.name === 'Explosive Spear') return '地面／补伤';
  if (entry?.name === 'Whirling Slash') return '旋风来源';
  return state.goals.mainSkill && skillSelectionKey(state.goals.mainSkill) === key ? '检索重点' : '联动';
}
export function protectedUnique(state: LoadoutState, slot: LoadoutSlot) {
  const item = parseEquipment(state.slots[slot] ?? '');
  return item?.rarity === 'unique' && !workflowPreferences(state).unlockedSlots.includes(slot) ? item.nameEnglish ?? item.name : undefined;
}
