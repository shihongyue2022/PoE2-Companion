import { describe, expect, it } from 'vitest';
import { compareValuations, emptyFinance, readFinance, sessionReport, takeValuation, type FinanceState, type Valuation } from './finance';

function ledger(): FinanceState {
  return { ...emptyFinance(), sessions: [{ id: 's1', league: 'Test', startedAt: '2026-10-22T00:00:00Z' }, { id: 's2', league: 'Other', startedAt: '2026-10-21T00:00:00Z', endedAt: '2026-10-21T01:00:00Z' }], entries: [
    { id: 'e1', sessionId: 's1', at: '2026-10-22T00:01:00Z', kind: 'sale', label: 'ring', amount: 100, currency: 'exalted', confirmed: true },
    { id: 'e2', sessionId: 's1', at: '2026-10-22T00:02:00Z', kind: 'purchase', label: 'base', amount: 30, currency: 'exalted', confirmed: true },
    { id: 'e3', sessionId: 's1', at: '2026-10-22T00:03:00Z', kind: 'craft', label: 'actual exalt', amount: 5, currency: 'exalted', confirmed: true },
    { id: 'e4', sessionId: 's1', at: '2026-10-22T00:04:00Z', kind: 'sale', label: 'unconfirmed whisper', amount: 9999, currency: 'exalted', confirmed: false },
    { id: 'e5', sessionId: 's1', at: '2026-10-22T00:05:00Z', kind: 'sale', label: 'another item', amount: 2, currency: 'divine', confirmed: true },
    { id: 'e6', sessionId: 's2', at: '2026-10-21T00:05:00Z', kind: 'income', label: 'other league', amount: 500, currency: 'exalted', confirmed: true },
  ] };
}
function valuation(id: string, at: string, assets: Valuation['assets']): Valuation {
  return { id, at, league: 'Test', currency: 'exalted', label: id, assets };
}
describe('confirmed cashflow and separate unrealized revaluation', () => {
  it('excludes pending trades, separates currencies and isolates the selected session', () => {
    const state = ledger(), report = sessionReport(state, 's1');
    expect(report).toEqual({ pending: 1, currencies: { exalted: { income: 100, purchase: 30, craft: 5, net: 65 }, divine: { income: 2, purchase: 0, craft: 0, net: 2 } } });
    expect(sessionReport({ ...state, entries: state.entries.map((row) => ({ ...row, confirmed: false })) }, 's1').currencies).toEqual({});
  });
  it('round-trips records and rejects duplicates, NaN, dangling sessions and negative quantities', () => {
    const state = ledger(); expect(readFinance(JSON.stringify(state))).toEqual(state);
    expect(() => readFinance(JSON.stringify({ ...state, entries: [...state.entries, state.entries[0]] }))).toThrow('重复');
    for (const patch of [{ amount: -1 }, { amount: null }, { currency: 'unknown' }, { sessionId: 'missing' }]) {
      expect(() => readFinance(JSON.stringify({ ...state, entries: [{ ...state.entries[0], ...patch }] }))).toThrow();
    }
  });
  it('uses initial holdings for price movement and separately explains quantity changes', () => {
    const before = valuation('old', '2026-10-22T00:00:00Z', [{ id: 'a', label: 'ring', quantity: 2, price: 100 }]);
    const after = valuation('new', '2026-10-22T10:00:00Z', [{ id: 'a', label: 'ring', quantity: 1, price: 120 }, { id: 'b', label: 'drop', quantity: 1, price: 500 }]);
    const result = compareValuations(before, after);
    expect(result.knownMovement).toBe(40); expect(result.changedHoldings).toBe(2);
    expect(result.rows[0]).toMatchObject({ movement: 40, inventoryChange: -120 });
    expect(result.rows[1]).toMatchObject({ movement: 0, inventoryChange: 500 });
  });
  it('never silently turns a missing price into zero and distinguishes an explicit zero mark', () => {
    const before = valuation('old', '2026-10-22T00:00:00Z', [{ id: 'a', label: 'ring', quantity: 1, price: 100 }]);
    const after = valuation('new', '2026-10-22T10:00:00Z', [{ id: 'a', label: 'ring', quantity: 0, price: null }]);
    expect(compareValuations(before, after)).toMatchObject({ missing: 1, knownMovement: 0 });
    after.assets[0]!.price = 0;
    expect(compareValuations(before, after)).toMatchObject({ missing: 0, knownMovement: -100 });
    expect(() => compareValuations(before, { ...after, currency: 'divine' })).toThrow('同计价');
    expect(() => compareValuations(after, before)).toThrow('晚于');
  });
  it('freezes snapshots independently and omits other leagues or mismatched price currencies', () => {
    const state = ledger(); state.assets = [
      { id: 'a', label: 'ring', league: 'Test', currency: 'exalted', quantity: 2, price: 100 },
      { id: 'b', label: 'amulet', league: 'Test', currency: 'divine', quantity: 1, price: 2 },
      { id: 'c', label: 'other league', league: 'Other', currency: 'exalted', quantity: 1, price: 999 },
    ];
    const snap = takeValuation(state, 'Test', 'exalted', 'logout');
    state.assets[0]!.price = 200; state.assets[0]!.quantity = 9;
    expect(snap.assets).toEqual([{ id: 'a', label: 'ring', quantity: 2, price: 100 }, { id: 'b', label: 'amulet', quantity: 1, price: null }]);
    state.valuations.push(snap); expect(readFinance(JSON.stringify(state))).toEqual(state);
  });
});
