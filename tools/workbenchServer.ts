import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { summarizeListingPrices, type MarketEstimateResult } from '../src/workbench/marketEstimate';

const OFFICIAL = 'https://www.pathofexile.com';
const MAX_BODY = 65_536;
const CACHE_TTL = 120_000;
const MIN_ESTIMATE_INTERVAL = 15_000;
type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value);

export interface ClipboardPacket {
  readonly id: string;
  readonly raw: string;
  readonly mode: 'trade' | 'checkpoint';
  readonly createdAt: string;
}

interface CompanionResult {
  readonly status: 'pending' | 'ready' | 'error' | 'missing';
  readonly message: string;
  readonly detail?: string;
  readonly url?: string;
}

export class WorkbenchRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

/** Only same-origin browsers and loopback desktop clients can interact with the local bridge. */
export function validLoopbackRequest(headers: IncomingMessage['headers'], remoteAddress?: string): boolean {
  if (remoteAddress && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress)) return false;
  const host = headers.host;
  if (!host || !/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/i.test(host)) return false;
  if (!headers.origin) return true;
  try {
    const origin = new URL(headers.origin);
    return ['http:', 'https:'].includes(origin.protocol) && origin.host.toLowerCase() === host.toLowerCase();
  } catch { return false; }
}

export function validateClipboard(value: unknown): { raw: string; mode: ClipboardPacket['mode'] } {
  if (!object(value) || typeof value.raw !== 'string' || Buffer.byteLength(value.raw) > MAX_BODY - 256
    || !/^(?:Rarity|稀有度)\s*[:：]/im.test(value.raw)) {
    throw new WorkbenchRequestError(400, '请先复制完整装备文本，需包含稀有度。');
  }
  if (value.mode !== 'trade' && value.mode !== 'checkpoint') throw new WorkbenchRequestError(400, '未知的快捷键操作。');
  // Equipment clipboard text must not carry embedded NUL bytes into parsing or native messages.
  return { raw: value.raw.split('\0').join(''), mode: value.mode };
}

export function validateEstimate(value: unknown): { league: string; search: JsonObject } {
  // Reject ASCII control characters in a league name before it enters an official request URL.
  if (!object(value) || typeof value.league !== 'string' || !value.league.trim() || value.league.length > 150
    || Array.from(value.league).some((character) => character.charCodeAt(0) < 32)
    || !object(value.search) || !object(value.search.query)) {
    throw new WorkbenchRequestError(400, '赛季或交易条件无效。');
  }
  const query = value.search.query;
  if (!object(query.status) || !['any', 'online', 'securable'].includes(String(query.status.option))
    || !object(query.filters) || !object(query.filters.type_filters) || !object(query.filters.type_filters.filters)
    || !object(query.filters.type_filters.filters.category)
    || !['accessory.ring', 'accessory.amulet'].includes(String(query.filters.type_filters.filters.category.option))
    || !Array.isArray(query.stats) || query.stats.length > 64) {
    throw new WorkbenchRequestError(400, '当前仅支持戒指和项链的官方交易条件。');
  }
  let count = 0;
  for (const group of query.stats) {
    if (!object(group) || !['and', 'count', 'not', 'if'].includes(String(group.type)) || !Array.isArray(group.filters)) {
      throw new WorkbenchRequestError(400, '词缀筛选格式无效。');
    }
    count += group.filters.length;
    if (count > 384 || group.filters.some((filter) => !object(filter) || typeof filter.id !== 'string'
      || !/^[a-z_]+\.[a-zA-Z0-9_]+$/.test(filter.id))) throw new WorkbenchRequestError(400, '词缀筛选过多或属性编号无效。');
  }
  return { league: value.league.trim(), search: { query, sort: { price: 'asc' } } };
}

