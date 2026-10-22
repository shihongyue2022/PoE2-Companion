import { equipmentMetricDetails, parseEquipment, type Equipment } from './genericEquipment';
import type { LoadoutSlot, LoadoutState, MetricKey, ResistanceKey } from './loadout';

export interface CharacterPanelSnapshot {
  values: Partial<Record<MetricKey, number>>;
  caps: Partial<Record<ResistanceKey, number>>;
  equipmentSignature: string;
  recordedAt: string;
  itemValues?: Partial<Record<MetricKey, number>>;
}
export const equipmentSignature = (slots: LoadoutState['slots']) => JSON.stringify(Object.entries(slots).sort(([a], [b]) => a.localeCompare(b)));
export function validCharacterPanel(state: LoadoutState): boolean {
  return !!state.character && state.character.equipmentSignature === equipmentSignature(state.slots);
}
export function projectCharacterResistances(state: LoadoutState, slot: LoadoutSlot, candidate: Equipment) {
  if (!state.character || !validCharacterPanel(state)) return [];
  const old = state.slots[slot];
  if (!old) return [];
  return projectResistanceValues(state.character, equipmentMetricDetailsFromRaw(old), equipmentMetricDetails(candidate).values);
}
const equipmentMetricDetailsFromRaw = (raw: string) => {
  const item = parseEquipment(raw);
  return item ? equipmentMetricDetails(item).values : {};
};
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
