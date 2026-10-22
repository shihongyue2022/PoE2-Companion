import { describe, expect, it, vi } from 'vitest';
import {
  estimateConfidence, estimateQueryContext, estimateSummary, fetchMarketEstimate,
  representativeListings, summarizeListingPrices,
} from './marketEstimate';
import { buildFlexibleTrade } from './tradeSearch';

const listing = (amount: number, currency: string, seller?: string) => ({
  listing: { price: { amount, currency }, account: { name: seller } },
});

describe('comparable listing prices', () => {
  it('keeps currencies separate, deduplicates sellers at their cheapest price and computes quantiles', () => {
    const summary = summarizeListingPrices([
      listing(100, 'exalted', 'Seller A'), listing(20, 'exalted', 'Seller A'),
      listing(40, 'exalted', 'B'), listing(60, 'exalted', 'C'), listing(80, 'exalted', 'D'),
      listing(2, 'divine', 'Seller A'), listing(4, 'divine', 'E'),
    ]);
    expect(summary.priced).toBe(6);
    expect(summary.duplicateSellers).toBe(1);
    expect(summary.groups).toEqual([
      { currency: 'exalted', count: 4, min: 20, max: 80, p25: 35, p75: 65, median: 50 },
      { currency: 'divine', count: 2, min: 2, max: 4, p25: 2.5, p75: 3.5, median: 3 },
    ]);
  });

  it('ignores removed, invalid and unpriced listings and never invents zero-price data', () => {
    expect(summarizeListingPrices([
      null, { listing: {} }, { ...listing(1, 'exalted'), gone: true },
      listing(0, 'exalted'), listing(-1, 'divine'), listing(Number.NaN, 'exalted'),
      listing(5, 'unknown<script>'), listing(7, 'exalted'),
    ])).toEqual({ groups: [{ currency: 'exalted', count: 1, min: 7, max: 7, p25: 7, p75: 7, median: 7 }], priced: 1, duplicateSellers: 0 });
    expect(summarizeListingPrices([])).toEqual({ groups: [], priced: 0, duplicateSellers: 0 });
  });

  it('reports errors and no listings honestly to the native companion', () => {
    expect(estimateSummary({ ok: false, error: { kind: 'login', message: '官网要求登录' } }, 'https://example.test')).toMatchObject({ status: 'error', message: '官网要求登录' });
    expect(estimateSummary({ ok: true, total: 0, fetched: 0, priced: 0, duplicateSellers: 0, groups: [], sampledAt: new Date().toISOString(), cached: false, url: 'https://example.test', warnings: [] }, '')).toMatchObject({ status: 'ready', message: '当前条件没有找到挂单，请放宽筛选。' });
  });

  it('shows every quoted currency, sample time, query limits and real item examples in the native summary', () => {
    const groups = summarizeListingPrices([listing(1, 'alch', 'A'), listing(1, 'alch', 'B'),
      listing(20, 'exalted', 'C'), listing(3, 'divine', 'D')]);
    const context = estimateQueryContext(buildFlexibleTrade({ league: 'Test', baseId: 'Rings', rows: [] }).query);
    const summary = estimateSummary({ ok: true, total: 1000, fetched: 4, ...groups,
      sampledAt: '2026-10-22T00:00:00Z', cached: false, url: 'https://www.pathofexile.com/trade2/search/poe2/Test/id', warnings: [],
      context, confidence: estimateConfidence(context, groups.groups),
      listings: [{ id: 'listing1', name: 'Doom Circle', base: 'Ruby Ring', price: { amount: 3, currency: 'divine' } }],
    }, '');
    expect(summary.message).toBe('挂牌参考 · 3 种币种 · 低置信');
    expect(summary.detail).toContain('点金石：1–1 · 中位 1 · 2 样本');
    expect(summary.detail).toContain('崇高石：20–20');
    expect(summary.detail).toContain('神圣石：3–3');
    expect(summary.detail).toContain('有效样本 4 件');
    expect(summary.detail).toContain('2026');
    expect(summary.detail).toContain('主要条件：戒指');
    expect(summary.detail).toContain('条件不足');
    expect(summary.detail).toContain('样本：Doom Circle · 红玉戒指 / 3 神圣石');
    expect(summary.detail).toContain('未换算汇率');
    expect(summary.detail).not.toContain('还有其他币种');
  });

  it('requires meaningful constraints and does not mistake OR aliases or disabled filters for strong similarity', () => {
    const base = buildFlexibleTrade({ league: 'Test', baseId: 'Rings', rows: [] }).query;
    const weak = estimateQueryContext({ ...base, query: { ...base.query, stats: [
      { type: 'count', value: { min: 1 }, filters: [{ id: 'explicit.stat_1' }, { id: 'fractured.stat_1' }, { id: 'explicit.stat_2' }] },
      { type: 'and', disabled: true, filters: [{ id: 'explicit.stat_3' }] },
    ] } });
    expect(weak).toMatchObject({ statCount: 1, propertyCount: 0, sufficient: false });
    const specific = estimateQueryContext({ ...base, query: { ...base.query, type: 'Ruby Ring',
      filters: { ...base.query.filters, equipment_filters: { filters: { ar: { min: 500 }, es: { min: 200 }, ev: { min: 50, disabled: true } } } },
    } });
    expect(specific).toMatchObject({ statCount: 0, propertyCount: 2, sufficient: true });
    expect(specific.summary.join(' ')).toContain('护甲 500–不限');
    expect(estimateConfidence(specific, [{ currency: 'exalted', count: 8, median: 3, p25: 2, p75: 4, min: 1, max: 5 }])).toEqual({ level: 'limited', reasons: [] });
  });

  it('extracts bounded public item facts without exposing seller, stash, whisper or arbitrary fields', () => {
    const first = { id: 'public-id', ...listing(2, 'divine', 'PRIVATE_ACCOUNT'),
      item: { name: 'Doom\0 Circle', baseType: 'Ruby Ring', properties: [{ name: 'Energy Shield', values: [['120', 0]] }],
        explicitMods: ['+80 to maximum Life', 'x'.repeat(1000)], icon: 'https://private.test', note: 'PRIVATE_NOTE' } };
    const samples = representativeListings([first,
      { ...first, id: 'duplicate', listing: { price: { amount: 9, currency: 'divine' }, account: { name: 'PRIVATE_ACCOUNT' } } },
      { ...first, id: 'alch-id', listing: { price: { amount: 1, currency: 'alch' } } },
      { ...first, id: '../invalid' }, { ...first, id: 'gone', gone: true }]);
    expect(samples).toHaveLength(2);
    expect(samples.find((row) => row.id === 'public-id')).toMatchObject({ name: 'Doom Circle', base: 'Ruby Ring',
      price: { amount: 2, currency: 'divine' }, properties: ['Energy Shield: 120'] });
    expect(samples[0]?.explicitMods?.[1]).toHaveLength(220);
    expect(JSON.stringify(samples)).not.toMatch(/PRIVATE|account|whisper|stash|https:/);
    expect(representativeListings(Array.from({ length: 30 }, (_, index) => ({ ...first, id: `id${index}`,
      listing: { price: { amount: index + 1, currency: 'exalted' }, account: { name: `seller${index}` } } })))).toHaveLength(2);
  });

  it('posts only the explicit official query to the loopback bridge', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: false, error: { kind: 'limited', message: '稍后查询', retryAfterSeconds: 60 } }), { status: 429 }));
    const query = buildFlexibleTrade({ league: 'Test', baseId: 'Rings', rows: [] }).query;
    const result = await fetchMarketEstimate(query, 'Test');
    expect(result.ok).toBe(false);
    expect(spy.mock.calls[0]?.[0]).toBe('/api/workbench/estimate');
    expect(JSON.parse(spy.mock.calls[0]?.[1]?.body as string)).toEqual({ league: 'Test', search: query });
    spy.mockRestore();
  });
});
