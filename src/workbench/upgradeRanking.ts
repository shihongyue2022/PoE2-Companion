import { parseEquipment, type Equipment } from './genericEquipment';
import type { EquipmentTradeRow } from './genericEquipmentTrade';
import type { EstimateListing } from './marketEstimate';

export interface UpgradeComponent {
  key: string; label: string; ids: string[]; baseline: number; importance: number; coefficient: number;
}
const hash = (id: string) => id.split('.').pop()!;

/** Equal relative importance per distinct scalar, rather than adding incompatible units.
 * Alternate placements share one coefficient; repeated lines share one baseline. */
export function upgradeComponents(rows: readonly EquipmentTradeRow[]): UpgradeComponent[] {
  const groups = new Map<string, Omit<UpgradeComponent, 'coefficient'>>();
  for (const row of rows) {
    if (!row.enabled || row.equipmentFilter || row.presenceOnly || !row.actualValue || row.actualValue <= 0) continue;
    const hashes = new Set(row.ids.map(hash));
    if (hashes.size !== 1) continue;
    const importance = Number(row.weight ?? '1');
    if (!Number.isFinite(importance) || importance < 0 || importance > 100) throw new Error(`${row.label}的权重需在 0～100 之间。`);
    if (importance === 0) continue;
    const key = [...hashes][0]!;
    const old = groups.get(key);
    groups.set(key, { key, label: old?.label ?? row.label, ids: [...new Set([...(old?.ids ?? []), ...row.ids])],
      baseline: (old?.baseline ?? 0) + row.actualValue, importance: Math.max(old?.importance ?? 0, importance) });
  }
  const total = [...groups.values()].reduce((sum, group) => sum + group.importance, 0);
  return [...groups.values()].map((group) => ({ ...group, coefficient: 100 * group.importance / total / group.baseline }));
}

export function scoreUpgrade(equipment: Equipment, components: readonly UpgradeComponent[]) {
  const parts = components.map((component) => {
    const after = equipment.mods.filter((mod) => mod.ids.some((id) => component.ids.includes(id)))
      .reduce((sum, mod) => sum + (mod.value ?? 0), 0);
    return { ...component, after, delta: after - component.baseline, score: after * component.coefficient };
  });
  const score = parts.reduce((sum, part) => sum + part.score, 0);
  return { score, parts, tradeoff: parts.some((part) => part.delta < -0.001) && parts.some((part) => part.delta > 0.001),
    improved: score > 100.001, unknown: equipment.mods.filter((mod) => !mod.searchable).map((mod) => mod.raw) };
}

/** Rebuild public item text only; account, stash and whisper data never enters the browser. */
export function equipmentFromListing(listing: EstimateListing): Equipment | null {
  const text = [
    `Rarity: ${listing.rarity ?? 'rare'}`, listing.name, listing.base, '--------', ...(listing.properties ?? []),
    `Item Level: ${listing.itemLevel ?? 1}`, '--------',
    ...(listing.implicitMods ?? []).map((line) => `${line} (implicit)`),
    ...(listing.enchantMods ?? []).map((line) => `${line} (enchant)`),
    ...(listing.runeMods ?? []).map((line) => `${line} (rune)`),
    ...(listing.explicitMods ?? []),
    ...(listing.fracturedMods ?? []).map((line) => `${line} (fractured)`),
    ...(listing.desecratedMods ?? []).map((line) => `${line} (desecrated)`),
    ...(listing.corrupted ? ['Corrupted'] : []), ...(listing.identified === false ? ['Unidentified'] : []),
  ].filter(Boolean).join('\n');
  return parseEquipment(text);
}
