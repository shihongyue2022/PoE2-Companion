import type { Equipment } from './genericEquipment';
import type { LoadoutSlot, LoadoutState, MetricKey, ResistanceKey } from './loadout';
import { equipmentSignature, resistanceGate } from './resistanceModel';
import { activeWeaponSet } from './weaponSets';
export { equipmentSignature } from './resistanceModel';

export interface CharacterPanelSnapshot {
  values: Partial<Record<MetricKey, number>>;
  caps: Partial<Record<ResistanceKey, number>>;
  equipmentSignature: string;
  recordedAt: string;
  itemValues?: Partial<Record<MetricKey, number>>;
  weaponSet?: 1 | 2;
}
export function validCharacterPanel(state: LoadoutState): boolean {
  return !!state.character && (state.character.weaponSet ?? (state.source?.secondWeapons ? 2 : 1)) === activeWeaponSet(state) && state.character.equipmentSignature === equipmentSignature(state.slots);
}
export function projectCharacterResistances(state: LoadoutState, slot: LoadoutSlot, candidate: Equipment,
  context: { beforeFilledSockets?: number; afterFilledSockets?: number } = {}) {
  return resistanceGate(state, slot, candidate, context).rows.flatMap((row) => row.before !== undefined && row.after !== undefined && row.cap !== undefined
    && row.effectiveBefore !== undefined && row.effectiveAfter !== undefined && row.overflowBefore !== undefined && row.overflowAfter !== undefined ? [{
      key: row.key, before: row.before, after: row.after, cap: row.cap, effectiveBefore: row.effectiveBefore, effectiveAfter: row.effectiveAfter,
      effectiveDelta: row.effectiveAfter - row.effectiveBefore, overflowBefore: row.overflowBefore, overflowAfter: row.overflowAfter,
    }] : []);
}
export function projectResistanceValues(snapshot: CharacterPanelSnapshot, beforeItem: Record<string, number>, afterItem: Record<string, number>) {
  return (['fireResistance', 'coldResistance', 'lightningResistance', 'chaosResistance'] as const).flatMap((key) => {
    const before = snapshot.values[key];
    if (before === undefined) return [];
    const cap = snapshot.caps[key] ?? 75;
    const after = before - (beforeItem[key] ?? 0) + (afterItem[key] ?? 0);
    const effectiveBefore = Math.min(before, cap), effectiveAfter = Math.min(after, cap);
    return [{ key, before, after, cap, effectiveBefore, effectiveAfter, effectiveDelta: effectiveAfter - effectiveBefore,
      overflowBefore: Math.max(0, before - cap), overflowAfter: Math.max(0, after - cap) }];
  });
}
