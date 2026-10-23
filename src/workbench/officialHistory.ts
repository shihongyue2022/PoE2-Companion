import { tradeCurrency, type TradeCandidate } from './tradeTracking';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const clean = (value: unknown, length = 300) => typeof value === 'string' ? Array.from(value.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2').replace(/\[([^\]]+)\]/g, '$1')).filter((char) => char.charCodeAt(0) >= 32).join('').trim().slice(0, length) : '';
export interface OfficialHistoryReport { fetchedAt: string; count: number; skipped: number; missingIds: number; unknownCurrencies: number;
  sales: number; purchases: number; firstAt?: string; lastAt?: string; hasMore?: boolean }

/** The bridge reads only the dedicated merchant-history endpoint. Search results
 * are not accepted. Absence of a purchase is not evidence of no spending. */
export async function parseOfficialHistory(payload: unknown, league: string): Promise<{ candidates: TradeCandidate[]; report: OfficialHistoryReport }> {
  if (!object(payload) || payload.endpoint !== 'trade2/history' || payload.league !== league || !Array.isArray(payload.entries) || payload.entries.length > 1000
    || typeof payload.fetchedAt !== 'string' || !Number.isFinite(Date.parse(payload.fetchedAt))) throw new Error('官方成交摘要无效，未写入账本。');
  const candidates: TradeCandidate[] = [], report: OfficialHistoryReport = { fetchedAt: payload.fetchedAt, count: payload.entries.length, skipped: 0, missingIds: 0, unknownCurrencies: 0, sales: 0, purchases: 0,
    ...(typeof payload.hasMore === 'boolean' ? { hasMore: payload.hasMore } : {}) };
  const seen = new Set<string>();
  for (const entry of payload.entries) {
    if (!object(entry) || !object(entry.item) || !object(entry.price)) { report.skipped++; continue; }
    if (entry.status !== undefined && !['sold', 'completed', 'complete', 'success'].includes(clean(entry.status).toLowerCase())) { report.skipped++; continue; }
    const direction = clean(entry.direction).toLowerCase();
    const kind = !direction || ['sell', 'sale', 'sold'].includes(direction) ? 'sale' : ['buy', 'purchase', 'bought'].includes(direction) ? 'purchase' : undefined;
    const at = clean(entry.time), item = [clean(entry.item.name), clean(entry.item.baseType)].filter(Boolean).join(' · ').slice(0, 300);
    const amount = entry.price.amount, currencyText = clean(entry.price.currency, 100), itemLeague = clean(entry.item.league, 150);
    const quantity = entry.item.stackSize ?? 1;
    if (!kind || !at || !Number.isFinite(Date.parse(at)) || Date.parse(at) > Date.parse(payload.fetchedAt) + 300_000 || !item ||
      typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 1e12 || !currencyText ||
      !Number.isSafeInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 1e9 || itemLeague && itemLeague !== league) { report.skipped++; continue; }
    const sourceId = clean(entry.id ?? entry.item_id ?? entry.item.id);
    if (!sourceId) report.missingIds++;
    // Item IDs may reappear after resale. Timestamp and direction distinguish
    // transactions; a fallback with identical facts cannot distinguish two sales.
    const signature = JSON.stringify([league, kind, new Date(at).toISOString(), sourceId || [item, amount, currencyText, quantity]]);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature));
    const id = `official-${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    if (seen.has(id)) continue; seen.add(id);
    const currency = tradeCurrency(currencyText);
    if (!currency) report.unknownCurrencies++;
    candidates.push({ id, at: new Date(at).toISOString(), kind, player: '', item, quantity: quantity as number, amount, currency, currencyText, league, source: 'import' });
    if (kind === 'sale') report.sales++; else report.purchases++;
  }
  const times = candidates.map((row) => row.at).sort(); report.firstAt = times[0]; report.lastAt = times.at(-1);
  return { candidates, report };
}

export function historyBridge(action: 'ping' | 'open' | 'sync', league: string, signal?: AbortSignal, passive = false): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('同步已取消。')); return; }
    const id = crypto.randomUUID();
    const finish = () => { clearTimeout(timer); window.removeEventListener('message', receive); signal?.removeEventListener('abort', abort); };
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || !object(event.data) || event.data.channel !== 'poe2-history-response' || event.data.id !== id || !object(event.data.result)) return;
      finish(); resolve(event.data.result);
    };
    const abort = () => { finish(); reject(new Error('同步已取消。')); };
    const timer = window.setTimeout(() => { finish(); reject(new Error(action === 'ping' ? '未连接同步扩展' : '同步超时。请检查扩展和官网历史页，再重试。')); }, action === 'ping' ? 1500 : 30000);
    window.addEventListener('message', receive); signal?.addEventListener('abort', abort, { once: true });
    window.postMessage({ channel: 'poe2-history-request', id, action, league, passive }, window.location.origin);
  });
}
