import { parseEquipment } from './genericEquipment';
import type { LoadoutState, ResistanceKey } from './loadout';

export type WeaponPair = Partial<Record<'mainHand' | 'offHand', string>>;
export interface WeaponSets { active: 1 | 2; first: WeaponPair; second: WeaponPair; caps?: { first?: Partial<Record<ResistanceKey, number>>; second?: Partial<Record<ResistanceKey, number>> } }
export const activeWeaponSet = (state: LoadoutState): 1 | 2 => state.weaponSets?.active ?? (state.source?.secondWeapons ? 2 : 1);
export const activeSecondWeapons = (state: LoadoutState) => activeWeaponSet(state) === 2;
export function weaponPair(slots: LoadoutState['slots']): WeaponPair {
  return { ...(slots.mainHand ? { mainHand: slots.mainHand } : {}), ...(slots.offHand ? { offHand: slots.offHand } : {}) };
}
export function readWeaponPair(value: unknown): WeaponPair | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const pair = value as Record<string, unknown>;
  if (Object.entries(pair).some(([key, raw]) => !['mainHand', 'offHand'].includes(key) || typeof raw !== 'string' || raw.length > 100_000 || !raw.trim())) return undefined;
  const main = pair.mainHand ? parseEquipment(pair.mainHand as string) : undefined;
  const off = pair.offHand ? parseEquipment(pair.offHand as string) : undefined;
  if (pair.mainHand && (!main || main.slot !== 'weapon') || pair.offHand && (!off || off.slot !== 'offhand' && (off.slot !== 'weapon' || off.twoHanded))) return undefined;
  if (main && off && (main.category === 'weapon.bow' ? off.category !== 'armour.quiver' : main.twoHanded || off.category === 'armour.quiver')) return undefined;
  return { ...(pair.mainHand ? { mainHand: (pair.mainHand as string).trim() } : {}), ...(pair.offHand ? { offHand: (pair.offHand as string).trim() } : {}) };
}
export function syncWeaponSets(state: LoadoutState): LoadoutState {
  if (!state.weaponSets) return state;
  const key = state.weaponSets.active === 1 ? 'first' : 'second';
  return { ...state, weaponSets: { ...state.weaponSets, [key]: weaponPair(state.slots),
    ...(state.weaponSets.caps || state.goals.resistanceCaps ? { caps: { ...state.weaponSets.caps, [key]: state.goals.resistanceCaps ? { ...state.goals.resistanceCaps } : undefined } } : {}) } };
}
export function switchWeaponSet(state: LoadoutState, active: 1 | 2): LoadoutState {
  const current = activeWeaponSet(state);
  if (current === active) return state;
  const sets = syncWeaponSets(state).weaponSets ?? { active: current, first: current === 1 ? weaponPair(state.slots) : {}, second: current === 2 ? weaponPair(state.slots) : {} };
  const slots = { ...state.slots }; delete slots.mainHand; delete slots.offHand;
  Object.assign(slots, active === 1 ? sets.first : sets.second);
  const quotes = { ...state.quotes }; delete quotes.mainHand; delete quotes.offHand;
  return { ...state, slots, quotes, weaponSets: { ...sets, active }, goals: { ...state.goals, resistanceCaps: sets.caps?.[active === 1 ? 'first' : 'second'] } };
}
