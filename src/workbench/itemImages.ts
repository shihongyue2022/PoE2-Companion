import iconSnapshot from './data/item-icons.json';

export interface OfficialItemImage {
  readonly url: string;
  readonly sourceUrl: string;
  readonly sourceLabel: string;
  readonly verifiedAt: string;
  readonly provenanceUrl: string;
  readonly width: number;
  readonly height: number;
}

const icons: ReadonlyMap<string, OfficialItemImage> = new Map(
  Object.entries(iconSnapshot.items).map(([base, icon]) => [base, {
    url: icon.url,
    sourceUrl: icon.url,
    sourceLabel: 'GGG 官方装备图片',
    verifiedAt: iconSnapshot.verifiedAt,
    provenanceUrl: iconSnapshot.source.url,
    width: icon.width,
    height: icon.height,
  }]),
);

/** Only verified GGG-hosted item art is returned; missing bases use the UI's explicit fallback. */
export function getOfficialItemImage(baseEnglish: string): OfficialItemImage | undefined {
  // Exact canonical name: unknown or generic names must not acquire another item's picture.
  return icons.get(baseEnglish);
}
