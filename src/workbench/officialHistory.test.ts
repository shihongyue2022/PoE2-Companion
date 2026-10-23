import { describe, expect, it } from 'vitest';
import { parseOfficialHistory } from './officialHistory';
import { correctTradeDirection, emptyFinance, readFinance, trackerReport } from './finance';
import { applyTradeImport } from './tradeImport';

const entry = { id: 'sale-1', time: '2026-10-22T10:00:00Z', price: { amount: 12, currency: 'divine' }, item: { name: 'Example', baseType: 'Gold Ring', league: 'Test' } };
const payload = (entries: unknown[]) => ({ endpoint: 'trade2/history', league: 'Test', fetchedAt: '2026-10-23T00:00:00Z', entries });
describe('official history only, bounded coverage and stable ledger deduplication', () => {
  it('imports merchant sales, does not invent buys, and persists deduplication across refreshes', async () => {
    const parsed = await parseOfficialHistory(payload([entry]), 'Test');
    expect(parsed.report).toMatchObject({ sales: 1, purchases: 0, firstAt: new Date(entry.time).toISOString(), lastAt: new Date(entry.time).toISOString() });
    const first = applyTradeImport(emptyFinance(), parsed.candidates, true, 'Test');
    const restored = readFinance(JSON.stringify(first.state));
    expect(applyTradeImport(restored, parsed.candidates, true, 'Test')).toMatchObject({ added: 0, duplicates: 1 });
    expect(trackerReport(restored, 'Test', 'divine', 0, '')).toMatchObject({ income: 12, expense: 0 });
  });
  it('separates explicit buys, invalid status, cross-league and unknown currencies', async () => {
    const parsed = await parseOfficialHistory(payload([entry,
      { ...entry, id: 'purchase', direction: 'buy' }, { ...entry, id: 'cancel', status: 'cancelled' },
      { ...entry, id: 'wrong-league', item: { ...entry.item, league: 'Other' } },
      { ...entry, id: 'unknown-currency', price: { amount: 1, currency: 'mirror' } },
    ]), 'Test');
    expect(parsed.report).toMatchObject({ sales: 2, purchases: 1, skipped: 2, unknownCurrencies: 1 });
    expect(parsed.candidates.find((row) => row.currency === null)?.currencyText).toBe('mirror');
  });
  it('rejects arbitrary search payloads and distinguishes a resale of an item by time', async () => {
    await expect(parseOfficialHistory({ ...payload([]), endpoint: 'trade2/search' }, 'Test')).rejects.toThrow();
    const parsed = await parseOfficialHistory(payload([entry, entry, { ...entry, time: '2026-10-22T11:00:00Z' }]), 'Test');
    expect(parsed.candidates).toHaveLength(2);
    const fallback = await parseOfficialHistory(payload([{ ...entry, id: undefined }]), 'Test');
    expect(fallback.report.missingIds).toBe(1);
    expect((await parseOfficialHistory(payload([{ ...entry, id: undefined }]), 'Test')).candidates[0]!.id).toBe(fallback.candidates[0]!.id);
  });
  it('normalizes official epoch seconds/ms without losing income, and keeps expired item sales with a source ID', async () => {
    const seconds = Date.parse(entry.time) / 1000;
    const iso = await parseOfficialHistory(payload([entry]), 'Test');
    for (const time of [seconds, seconds * 1000, String(seconds)]) {
      const parsed = await parseOfficialHistory(payload([{ ...entry, time }]), 'Test');
      expect(parsed.candidates[0]?.id).toBe(iso.candidates[0]!.id);
      const imported = applyTradeImport(emptyFinance(), parsed.candidates, true, 'Test');
      expect(trackerReport(readFinance(JSON.stringify(imported.state)), 'Test', 'divine', 0)).toMatchObject({ income: 12 });
    }
    const expired = await parseOfficialHistory(payload([{ ...entry, item: null }]), 'Test');
    expect(expired.report).toMatchObject({ sales: 1, unavailableItems: 1, skipped: 0 });
    expect(expired.candidates[0]?.item).toContain('物品详情已失效');
    expect(readFinance(JSON.stringify({ ...emptyFinance(), officialHistory: { Test: expired.report } })).officialHistory?.Test?.unavailableItems).toBe(1);
  });
  it('retains a user-corrected purchase direction across subsequent merchant syncs without duplicating the entry', async () => {
    const parsed = await parseOfficialHistory(payload([entry]), 'Test');
    const imported = applyTradeImport(emptyFinance(), parsed.candidates, true, 'Test').state;
    const corrected = correctTradeDirection(imported, imported.entries[0]!.id, 'purchase');
    const replayed = applyTradeImport(readFinance(JSON.stringify(corrected)), parsed.candidates, true, 'Test');
    expect(replayed.added).toBe(0); expect(replayed.duplicates).toBe(1);
    expect(replayed.state.entries).toHaveLength(1);
    expect(replayed.state.entries[0]).toMatchObject({ kind: 'purchase', amount: 12, currency: 'divine', trade: { sourceId: parsed.candidates[0]!.id } });
    expect(trackerReport(replayed.state, 'Test', 'divine', 0)).toMatchObject({ income: 0, expense: 12, expenseCount: 1, net: -12 });
    expect(trackerReport(imported, 'Test', 'divine', 0)).toMatchObject({ expense: 0, expenseCount: 0 });
  });
  it('reports why rows were rejected instead of silently claiming a zero ledger', async () => {
    const parsed = await parseOfficialHistory(payload([null, { ...entry, time: 0 }, { ...entry, price: {} },
      { ...entry, item: { ...entry.item, league: 'Other' } }, { ...entry, status: 'cancelled' },
      { ...entry, id: undefined, item: null }]), 'Test');
    expect(parsed.report).toMatchObject({ count: 6, skipped: 6, skipReasons: { format: 1, time: 1, price: 1, league: 1, status: 1, item: 1 } });
    expect(parsed.candidates).toHaveLength(0);
    const restored = readFinance(JSON.stringify({ ...emptyFinance(), officialHistory: { Test: parsed.report } }));
    expect(restored.officialHistory?.Test?.skipReasons?.time).toBe(1);
    expect(() => readFinance(JSON.stringify({ ...restored, officialHistory: { Test: { ...parsed.report, skipReasons: { time: -1 } } } }))).toThrow();
  });
});
