import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { createTradeLogService } from './tradeLog';
import { createWorkbenchBridge } from './workbenchServer';
let temporary = '';
afterEach(async () => {
  vi.useRealTimers();
  if (temporary && resolve(temporary).startsWith(resolve(tmpdir(), 'workbench-trade-test-'))) await rm(temporary, { recursive: true, force: true });
  temporary = '';
});
describe('bounded local trade log summary', () => {
  it('returns only official trade records, stable IDs and a nonfinancial acceptance hint', async () => {
    temporary = await mkdtemp(join(tmpdir(), 'workbench-trade-test-'));
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 22, 21));
    const log = join(temporary, 'Client.txt');
    const line = '2026/10/22 20:00:00 123 [INFO Client 1] @來自 Trader: 你好，我想購買 戒指 標價 2 divine 在 Forbidden Rites (倉庫頁 "Store")';
    await writeFile(log, [
      '2026/08/01 20:00:00 [INFO Client 1] @From Old: Hi, I would like to buy your Ring listed for 1 divine in Forbidden Rites.',
      '2026/10/22 19:59:00 [INFO Client 1] @From Friend: PRIVATE_CHAT_MUST_NOT_LEAK', line,
      '2026/10/22 20:00:02 [INFO Client 1] : Trade accepted.',
      '2026/10/22 20:10:00 [INFO Client 1] @From Partial: Hi, I would like to buy your Ring listed for 3 divine in Forbidden Rites.',
    ].join('\n'));
    const service = createTradeLogService([log]);
    const summary = await service.read(true);
    expect(summary.events).toHaveLength(1);
    expect(summary.diagnostics).toMatchObject({ history: true, lines: 3, whispers: 2, unmatchedTradeMessages: 0, acceptanceHints: 1 });
    expect(summary.events[0]).toMatchObject({ player: 'Trader', amount: 2, currency: 'divine', acceptedAt: new Date(2026, 9, 22, 20, 0, 2).toISOString() });
    expect(JSON.stringify(summary)).not.toMatch(/PRIVATE_CHAT|倉庫頁|Client 1|workbench-trade-test/);
    expect((await service.read()).events[0]?.id).toBe(summary.events[0]?.id);
    expect(await createTradeLogService([join(temporary, 'missing.txt')]).read()).toMatchObject({ found: false, events: [] });
  });
  it('restricts summary access to loopback and never accepts a user-provided file path', async () => {
    const tradeLog = { read: vi.fn().mockResolvedValue({ found: false, events: [], truncated: false }) };
    const bridge = createWorkbenchBridge({ tradeLog });
    const server = createServer((request, response) => { void bridge.handle(request, response); });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    try {
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('No address');
      const url = `http://127.0.0.1:${address.port}/api/workbench/trade-log`;
      expect((await fetch(url, { headers: { Origin: 'https://example.com' } })).status).toBe(403);
      expect(tradeLog.read).not.toHaveBeenCalled();
      expect((await fetch(`${url}?history=1&path=C:/private.txt`)).status).toBe(200);
      expect(tradeLog.read).toHaveBeenCalledExactlyOnceWith(true);
    } finally { bridge.close(); await new Promise<void>((done) => server.close(() => done())); }
  });
});