/** Absolute deadline from Retry-After and the official dynamic rate-limit state. */
export function rateLimitDeadline(headers: Headers, now: number): number {
  let delay = 0;
  const retry = headers.get('retry-after');
  if (retry) {
    const seconds = Number(retry);
    delay = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(retry) - now) || 0;
  }
  for (const rule of (headers.get('x-rate-limit-rules') ?? '').split(',').map((part) => part.trim()).filter(Boolean)) {
    const limits = (headers.get(`x-rate-limit-${rule}`) ?? '').split(',');
    const states = (headers.get(`x-rate-limit-${rule}-state`) ?? '').split(',');
    for (let index = 0; index < states.length; index++) {
      const [used, windowSeconds, penalty] = (states[index] ?? '').split(':').map(Number);
      const maximum = Number((limits[index] ?? '').split(':')[0]);
      if (penalty && Number.isFinite(penalty)) delay = Math.max(delay, penalty * 1000);
      if (used !== undefined && Number.isFinite(used) && maximum > 0 && used >= maximum
        && windowSeconds !== undefined && Number.isFinite(windowSeconds)) delay = Math.max(delay, windowSeconds * 1000);
    }
  }
  return now + Math.min(Math.max(delay, 0), 86_400_000);
}

interface EstimateServiceOptions { fetch?: typeof fetch; now?: () => number }

/** No account cookies or login tokens are read. Errors retain the user-opened official link. */
export function createEstimateService(options: EstimateServiceOptions = {}) {
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { at: number; result: MarketEstimateResult }>();
  const inFlight = new Map<string, Promise<MarketEstimateResult>>();
  let cooldown = 0;
  let officialCooldown = 0;
  const fail = (kind: 'login' | 'limited' | 'network' | 'unavailable', message: string, url: string,
    retryAfterSeconds?: number): MarketEstimateResult => ({
    ok: false, error: { kind, message, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) }, url,
  });

  async function officialJson(path: string, init: RequestInit): Promise<unknown> {
    if (officialCooldown > now()) throw new WorkbenchRequestError(429, '官方交易请求次数已达限制。');
    const response = await request(`${OFFICIAL}${path}`, {
      ...init, redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { Accept: 'application/json', 'User-Agent': 'PoE2-Craft-Workbench/1.0 (local personal price comparison)',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    officialCooldown = Math.max(officialCooldown, rateLimitDeadline(response.headers, now()));
    if (response.status === 429) {
      if (officialCooldown <= now()) officialCooldown = now() + 60_000;
      throw new WorkbenchRequestError(429, '官方交易请求次数已达限制。');
    }
    if ([401, 403].includes(response.status)) throw new WorkbenchRequestError(response.status, '官方交易拒绝了匿名请求，请在官网查看挂单。');
    if (!response.ok) throw new WorkbenchRequestError(502, `官方交易暂时不可用（HTTP ${response.status}）。`);
    let body: unknown;
    try { body = await response.json(); } catch { throw new WorkbenchRequestError(502, '官方交易没有返回可读取的数据，请在官网查看。'); }
    if (object(body) && body.error) throw new WorkbenchRequestError(502, '官方交易无法执行当前筛选，请到官网核对条件。');
    return body;
  }

  async function run(league: string, search: JsonObject, url: string): Promise<MarketEstimateResult> {
    try {
      // Public request/fetch flow matches Exiled Exchange 2; fetch batches are capped at 10 IDs.
      const found = await officialJson(`/api/trade2/search/poe2/${encodeURIComponent(league)}`, {
        method: 'POST', body: JSON.stringify(search),
      });
      // Current official searches can return a compressed query token, longer than legacy IDs.
      if (!object(found) || typeof found.id !== 'string' || !/^[a-zA-Z0-9_-]{1,4096}$/.test(found.id)
        || !Array.isArray(found.result) || typeof found.total !== 'number' || !Number.isFinite(found.total)) {
        throw new WorkbenchRequestError(502, '官方搜索结果格式已变化，请在官网查看。');
      }
      const ids = [...new Set(found.result.filter((id): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(id)))].slice(0, 20);
      const listings: unknown[] = [];
      const warnings: string[] = [];
      for (let index = 0; index < ids.length; index += 10) {
        try {
          const body = await officialJson(`/api/trade2/fetch/${ids.slice(index, index + 10).join(',')}?query=${encodeURIComponent(found.id)}`, { method: 'GET' });
          if (!object(body) || !Array.isArray(body.result)) throw new WorkbenchRequestError(502, '官方标价结果格式已变化，请在官网查看。');
          listings.push(...body.result.filter((entry) => entry !== null));
        } catch (error) {
          if (!listings.length) throw error;
          warnings.push('后续挂单未能读取，以下仅统计已成功读取的部分样本。');
          break;
        }
      }
      const summary = summarizeListingPrices(listings);
      if (summary.groups.some((group) => group.count < 5)) warnings.push('部分币种少于 5 个卖家，样本很少，区间仅供核对。');
      if (found.total > ids.length) warnings.push('样本来自价格升序最前面的挂单，偏向市场低价，不能当作全市场中位数。');
      if (summary.groups.length > 1) warnings.push('不同币种分别统计，未使用汇率换算或混算。');
      return {
        ok: true, total: Math.max(0, Math.floor(found.total)), fetched: listings.length,
        ...summary, sampledAt: new Date(now()).toISOString(), cached: false,
        url: `${OFFICIAL}/trade2/search/poe2/${encodeURIComponent(league)}/${encodeURIComponent(found.id)}`, warnings,
      };
    } catch (error) {
      if (error instanceof WorkbenchRequestError) {
        if (error.status === 429) return fail('limited', error.message, url, Math.max(1, Math.ceil((officialCooldown - now()) / 1000)));
        if ([401, 403].includes(error.status)) return fail('login', error.message, url);
        return fail('unavailable', error.message, url);
      }
      return fail('network', '连接官方交易失败，请检查网络或打开官方页面查看。', url);
    }
  }

  return async (value: unknown): Promise<MarketEstimateResult> => {
    const { league, search } = validateEstimate(value);
    const key = JSON.stringify([league, search]);
    const url = `${OFFICIAL}/trade2/search/poe2/${encodeURIComponent(league)}?q=${encodeURIComponent(JSON.stringify(search))}`;
    const cached = cache.get(key);
    if (cached && now() - cached.at < CACHE_TTL) return cached.result.ok ? { ...cached.result, cached: true } : cached.result;
    const pending = inFlight.get(key);
    if (pending) return pending;
    const deadline = Math.max(cooldown, officialCooldown);
    if (deadline > now()) return fail('limited', '查询过于频繁，请稍候再试。', url, Math.ceil((deadline - now()) / 1000));
    cooldown = now() + MIN_ESTIMATE_INTERVAL;
    const task = run(league, search, url).then((result) => {
      if (result.ok) {
        cache.set(key, { at: now(), result });
        while (cache.size > 20) cache.delete(cache.keys().next().value!);
      }
      return result;
    }).finally(() => inFlight.delete(key));
    inFlight.set(key, task);
    return task;
  };
}

async function jsonBody(request: IncomingMessage): Promise<unknown> {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) {
    throw new WorkbenchRequestError(415, '请使用 JSON 请求。');
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    bytes += buffer.length;
    if (bytes > MAX_BODY) throw new WorkbenchRequestError(413, '装备文本过长。');
    chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new WorkbenchRequestError(400, 'JSON 格式无效。'); }
}

const writeJson = (response: ServerResponse, status: number, value: unknown): void => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(value));
};

