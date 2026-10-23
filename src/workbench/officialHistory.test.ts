import { describe, expect, it } from 'vitest';
import { parseOfficialHistory } from './officialHistory';
import { emptyFinance, readFinance, trackerReport } from './finance';
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
});
