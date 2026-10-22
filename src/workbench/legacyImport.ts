import type { PatchData } from '../../packages/engine/src/types';
import type { ExistingItem } from '../lib/engine';
import { parseWorkbenchItem } from './itemImport';

/** Repair only the old, incomplete advanced-header import, never a manually changed item. */
export function recoverLegacyImport(data: PatchData, saved: {
  raw: string; item: ExistingItem; warnings?: readonly string[]; actualRollsInvalid?: boolean;
}) {
  if (saved.actualRollsInvalid || !saved.raw.trim() || !saved.warnings?.some((warning) =>
    /\{.*(?:已褻瀆|已亵渎|已破裂).*(?:前綴|後綴|前缀|后缀)/.test(warning))) return null;
  const parsed = parseWorkbenchItem(data, saved.raw);
  if (!parsed?.complete || parsed.baseId !== saved.item.baseId || parsed.level !== saved.item.level || parsed.rarity !== saved.item.rarity) return null;
  const recovered = [...parsed.prefixes, ...parsed.suffixes];
  if (![...saved.item.prefixes, ...saved.item.suffixes].every((entry) => recovered.some((candidate) =>
    candidate.modId === entry.modId && candidate.tierDisplay === entry.tierDisplay
    && (!entry.fractured || candidate.fractured) && (!entry.desecrated || candidate.desecrated)))) return null;
  return parsed;
}
