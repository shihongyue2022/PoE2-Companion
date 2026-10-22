import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch.ts';
import { JEWELLERY_BASES, findJewelleryBase } from './catalog.ts';
import {
  buildWorkbenchTrade, currentItemTargets, fetchTradeLeagues, loadGearTrade,
  OFFLINE_MARKET, parseTradeLeagues,
} from './market.ts';

const data = loadShippedPatch('data/patches/0.5.0');
const trade = await loadGearTrade();

function queryOf(url: string) {
  return JSON.parse(new URL(url).searchParams.get('q')!) as {
    query: {
      type?: string;
      status: { option: string };
      filters: {
        type_filters: { filters: { category: { option: string }; rarity: { option: string } } };
        misc_filters?: { filters: { ilvl: { min?: number; max?: number } } };
      };
      stats: { type: string; filters: { id: string; value?: { min?: number } }[] }[];
    };
  };
}

describe('workbench official trade links', () => {
  it('keeps real mapped stat IDs, tier minima, base, ilvl, and the explicitly selected league', () => {
    const wanted = { modId: 'Rings/IncreasedLife', tierDisplay: 1 };
    const result = buildWorkbenchTrade({
      trade, data, league: ' My Current League ', baseId: 'Rings',
      baseName: '藍玉戒指', itemLevelMin: 82, itemLevelMax: 100, targets: [wanted],
    });
    const url = new URL(result.url);
    expect(url.hostname).toBe('www.pathofexile.com');
    expect(decodeURIComponent(url.pathname)).toBe('/trade2/search/poe2/My Current League');
    const q = queryOf(result.url).query;
    expect(q.type).toBe('Sapphire Ring');
    expect(q.status.option).toBe('online');
    expect(q.filters.type_filters.filters.category.option).toBe('accessory.ring');
    expect(q.filters.type_filters.filters.rarity.option).toBe('nonunique');
    expect(q.filters.misc_filters?.filters.ilvl).toEqual({ min: 82, max: 100 });
    const min = data.mods.get(wanted.modId)!.tiers.at(-1)!.ranges[0]![0];
    expect(q.stats.flatMap((g) => g.filters)).toContainEqual({
      id: 'explicit.stat_3299347043', value: { min }, disabled: false,
    });
    expect(result.warnings).toEqual([]);
  });

  it('supports the whole category without inventing a concrete base filter', () => {
    const { url } = buildWorkbenchTrade({ trade, data, league: 'L', baseId: 'Amulets', targets: [] });
    const q = queryOf(url).query;
    expect(q.type).toBeUndefined();
    expect(q.filters.type_filters.filters.category.option).toBe('accessory.amulet');
    expect(q.filters.misc_filters).toBeUndefined();
  });

  it('reports unsearchable compound or unknown modifiers instead of silently dropping them', () => {
    const { url, warnings, loose } = buildWorkbenchTrade({
      trade, data, league: 'L', baseId: 'Amulets', targets: [
        { modId: 'Amulets/PerfectEssence_EssenceAbyss', tierDisplay: 1 },
        { modId: 'Amulets/Intelligence', tierDisplay: 1 },
        { modId: 'Amulets/DoesNotExist', tierDisplay: 1 },
      ],
    });
    expect(loose).toBe(true);
    expect(warnings).toHaveLength(2);
    expect(warnings.join(' ')).toContain('DoesNotExist');
    expect(queryOf(url).query.stats.flatMap((g) => g.filters).length).toBeGreaterThan(0);
  });

  it('rejects an empty league, invalid ilvl intervals, and mismatched base categories', () => {
    const input = { trade, data, league: 'L', baseId: 'Rings', targets: [] };
    expect(() => buildWorkbenchTrade({ ...input, league: ' ' })).toThrow('赛季');
    expect(() => buildWorkbenchTrade({ ...input, itemLevelMin: 0 })).toThrow('等级');
    expect(() => buildWorkbenchTrade({ ...input, itemLevelMin: 2.5 })).toThrow('等级');
    expect(() => buildWorkbenchTrade({ ...input, itemLevelMin: 90, itemLevelMax: 80 })).toThrow('下限');
    expect(() => buildWorkbenchTrade({ ...input, baseName: 'Stellar Amulet' })).toThrow('类别');
  });

  it('uses the actual placed tier for current-item searches', () => {
    const mod = data.mods.get('Rings/IncreasedLife')!;
    const tierIndex = 1;
    expect(currentItemTargets(data, {
      base: data.bases.get('Rings')!, level: 82, rarity: 'rare',
      prefixes: [{ modId: mod.id, tierName: mod.tiers[tierIndex]!.name }], suffixes: [],
    })).toEqual([{ modId: mod.id, tierDisplay: mod.tiers.length - tierIndex }]);
  });
});

