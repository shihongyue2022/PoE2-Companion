import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildFlexibleTrade } from '../src/workbench/tradeSearch';
import {
  createEstimateService, createWorkbenchBridge, rateLimitDeadline,
  validateClipboard, validateEstimate, validLoopbackRequest,
} from './workbenchServer';

const search = buildFlexibleTrade({ league: 'Test League', baseId: 'Rings', rows: [] }).query;
const body = { league: 'Test League', search };
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers });
const item = (amount: number, currency = 'exalted', account = String(amount)) => ({ id: String(amount), listing: { price: { amount, currency }, account: { name: account } } });

describe('official market estimate service', () => {
  it('makes one official search and at most two fetches of ten, coalesces and caches identical requests', async () => {
    const network = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ id: 'search123', total: 300, result: Array.from({ length: 30 }, (_, i) => `id${i}`) }))
      .mockResolvedValueOnce(json({ result: [item(10), item(20), item(30)] }))
      .mockResolvedValueOnce(json({ result: [item(40), item(50)] }));
    const service = createEstimateService({ fetch: network });
    const [first, concurrent] = await Promise.all([service(body), service(body)]);
    expect(first).toEqual(concurrent);
    expect(network).toHaveBeenCalledTimes(3);
    expect(network.mock.calls[0]?.[0]).toBe('https://www.pathofexile.com/api/trade2/search/poe2/Test%20League');
    expect(String(network.mock.calls[1]?.[0])).toContain('id0,id1,id2,id3,id4,id5,id6,id7,id8,id9?query=search123');
    expect(String(network.mock.calls[2]?.[0])).toContain('id10,id11,id12,id13,id14,id15,id16,id17,id18,id19?query=search123');
    expect(first).toMatchObject({ ok: true, total: 300, fetched: 5, priced: 5, cached: false, groups: [{ median: 30 }] });
    if (first.ok) expect(first.warnings.join(' ')).toContain('偏向市场低价');
    expect(await service(body)).toMatchObject({ ok: true, cached: true });
    expect(network).toHaveBeenCalledTimes(3);
    expect(network.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Cookie');
  });

  it('does not send a fetch request when no items match', async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValue(json({ id: 'H4sI'.repeat(60), total: 0, result: [] }));
    const result = await createEstimateService({ fetch: network })(body);
    expect(result).toMatchObject({ ok: true, total: 0, fetched: 0, priced: 0, groups: [] });
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('reports login restrictions without cookies, challenge bypasses or retries', async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValue(json({}, 403));
    const result = await createEstimateService({ fetch: network })(body);
    expect(result).toMatchObject({ ok: false, error: { kind: 'login' } });
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('honors Retry-After and rejects a different request without issuing network traffic', async () => {
    let now = 1_800_000_000_000;
    const network = vi.fn<typeof fetch>().mockResolvedValue(json({}, 429, { 'Retry-After': '37' }));
    const service = createEstimateService({ fetch: network, now: () => now });
    expect(await service(body)).toMatchObject({ ok: false, error: { kind: 'limited', retryAfterSeconds: 37 } });
    now += 10_000;
    expect(await service({ ...body, league: 'Other' })).toMatchObject({ ok: false, error: { kind: 'limited', retryAfterSeconds: 27 } });
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('honors dynamic rate-limit headers and refuses the next batch when capacity is exhausted', async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValue(json({ id: 'limited', total: 10, result: ['id1'] }, 200, {
      'X-Rate-Limit-Rules': 'Ip', 'X-Rate-Limit-Ip': '2:10:60', 'X-Rate-Limit-Ip-State': '2:10:0',
    }));
    expect(await createEstimateService({ fetch: network })(body)).toMatchObject({ ok: false, error: { kind: 'limited', retryAfterSeconds: 10 } });
    expect(network).toHaveBeenCalledTimes(1);
    expect(rateLimitDeadline(new Headers({ 'Retry-After': '6', 'X-Rate-Limit-Rules': 'Ip', 'X-Rate-Limit-Ip': '3:10:60', 'X-Rate-Limit-Ip-State': '1:10:24' }), 1000)).toBe(25_000);
  });

  it('keeps already retrieved samples if a later batch fails, labeling partial samples', async () => {
    const network = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ id: 'partial', total: 15, result: Array.from({ length: 15 }, (_, i) => `id${i}`) }))
      .mockResolvedValueOnce(json({ result: [item(5), item(6)] }))
      .mockResolvedValueOnce(json({}, 503));
    const result = await createEstimateService({ fetch: network })(body);
    expect(result).toMatchObject({ ok: true, fetched: 2, priced: 2 });
    if (result.ok) expect(result.warnings.join(' ')).toContain('部分样本');
  });

  it('validates queries and never accepts a caller-provided upstream URL', () => {
    expect(() => validateEstimate({ league: '../x', search: { query: { stats: [] } }, url: 'http://attacker.test' })).toThrow();
    expect(() => validateEstimate({ ...body, league: '' })).toThrow();
    expect(validateEstimate({ ...body, url: 'http://attacker.test', search: { ...search, sort: { price: 'desc' } } })).toEqual(body);
  });
});

