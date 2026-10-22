import { describe, expect, it, vi } from 'vitest';
import { estimateSummary, fetchMarketEstimate, summarizeListingPrices } from './marketEstimate';
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