export function createWorkbenchBridge(options: EstimateServiceOptions = {}) {
  const estimate = createEstimateService(options);
  let latest: ClipboardPacket | null = null;
  let result: CompanionResult = { status: 'missing', message: '尚未收到装备。' };
  const clients = new Set<ServerResponse>();
  let owner: ServerResponse | null = null;
  let deliveryToken = '';
  const packet = () => latest && Date.now() - Date.parse(latest.createdAt) < 20 * 60_000 ? latest : null;
  // Reopening the browser may resume a pending request, but must never replay a completed craft.
  const deliverable = () => {
    const current = result.status === 'pending' ? packet() : null;
    return current ? { ...current, deliveryToken } : null;
  };
  const emit = (response: ServerResponse) => response.write(`data: ${JSON.stringify({ item: deliverable() })}\n\n`);
  const selectOwner = (force = false) => {
    const next = [...clients].reverse().find((client) => !client.destroyed) ?? null;
    if (next !== owner || force) {
      owner = next;
      deliveryToken = randomUUID();
      if (owner && deliverable()) emit(owner);
    }
  };
  const close = () => { for (const client of clients) client.end(); clients.clear(); };

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!validLoopbackRequest(request.headers, request.socket.remoteAddress)) {
      writeJson(response, 403, { ok: false, error: { kind: 'invalid', message: '仅允许本机工坊访问。' } }); return;
    }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const route = url.pathname;
    try {
      if (route === '/api/workbench/clipboard/events' && request.method === 'GET') {
        if (clients.size >= 5) throw new WorkbenchRequestError(429, '已达到本地连接上限。');
        response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        response.flushHeaders(); clients.add(response);
        if (deliverable()) selectOwner(); else emit(response);
        const heartbeat = setInterval(() => { if (!response.destroyed) response.write(': keepalive\n\n'); }, 20_000);
        response.on('close', () => {
          clearInterval(heartbeat); clients.delete(response);
          if (owner === response) selectOwner();
        });
        return;
      }
      if (route === '/api/workbench/clipboard' && request.method === 'POST') {
        const parsed = validateClipboard(await jsonBody(request));
        latest = { id: randomUUID(), ...parsed, createdAt: new Date().toISOString() };
        result = { status: 'pending', message: parsed.mode === 'trade' ? '正在读取装备并查询挂单…' : '正在核对制作锚点…' };
        writeJson(response, 200, { ok: true, id: latest.id });
        selectOwner(true);
        return;
      }
      if (route === '/api/workbench/clipboard' && request.method === 'GET') {
        const current = clients.size ? null : deliverable();
        const changedOwner = Boolean(url.searchParams.get('afterToken')) && current?.deliveryToken !== url.searchParams.get('afterToken');
        writeJson(response, 200, { item: current && (current.id !== url.searchParams.get('after') || changedOwner) ? current : null }); return;
      }
      if (route === '/api/workbench/companion-result' && request.method === 'GET') {
        writeJson(response, 200, packet()?.id === url.searchParams.get('id') ? result : { status: 'missing', message: '此装备任务已过期或被后续操作替换。' }); return;
      }
      if (route === '/api/workbench/companion-result' && request.method === 'POST') {
        const value = await jsonBody(request);
        if (!object(value) || value.id !== packet()?.id || !['ready', 'error', 'pending'].includes(String(value.status))
          || typeof value.message !== 'string' || value.message.length > 1000
          || (value.detail !== undefined && (typeof value.detail !== 'string' || value.detail.length > 4000))) {
          throw new WorkbenchRequestError(400, '快捷键结果无效或任务已过期。');
        }
        if (value.url !== undefined && (typeof value.url !== 'string'
          || !/^https:\/\/www\.pathofexile\.com\/trade2\/search\/poe2\//.test(value.url))) {
          throw new WorkbenchRequestError(400, '只允许官方交易页面链接。');
        }
        if (result.status !== 'pending') { writeJson(response, 200, { ok: true, ignored: true }); return; }
        if (value.deliveryToken !== deliveryToken) throw new WorkbenchRequestError(409, '此任务已转交另一个工坊页面，忽略旧结果。');
        result = { status: value.status as CompanionResult['status'], message: value.message,
          ...(typeof value.detail === 'string' ? { detail: value.detail } : {}),
          ...(typeof value.url === 'string' ? { url: value.url } : {}) };
        writeJson(response, 200, { ok: true }); return;
      }
      if (route === '/api/workbench/estimate' && request.method === 'POST') {
        const estimated = await estimate(await jsonBody(request));
        if (!estimated.ok && estimated.error.retryAfterSeconds) response.setHeader('Retry-After', estimated.error.retryAfterSeconds);
        writeJson(response, estimated.ok ? 200 : estimated.error.kind === 'limited' ? 429 : 502, estimated); return;
      }
      writeJson(response, 404, { ok: false, error: { kind: 'invalid', message: '本地接口不存在。' } });
    } catch (error) {
      writeJson(response, error instanceof WorkbenchRequestError ? error.status : 500, {
        ok: false, error: { kind: 'invalid', message: error instanceof WorkbenchRequestError ? error.message : '本地请求暂时失败。' },
      });
    }
  }

  return { handle, close };
}

/** Local dev/preview middleware only; the production site never proxies private account sessions. */
export function workbenchServerPlugin(): Plugin {
  const bridge = createWorkbenchBridge();
  return {
    name: 'local-workbench-companion',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if ((request.url ?? '').startsWith('/api/workbench/')) void bridge.handle(request, response);
        else next();
      });
      server.httpServer?.once('close', bridge.close);
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if ((request.url ?? '').startsWith('/api/workbench/')) void bridge.handle(request, response);
        else next();
      });
      server.httpServer?.once('close', bridge.close);
    },
  };
}
