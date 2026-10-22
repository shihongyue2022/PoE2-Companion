import iconSnapshot from './data/currency-icons.json';

export interface OfficialCurrencyImage {
  readonly name: string;
  readonly url: string;
  readonly sourceUrl: string;
  readonly sourceLabel: string;
  readonly verifiedAt: string;
  readonly provenanceUrl: string;
  readonly width: number;
  readonly height: number;
}

const icons: ReadonlyMap<string, OfficialCurrencyImage> = new Map(
  Object.entries(iconSnapshot.currencies).map(([id, icon]) => [id, {
    name: icon.name,
    url: icon.url,
    sourceUrl: icon.url,
    sourceLabel: 'GGG 官方通货图片',
    verifiedAt: iconSnapshot.verifiedAt,
    provenanceUrl: iconSnapshot.source.url,
    width: icon.width,
    height: icon.height,
  }]),
);

/** Exact, verified currency keys only. Unknown materials keep the UI's labelled fallback. */
export function getOfficialCurrencyImage(id: string): OfficialCurrencyImage | undefined {
  return icons.get(id);
}

const NAME_IDS: Readonly<Record<string, string>> = {
  transmute: 'transmute', transmutation: 'transmute', 'orb of transmutation': 'transmute',
  augment: 'augment', augmentation: 'augment', 'orb of augmentation': 'augment',
  regal: 'regal', 'regal orb': 'regal',
  exalt: 'exalt', exalted: 'exalt', 'exalted orb': 'exalt',
  annul: 'annul', annulment: 'annul', 'orb of annulment': 'annul',
  chaos: 'chaos', 'chaos orb': 'chaos',
  alchemy: 'alchemy', 'orb of alchemy': 'alchemy',
  divine: 'divine', 'divine orb': 'divine',
};
const TIERED = new Set(['transmute', 'augment', 'regal', 'exalt', 'chaos']);
const SIDES = new Set(['sinistral', 'dextral']);
const STRENGTHS = new Set(['greater', 'perfect']);
const COMBINATIONS: Readonly<Record<string, readonly string[]>> = {
  exalt: [
    'sinistral', 'dextral', 'omen of sinistral exaltation', 'omen of dextral exaltation',
    'omen of greater exaltation', 'omen: greater exaltation',
  ],
  annul: ['omen of light', 'omen of sinistral annulment', 'omen of dextral annulment'],
  chaos: ['sinistral', 'dextral', 'omen of whittling'],
};

/**
 * Main orb for the existing engine's English action labels, never an omen or an inferred material.
 *
 * mapFrontier emits e.g. "Exalted (Perfect) + Omen of Greater Exaltation"; actionLabel emits
 * "Exalt (Sinistral, Perfect)". The word Greater inside that named omen does not set the orb's
 * strength. Exact aliases and a closed modifier grammar prevent an Essence, a restart, an unknown
 * operation or arbitrary text mentioning an orb from acquiring a misleading picture.
 */
export function getCurrencyImageIdForAction(label: string): string | undefined {
  const parts = label.trim().toLowerCase().replace(/\s+/g, ' ').split(/\s*\+\s*/);
  if (parts.length > 2 || parts.some((part) => !part)) return undefined;
  const main = /^([^()]+?)(?: \(([^()]+)\))?$/.exec(parts[0]!);
  if (!main) return undefined;
  let name = main[1]!.trim();
  const modifiers = main[2]?.split(/\s*,\s*/).map((part) => part.trim());
  // Canonical item names prefix their strength; engine action labels use parentheses instead.
  const prefix = /^(greater|perfect) (.+)$/.exec(name);
  let strength = prefix?.[1];
  if (prefix) name = prefix[2]!;
  const id = NAME_IDS[name];
  if (!id || (strength && (!TIERED.has(id) || modifiers))) return undefined;

  let hasSide = false;
  if (modifiers) {
    if (modifiers.length === 1 && TIERED.has(id) && STRENGTHS.has(modifiers[0]!)) {
      strength = modifiers[0];
    } else if (id === 'exalt' && SIDES.has(modifiers[0]!) && modifiers.length <= 2
      && (modifiers.length === 1 || STRENGTHS.has(modifiers[1]!))) {
      hasSide = true;
      strength = modifiers[1];
    } else if (id === 'annul' && modifiers.length === 1
      && (SIDES.has(modifiers[0]!) || modifiers[0] === 'omen of light')) {
      hasSide = true;
    } else return undefined;
  }
  const combination = parts[1]?.replace(/^omen\s*:\s*/, 'omen: ');
  if (combination && (hasSide || !COMBINATIONS[id]?.includes(combination))) return undefined;
  const imageId = strength ? `${id}_${strength}` : id;
  return icons.has(imageId) ? imageId : undefined;
}
