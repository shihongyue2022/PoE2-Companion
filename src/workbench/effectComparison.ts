import { simplifyEquipmentText, type Equipment, type EquipmentMod } from './genericEquipment';

export interface EffectComparisonRow {
  key: string; before: string[]; after: string[]; changed: boolean; recognized: boolean;
}
const normalized = (text: string) => simplifyEquipmentText(text).toLowerCase().replace(/[\s，、,：:]/g, '');
/** Compare game meaning and actual rolls, not clipboard language, ranges or affix headers.
 * Literal variants still include their complete translated text, e.g. ground combinations. */
function signature(mod: EquipmentMod) {
  if (!mod.ref || !mod.recognized && !mod.searchable) return normalized(mod.text);
  return JSON.stringify({ ref: mod.ref, value: mod.value, values: mod.values,
    variant: mod.ref.includes('#') ? undefined : normalized(mod.englishText ?? mod.ref) });
}
export function compareDeferredEffects(before: Equipment | null, after: Equipment, beforeRaw: readonly string[], afterRaw: readonly string[]): EffectComparisonRow[] {
  const groups = new Map<string, { before: EquipmentMod[]; after: EquipmentMod[] }>();
  for (const [side, item, lines] of [['before', before, beforeRaw], ['after', after, afterRaw]] as const) {
    for (const mod of item?.mods ?? []) {
      if (!lines.includes(mod.raw)) continue;
      const key = mod.statId ?? mod.ref ?? `unknown:${normalized(mod.text)}`;
      const group = groups.get(key) ?? { before: [], after: [] };
      group[side].push(mod); groups.set(key, group);
    }
  }
  return [...groups].map(([key, group]) => ({ key,
    before: group.before.map((mod) => mod.label), after: group.after.map((mod) => mod.label),
    recognized: [...group.before, ...group.after].every((mod) => mod.recognized || mod.searchable),
    changed: JSON.stringify(group.before.map(signature).sort()) !== JSON.stringify(group.after.map(signature).sort()),
  }));
}
