import { describe, expect, it } from 'vitest';
import { JEWELLERY_BASES } from './catalog';
import iconSnapshot from './data/item-icons.json';
import { getOfficialItemImage } from './itemImages';

describe('official equipment artwork', () => {
  it('uses verified signed GGG CDN URLs and preserves provenance', () => {
    for (const [base, icon] of Object.entries(iconSnapshot.items)) {
      const result = getOfficialItemImage(base);
      expect(result?.sourceUrl).toBe(icon.url);
      expect(result?.provenanceUrl).toBe(iconSnapshot.source.url);
      expect(result?.verifiedAt).toBe('2026-10-22');
      expect(result?.sourceLabel).toContain('GGG');
      const url = new URL(icon.url);
      expect(url.protocol).toBe('https:');
      expect(url.hostname).toBe('web.poecdn.com');
      expect(url.pathname).toMatch(/^\/gen\/image\/[A-Za-z0-9_-]+\/[a-f0-9]+\/[^/]+\.png$/);
      const encoded = url.pathname.split('/')[3]!;
      const payload = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
      expect(payload).toContain('"realm":"poe2"');
      expect(payload).not.toContain('/Uniques/');
      expect(icon.httpStatus).toBe(200);
      expect(icon.contentType).toBe('image/png');
      expect(icon.byteLength).toBeGreaterThan(32);
      expect(icon.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result?.width).toBeGreaterThan(0);
      expect(result?.height).toBeGreaterThan(0);
    }
    expect(iconSnapshot.source.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(iconSnapshot.source.url).toContain(iconSnapshot.source.commit);
  });

  it('maps known bases to their exact item artwork rather than a generic ring icon', () => {
    expect(getOfficialItemImage('Ruby Ring')?.url).toMatch(/\/RubyRing\.png$/);
    expect(getOfficialItemImage('Amber Amulet')?.url).toMatch(/\/AmberAmulet\.png$/);
    expect(getOfficialItemImage('Lazuli Ring')?.url).toMatch(/\/LazuliRing\.png$/);
    expect(getOfficialItemImage('Ruby Ring')?.url).not.toBe(getOfficialItemImage('Lazuli Ring')?.url);
  });

  it('explicitly accounts for every shipped base, including unavailable official images', () => {
    const documented = [...Object.keys(iconSnapshot.items), ...Object.keys(iconSnapshot.missing)].sort();
    expect(documented).toEqual(JEWELLERY_BASES.map((base) => base.english).sort());
    expect(Object.keys(iconSnapshot.items)).toHaveLength(44);
    for (const base of Object.keys(iconSnapshot.missing)) expect(getOfficialItemImage(base)).toBeUndefined();
  });

  it('does not guess artwork for generic, unknown or partially matched names', () => {
    for (const name of ['Ring', 'Rings', 'Amulets', 'Unknown Ring', 'My Ruby Ring', '红玉戒指', '__proto__']) {
      expect(getOfficialItemImage(name)).toBeUndefined();
    }
  });
});
