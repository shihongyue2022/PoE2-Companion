import { describe, expect, it } from 'vitest';
import { logTimestamp, parseTradeMessage } from './tradeTracking';
import { collectTrades, confirmTrade, emptyFinance, readFinance, trackerReport } from './finance';

const at = '2026-10-18T01:21:34Z';
const incoming = '@來自 Seller: 你好，我想購買 沉船, 騎士護甲 標價 1 exalted 在 Forbidden Rites (倉庫頁 "商店"; 位置: 左 21, 上 3)';
function proposal(id = 'trade-1') { return parseTradeMessage(incoming, { id, at, source: 'log' })!; }
describe('trade tracking with explicit confirmation', () => {
  it('reads official Chinese/English whispers, direction and stacks without collecting normal chat', () => {
    expect(proposal()).toMatchObject({ player: 'Seller', item: '沉船, 騎士護甲', amount: 1, currency: 'exalted', kind: 'sale', league: 'Forbidden Rites' });
    expect(parseTradeMessage('@To Buyer: Hi, I would like to buy your 10 Exalted Orb for my 2 divine in Forbidden Rites.', { id: 'b', at, source: 'log' }))
      .toMatchObject({ kind: 'purchase', quantity: 10, item: 'Exalted Orb', amount: 2, currency: 'divine' });
    expect(parseTradeMessage('Hi, I would like to buy your Ring listed for 1 mirror in Forbidden Rites.', { id: 'c', at, source: 'paste' })).toMatchObject({ kind: null, currency: null, currencyText: 'mirror' });
    expect(parseTradeMessage('@From Private: hello personal chat', { id: 'p', at, source: 'log' })).toBeNull();
    expect(logTimestamp('2026/02/30 10:20:00 invalid')).toBeNull();
    expect(logTimestamp('2026/10/18 10:21:34 [INFO]')).toBe(new Date(2026, 9, 18, 10, 21, 34).toISOString());
  });
  it('keeps historical quotes out of cashflow, deduplicates polls and confirms actual price once', () => {
    const event = proposal();
    let state = collectTrades(emptyFinance(), [event, event]);
    expect(state.tradeInbox).toHaveLength(1); expect(state.entries).toHaveLength(0);
    state.sessions.push({ id: 'today', league: 'Forbidden Rites', startedAt: '2026-10-22T00:00:00Z' });
    expect(trackerReport(state, 'Forbidden Rites', 'exalted', 30).income).toBe(0);
    state = confirmTrade(state, event, 'Forbidden Rites', { amount: 3, currency: 'exalted', kind: 'sale' });
    expect(readFinance(JSON.stringify(state))).toEqual(state);
    expect(state.entries[0]).toMatchObject({ at, amount: 3, confirmed: true, trade: { sourceId: event.id } });
    expect(state.entries[0]?.sessionId).not.toBe('today');
    expect(collectTrades(state, [event])).toBe(state);
    expect(() => confirmTrade(state, event, 'Forbidden Rites', { amount: 3, currency: 'exalted', kind: 'sale' })).toThrow('已处理');
    const other = proposal('other'); state = collectTrades(state, [other]);
    expect(() => confirmTrade(state, other, 'Standard', { amount: 1, currency: 'divine', kind: 'purchase' })).toThrow('联盟');
  });
  it('separates currencies/leagues/date filters and leaves ignored records ignored after reload', () => {
    const first = proposal(); let state = confirmTrade(collectTrades(emptyFinance(), [first]), first, 'Forbidden Rites', { amount: 10, currency: 'exalted', kind: 'sale' });
    const second = proposal('second'); state = confirmTrade(collectTrades(state, [second]), second, 'Forbidden Rites', { amount: 2, currency: 'divine', kind: 'purchase' });
    const now = Date.parse('2026-10-22T02:00:00Z');
    expect(trackerReport(state, 'Forbidden Rites', 'exalted', 30, 'seller', now)).toMatchObject({ income: 10, expense: 0, net: 10 });
    expect(trackerReport(state, 'Forbidden Rites', 'divine', 30, '', now).net).toBe(-2);
    expect(trackerReport(state, 'Forbidden Rites', 'exalted', 1, '', now).rows).toHaveLength(0);
    expect(trackerReport(state, 'Other', 'exalted', 30, '', now).rows).toHaveLength(0);
    state.ignoredTradeIds = ['ignored']; state = readFinance(JSON.stringify(state));
    expect(collectTrades(state, [proposal('ignored')])).toBe(state);
    expect(() => readFinance(JSON.stringify({ ...state, tradeInbox: [{ ...proposal('bad'), quantity: -1 }] }))).toThrow('待确认');
    expect(() => readFinance(JSON.stringify({ ...state, entries: [...state.entries, { ...state.entries[0], id: 'duplicated' }] }))).toThrow('重复');
  });
  it('preserves all unprocessed records when the inbox reaches its limit', () => {
    const state = { ...emptyFinance(), tradeInbox: Array.from({ length: 500 }, (_, index) => proposal(`existing-${index}`)) };
    expect(collectTrades(state, [proposal('new')])).toBe(state);
    expect(readFinance(JSON.stringify(state)).tradeInbox?.[0]?.id).toBe('existing-0');
  });
  it('adds acceptance evidence arriving in a later poll without changing the quoted amount or confirming cashflow', () => {
    const event = proposal(), initial = collectTrades(emptyFinance(), [event]);
    const acceptedAt = '2026-10-18T01:22:00Z';
    const next = collectTrades(initial, [{ ...event, acceptedAt }]);
    expect(next.tradeInbox).toHaveLength(1); expect(next.tradeInbox![0]!.acceptedAt).toBe(acceptedAt);
    expect(next.entries).toHaveLength(0); expect(collectTrades(next, [{ ...event, acceptedAt }])).toBe(next);
    expect(collectTrades(initial, [{ ...event, amount: 999, acceptedAt }])).toBe(initial);
  });
});