describe('local desktop bridge', () => {
  it('allows loopback only and checks the browser origin against the actual local host', () => {
    expect(validLoopbackRequest({ host: '127.0.0.1:5173' }, '127.0.0.1')).toBe(true);
    expect(validLoopbackRequest({ host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173' }, '::ffff:127.0.0.1')).toBe(true);
    expect(validLoopbackRequest({ host: 'evil.test:5173' }, '127.0.0.1')).toBe(false);
    expect(validLoopbackRequest({ host: '127.0.0.1:5173', origin: 'https://evil.test' }, '127.0.0.1')).toBe(false);
    expect(validLoopbackRequest({ host: '127.0.0.1:5173' }, '192.168.1.10')).toBe(false);
  });

  it('requires complete equipment text and a known operation', () => {
    expect(validateClipboard({ raw: '稀有度: 稀有\n裂痕戒指', mode: 'trade' })).toEqual({ raw: '稀有度: 稀有\n裂痕戒指', mode: 'trade' });
    expect(() => validateClipboard({ raw: 'password', mode: 'trade' })).toThrow();
    expect(() => validateClipboard({ raw: 'Rarity: Rare', mode: 'run' })).toThrow();
  });

  const cleanups: (() => void)[] = [];
  afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });

  it('exchanges packets, result summaries and SSE events without retaining old tasks', async () => {
    const bridge = createWorkbenchBridge();
    const server = createServer((req, res) => { void bridge.handle(req, res); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(() => { bridge.close(); server.closeAllConnections(); server.close(); });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/workbench`;
    const post = async (path: string, value: unknown) => fetch(`${base}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    const source = await fetch(`${base}/clipboard/events`);
    expect(source.headers.get('content-type')).toContain('text/event-stream');
    const reader = source.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"item":null');
    const uploaded = await (await post('clipboard', { raw: 'Rarity: Rare\nRuby Ring', mode: 'trade' })).json() as { id: string };
    const event = new TextDecoder().decode((await reader.read()).value);
    expect(event).toContain(uploaded.id);
    const delivered = JSON.parse(event.replace(/^data: /, '').trim()) as { item: { deliveryToken: string } };
    expect(await (await fetch(`${base}/clipboard?after=${uploaded.id}`)).json()).toEqual({ item: null });
    expect(await (await fetch(`${base}/companion-result?id=${uploaded.id}`)).json()).toMatchObject({ status: 'pending' });
    await post('companion-result', { id: uploaded.id, deliveryToken: delivered.item.deliveryToken, status: 'ready', message: '挂牌样本 20 崇高石', url: 'https://www.pathofexile.com/trade2/search/poe2/Test/abcd' });
    expect(await (await fetch(`${base}/companion-result?id=${uploaded.id}`)).json()).toMatchObject({ status: 'ready', message: '挂牌样本 20 崇高石' });
    // A fresh page/subscription must not import a completed packet again.
    expect(await (await fetch(`${base}/clipboard`)).json()).toEqual({ item: null });
    const resumed = await fetch(`${base}/clipboard/events`);
    const resumedReader = resumed.body!.getReader();
    expect(new TextDecoder().decode((await resumedReader.read()).value)).toContain('"item":null');
    await resumedReader.cancel();
    expect((await post('companion-result', { id: uploaded.id, status: 'ready', message: 'Bad', url: 'https://evil.test' })).status).toBe(400);
    await post('clipboard', { raw: 'Rarity: Rare\nGold Amulet', mode: 'checkpoint' });
    expect(await (await fetch(`${base}/clipboard`)).json()).toEqual({ item: null });
    await reader.cancel();
    // Pending packets remain available after reload until the browser publishes a result.
    await vi.waitFor(async () => {
      expect(await (await fetch(`${base}/clipboard`)).json()).toMatchObject({ item: { raw: 'Rarity: Rare\nGold Amulet', mode: 'checkpoint' } });
    });
    expect(await (await fetch(`${base}/companion-result?id=${uploaded.id}`)).json()).toMatchObject({ status: 'missing' });
  });

  it('delivers only to the newest page, rejects replaced owners and locks the final result', async () => {
    const bridge = createWorkbenchBridge();
    const server = createServer((req, res) => { void bridge.handle(req, res); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(() => { bridge.close(); server.closeAllConnections(); server.close(); });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/workbench`;
    const post = async (path: string, value: unknown) => fetch(`${base}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    type EventPacket = { item: { id: string; deliveryToken: string } | null };
    const read = async (reader: ReadableStreamDefaultReader<Uint8Array>): Promise<EventPacket> => JSON.parse(new TextDecoder().decode((await reader.read()).value).replace(/^data: /, '').trim()) as EventPacket;
    const firstSource = await fetch(`${base}/clipboard/events`);
    const first = firstSource.body!.getReader();
    expect((await read(first)).item).toBeNull();
    const pending = await (await post('clipboard', { raw: 'Rarity: Rare\nRuby Ring', mode: 'checkpoint' })).json() as { id: string };
    const original = (await read(first)).item!;
    const secondSource = await fetch(`${base}/clipboard/events`);
    const second = secondSource.body!.getReader();
    const replacement = (await read(second)).item!;
    expect(replacement.id).toBe(pending.id);
    expect(replacement.deliveryToken).not.toBe(original.deliveryToken);
    expect((await post('companion-result', { id: pending.id, deliveryToken: original.deliveryToken, status: 'ready', message: '旧页锚点结果' })).status).toBe(409);
    expect(await (await fetch(`${base}/companion-result?id=${pending.id}`)).json()).toMatchObject({ status: 'pending' });
    expect(await (await fetch(`${base}/clipboard`)).json()).toEqual({ item: null });

    const firstWaiting = read(first);
    await post('clipboard', { raw: 'Rarity: Rare\nGold Amulet', mode: 'trade' });
    const current = (await read(second)).item!;
    expect(await Promise.race([firstWaiting.then(() => 'delivered'), new Promise<string>((resolve) => setTimeout(() => resolve('idle'), 50))])).toBe('idle');
    await post('companion-result', { id: current.id, deliveryToken: current.deliveryToken, status: 'ready', message: '最新页估价结果' });
    expect(await (await post('companion-result', { id: current.id, deliveryToken: current.deliveryToken, status: 'error', message: '晚到覆盖' })).json()).toEqual({ ok: true, ignored: true });
    expect(await (await fetch(`${base}/companion-result?id=${current.id}`)).json()).toMatchObject({ status: 'ready', message: '最新页估价结果' });

    const thirdSource = await fetch(`${base}/clipboard/events`);
    const third = thirdSource.body!.getReader();
    expect((await read(third)).item).toBeNull();
    await post('clipboard', { raw: 'Rarity: Rare\nGold Amulet', mode: 'checkpoint' });
    const thirdOwned = (await read(third)).item!;
    await third.cancel();
    const handedBack = (await read(second)).item!;
    expect(handedBack.id).toBe(thirdOwned.id);
    expect(handedBack.deliveryToken).not.toBe(thirdOwned.deliveryToken);
    await second.cancel();
    expect((await firstWaiting).item?.id).toBe(thirdOwned.id);
    await first.cancel();
  });
});