describe('official PoE2 trading league discovery', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses current trade results without asserting which league is latest', () => {
    const leagues = parseTradeLeagues({ result: [
      { id: 'Standard', text: 'Standard', realm: 'poe2' },
      { id: 'Hardcore', realm: 'poe2' },
      { id: 'Example Future League', text: 'Example Future League', realm: 'poe2' },
      { id: 'Hardcore Example Future League', text: 'HC Example Future League', realm: 'poe2' },
      { id: 'SSF Example Future League', realm: 'poe2' },
      { id: 'PoE1 League', realm: 'pc' },
      { id: 'Example Future League', realm: 'poe2' },
    ] });
    expect(leagues.map((l) => l.id)).toEqual(['Standard', 'Hardcore', 'Example Future League', 'Hardcore Example Future League']);
    expect(leagues[0]!.standard).toBe(true);
    expect(leagues[1]!.standard).toBe(true);
    expect(leagues[1]!.hardcore).toBe(true);
    expect(leagues[2]!.hardcore).toBe(false);
    expect(leagues[3]!.hardcore).toBe(true);
  });

  it('accepts the main-leagues API and excludes no-trade rules', () => {
    expect(parseTradeLeagues([
      { id: 'League', realm: 'poe2', startAt: '2026-10-01T00:00:00Z' },
      { id: 'Solo League', rules: [{ id: 'NoTrading', name: 'No Trading' }] },
    ])).toEqual([{ id: 'League', label: 'League', hardcore: false, standard: false, startAt: '2026-10-01T00:00:00Z' }]);
    expect(() => parseTradeLeagues('<html>rate limited</html>')).toThrow('接口');
    expect(() => parseTradeLeagues({ result: [] })).toThrow('未返回');
  });

  it('uses only the local league proxy and propagates API failures for a manual fallback', async () => {
    const mock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ result: [{ id: 'League' }] }) });
    vi.stubGlobal('fetch', mock);
    const leagues = await fetchTradeLeagues();
    expect(mock.mock.calls[0]![0]).toBe('/api/poe/leagues');
    expect(leagues[0]!.id).toBe('League');
    mock.mockResolvedValueOnce({ ok: false, status: 429 });
    await expect(fetchTradeLeagues()).rejects.toThrow('429');
  });
});

describe('versioned jewellery base catalogue', () => {
  it('covers exactly the concrete English names in the shipped jewellery snapshot', () => {
    for (const category of ['Rings', 'Amulets']) {
      const expected = [...(data.bases.get(category)!.bases ?? [])].sort();
      const actual = JEWELLERY_BASES.filter((b) => b.category === category).map((b) => b.english).sort();
      expect(actual).toEqual(expected);
    }
    expect(OFFLINE_MARKET.patch).toBe(data.patch);
    expect(OFFLINE_MARKET.updated).toBe('2026-10-18');
  });

  it('resolves Traditional, Simplified, and longest English names without substring false positives', () => {
    expect(findJewelleryBase('稀有的 精製裂痕戒指')?.english).toBe('Refined Breach Ring');
    expect(findJewelleryBase('闪耀的 恒星项链')?.english).toBe('Stellar Amulet');
    expect(findJewelleryBase('Fine Sapphire Ring of the Cloud')?.english).toBe('Sapphire Ring');
    expect(findJewelleryBase('Refined Breach Ring')?.english).toBe('Refined Breach Ring');
    expect(findJewelleryBase('Stellar Ringworm')).toBeUndefined();
  });

  it('does not treat special prefix/suffix caps as a standard 3+3 base', () => {
    for (const name of ['Dusk Ring', 'Gloam Amulet', 'Lament Amulet', 'Portent Amulet', 'Absent Amulet', 'Twisted Amulet', 'Distorted Amulet']) {
      const base = findJewelleryBase(name)!;
      expect(base.supported).toBe(false);
      expect(base.unsupportedReason).toContain('上限');
    }
    expect(findJewelleryBase('Sapphire Ring')!.supported).toBe(true);
  });
});
