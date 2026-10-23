import { expect, it } from 'vitest';
import { applyTradeImport, importTradeTime, parseTradeCsv, previewTradeImport, suggestTradeMapping } from './tradeImport';
import { emptyFinance, readFinance, trackerReport } from './finance';

const csv = '\uFEFF时间,物品,玩家,类型,数量,通货,联盟,物品数量,来源交易ID\r\n"2026-10-18T01:00:00Z","Ring, with ""quote""",Seller,出售收入,10,神圣石,Forbidden Rites,2,record-a\r\n2026-10-18T02:00:00Z,Boots,Buyer,购买支出,3,崇高石,Forbidden Rites,1,record-b';
it('previews native CSV with escaped quotes and independent item quantity, then imports completed trades once', async () => {
  const table = parseTradeCsv(csv), preview = await previewTradeImport(table, suggestTradeMapping(table), 'Default');
  expect(preview.warnings).toEqual([]);
  expect(preview.candidates[0]).toMatchObject({ item: 'Ring, with "quote"', quantity: 2, amount: 10, currency: 'divine', kind: 'sale', league: 'Forbidden Rites' });
  const pending = applyTradeImport(emptyFinance(), preview.candidates, false, 'Default').state;
  expect(pending.entries).toHaveLength(0); expect(pending.tradeInbox).toHaveLength(2);
  const done = applyTradeImport(emptyFinance(), preview.candidates, true, 'Default');
  expect(readFinance(JSON.stringify(done.state)).entries).toHaveLength(2);
  expect(trackerReport(done.state, 'Forbidden Rites', 'divine', 0, '', Date.parse('2026-10-23T00:00:00Z'))).toMatchObject({ income: 10, net: 10 });
  const repeated = applyTradeImport(done.state, preview.candidates, true, 'Default');
  expect(repeated).toMatchObject({ added: 0, duplicates: 2 }); expect(repeated.state).toBe(done.state);
  expect(done.state.sessions.every((row) => row.league === 'Forbidden Rites')).toBe(true);
});
it('requires explicit column mapping and direction instead of guessing from positive amounts', async () => {
  const table = parseTradeCsv('when;what;paid;unit\n2026/10/18 10:00:00;Ring;2;divine');
  await expect(previewTradeImport(table, {}, 'Test')).rejects.toThrow('成交时间');
  const mapping = { at: 0, item: 1, amount: 2, currency: 3 };
  await expect(previewTradeImport(table, mapping, 'Test')).rejects.toThrow('交易方向');
  expect((await previewTradeImport(table, mapping, 'Test', 'purchase')).candidates[0]).toMatchObject({ amount: 2, kind: 'purchase', league: 'Test' });
  await expect(previewTradeImport(table, { ...mapping, quantity: 2 }, 'Test', 'purchase')).rejects.toThrow('同一列');
});
it('does not manufacture dates, currencies or cashflow from malformed rows', async () => {
  const table = parseTradeCsv('date,item,amount,currency,type\nnot-a-date,Ring,2,divine,sale\n2026/10/18 10:00:00,Ring,2,mirror,sale\n2026/10/18 10:00:00,Ring,-10,divine,sale\n2026/10/18 10:00:00,Ring,2,divine,maybe');
  const preview = await previewTradeImport(table, suggestTradeMapping(table), 'Test');
  expect(preview.candidates).toEqual([]); expect(preview.warnings).toHaveLength(4);
  expect(importTradeTime('2026/02/30 10:00:00')).toBeUndefined();
  expect(importTradeTime('2026-02-30T10:00:00Z')).toBeUndefined();
  expect(importTradeTime('10/11/2026 10:00:00')).toBeUndefined();
  expect(() => parseTradeCsv('item,item\na,b')).toThrow('重复表头');
  expect(() => parseTradeCsv('a,b\n"unfinished')).toThrow('引号没有闭合');
});
it('retains identical same-second trades without IDs and gives repeated imports stable identities', async () => {
  const row = '2026-10-18T01:00:00Z,Ring,2,divine,sale';
  const table = parseTradeCsv(`date,item,amount,currency,type\n${row}\n${row}`), mapping = suggestTradeMapping(table);
  const a = await previewTradeImport(table, mapping, 'Test'), b = await previewTradeImport(table, mapping, 'Test');
  expect(a.candidates).toHaveLength(2); expect(a.candidates[0]!.id).not.toBe(a.candidates[1]!.id);
  expect(a.candidates.map((row) => row.id)).toEqual(b.candidates.map((row) => row.id)); expect(a.missingIds).toBe(true);
});
it('does not silently drop records when the pending inbox has no space', async () => {
  const table = parseTradeCsv(csv), { candidates } = await previewTradeImport(table, suggestTradeMapping(table), 'Test');
  const state = { ...emptyFinance(), tradeInbox: Array.from({ length: 500 }, (_, i) => ({ ...candidates[0]!, id: `existing-${i}` })) };
  expect(() => applyTradeImport(state, candidates, false, 'Test')).toThrow('没有写入');
  expect(state.tradeInbox).toHaveLength(500); expect(state.entries).toHaveLength(0);
});
it('does not duplicate a manually recorded sale when its exported CSV is imported back', async () => {
  const table = parseTradeCsv(csv.replace('record-a', 'entry-manual-sale'));
  const { candidates } = await previewTradeImport(table, suggestTradeMapping(table), 'Test');
  const state = { ...emptyFinance(), sessions: [{ id: 'session', league: 'Forbidden Rites', startedAt: '2026-10-18T00:00:00Z' }],
    entries: [{ id: 'manual-sale', sessionId: 'session', at: '2026-10-18T01:00:00Z', kind: 'sale' as const, label: 'Ring', amount: 10, currency: 'divine' as const, confirmed: true }] };
  const imported = applyTradeImport(state, candidates, true, 'Forbidden Rites');
  expect(imported).toMatchObject({ added: 1, duplicates: 1 });
  expect(imported.state.entries).toHaveLength(2);
});
