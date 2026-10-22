import { parseEquipment, type Equipment } from './genericEquipment';
import type { EquipmentTradeRow } from './genericEquipmentTrade';
import type { EstimateListing } from './marketEstimate';

export interface UpgradeComponent {
  key: string; label: string; ids: string[]; baseline: number; importance: number; coefficient: number;
  referenceScale?: number;
}
const hash = (id: string) => id.split('.').pop()!;

/** Equal relative importance per distinct scalar, rather than adding incompatible units.
 * Alternate placements share one coefficient; repeated lines share one baseline. */
export function upgradeComponents(rows: readonly EquipmentTradeRow[]): UpgradeComponent[] {
  const groups = new Map<string, Omit<UpgradeComponent, 'coefficient'>>();
  for (const row of rows) {
    if (!row.enabled || row.equipmentFilter || row.presenceOnly || row.actualValue === undefined || row.actualValue < 0 || row.actualValue === 0 && !row.referenceScale) continue;
    const hashes = new Set(row.ids.map(hash));
    if (hashes.size !== 1 && !row.scoringRef) continue;
    const importance = Number(row.weight ?? '1');
    if (!Number.isFinite(importance) || importance < 0 || importance > 100) throw new Error(`${row.label}的权重需在 0～100 之间。`);
    if (importance === 0) continue;
    // Verified English scalar aliases (e.g. attack speed) may have multiple trade hashes.
    // Group by their native semantic reference; score each printed candidate line once.
    const key = row.scoringRef ? `ref:${row.scoringRef}` : [...hashes][0]!;
    const old = groups.get(key);
    groups.set(key, { key, label: old?.label ?? row.label, ids: [...new Set([...(old?.ids ?? []), ...row.ids])],
      baseline: (old?.baseline ?? 0) + row.actualValue, importance: Math.max(old?.importance ?? 0, importance),
      ...(row.referenceScale && Number.isFinite(row.referenceScale) && row.referenceScale > 0 ? { referenceScale: row.referenceScale } : {}) });
  }
  const total = [...groups.values()].reduce((sum, group) => sum + group.importance, 0);
  if ([...groups.values()].some((group) => group.referenceScale)) {
    const values = [...groups.values()], baseline = values.reduce((sum, group) => sum + group.baseline * group.importance / (group.referenceScale ?? (group.baseline || 1)), 0);
    const factor = baseline > 0 ? 100 / baseline : 100 / total;
    return values.map((group) => ({ ...group, coefficient: factor * group.importance / (group.referenceScale ?? (group.baseline || 1)) }));
  }
  return [...groups.values()].map((group) => ({ ...group, coefficient: 100 * group.importance / total / group.baseline }));
}

export function scoreUpgrade(equipment: Equipment, components: readonly UpgradeComponent[]) {
  const parts = components.map((component) => {
    const after = equipment.mods.filter((mod) => mod.ids.some((id) => component.ids.includes(id)))
      .reduce((sum, mod) => sum + (mod.value ?? 0), 0);
    return { ...component, after, delta: after - component.baseline, score: after * component.coefficient };
  });
  const score = parts.reduce((sum, part) => sum + part.score, 0);
  const baselineScore = parts.reduce((sum, part) => sum + part.baseline * part.coefficient, 0);
  return { score, parts, tradeoff: parts.some((part) => part.delta < -0.001) && parts.some((part) => part.delta > 0.001),
    baselineScore, improved: score > baselineScore + .001, unknown: equipment.mods.filter((mod) => !mod.searchable).map((mod) => mod.raw) };
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
