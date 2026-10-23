import { tradeCurrency, type TradeCandidate } from './tradeTracking';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const clean = (value: unknown, length = 300) => typeof value === 'string' ? Array.from(value.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2').replace(/\[([^\]]+)\]/g, '$1')).filter((char) => char.charCodeAt(0) >= 32).join('').trim().slice(0, length) : '';
export interface OfficialHistoryReport { fetchedAt: string; count: number; skipped: number; missingIds: number; unknownCurrencies: number;
  sales: number; purchases: number; firstAt?: string; lastAt?: string; hasMore?: boolean; unavailableItems?: number;
  skipReasons?: Partial<Record<'format' | 'status' | 'direction' | 'time' | 'price' | 'item' | 'quantity' | 'league', number>> }
export const HISTORY_SKIP_LABELS = { format: '成交结构不完整', status: '不是已完成成交', direction: '买卖方向未知', time: '时间无效', price: '金额或通货缺失', item: '物品和来源标识均缺失', quantity: '物品数量无效', league: '物品不属于当前联盟' } as const;
function historyTime(value: unknown): string {
  // The official merchant feed also uses Unix epoch seconds. Date.parse of a
  // numeric string is browser-dependent, so normalize seconds/ms explicitly.
  const raw = typeof value === 'number' ? value : typeof value === 'string' && /^\d{10,13}$/.test(value.trim()) ? Number(value) : undefined;
  const ms = raw !== undefined ? raw > 0 && Number.isFinite(raw) ? raw < 1e12 ? raw * 1000 : raw : NaN : Date.parse(clean(value));
  return Number.isFinite(ms) && ms > 0 && ms < 8.64e15 ? new Date(ms).toISOString() : '';
}

/** The bridge reads only the dedicated merchant-history endpoint. Search results
 * are not accepted. Absence of a purchase is not evidence of no spending. */
export async function parseOfficialHistory(payload: unknown, league: string): Promise<{ candidates: TradeCandidate[]; report: OfficialHistoryReport }> {
  if (!object(payload) || payload.endpoint !== 'trade2/history' || payload.league !== league || !Array.isArray(payload.entries) || payload.entries.length > 1000
    || typeof payload.fetchedAt !== 'string' || !Number.isFinite(Date.parse(payload.fetchedAt))) throw new Error('官方成交摘要无效，未写入账本。');
  const candidates: TradeCandidate[] = [], report: OfficialHistoryReport = { fetchedAt: payload.fetchedAt, count: payload.entries.length, skipped: 0, missingIds: 0, unknownCurrencies: 0, sales: 0, purchases: 0,
    ...(typeof payload.hasMore === 'boolean' ? { hasMore: payload.hasMore } : {}), unavailableItems: 0, skipReasons: {} };
  const seen = new Set<string>();
  const skip = (reason: keyof typeof HISTORY_SKIP_LABELS) => { report.skipped++; report.skipReasons![reason] = (report.skipReasons![reason] ?? 0) + 1; };
  for (const entry of payload.entries) {
    if (!object(entry) || !object(entry.price)) { skip('format'); continue; }
    if (entry.status !== undefined && !['sold', 'completed', 'complete', 'success'].includes(clean(entry.status).toLowerCase())) { skip('status'); continue; }
    const direction = clean(entry.direction).toLowerCase();
    const kind = !direction || ['sell', 'sale', 'sold'].includes(direction) ? 'sale' : ['buy', 'purchase', 'bought'].includes(direction) ? 'purchase' : undefined;
    const details = object(entry.item) ? entry.item : {};
    const at = historyTime(entry.time), item = [clean(details.name), clean(details.baseType)].filter(Boolean).join(' · ').slice(0, 300);
    const amount = entry.price.amount, currencyText = clean(entry.price.currency, 100), itemLeague = clean(details.league, 150);
    const quantity = details.stackSize ?? 1;
    const sourceId = clean(entry.id ?? entry.item_id ?? details.id);
    if (!kind) { skip('direction'); continue; }
    if (!at || Date.parse(at) > Date.parse(payload.fetchedAt) + 300000) { skip('time'); continue; }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 1e12 || !currencyText) { skip('price'); continue; }
    if (!Number.isSafeInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 1e9) { skip('quantity'); continue; }
    if (itemLeague && itemLeague !== league) { skip('league'); continue; }
    if (!item && !sourceId) { skip('item'); continue; }
    if (!sourceId) report.missingIds++;
    // Item IDs may reappear after resale. Timestamp and direction distinguish
    // transactions; a fallback with identical facts cannot distinguish two sales.
    const signature = JSON.stringify([league, kind, new Date(at).toISOString(), sourceId || [item, amount, currencyText, quantity]]);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature));
    const id = `official-${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    if (seen.has(id)) continue; seen.add(id);
    const currency = tradeCurrency(currencyText);
    if (!currency) report.unknownCurrencies++;
    if (!item) report.unavailableItems!++;
    candidates.push({ id, at, kind, player: '', item: item || '官方成交（物品详情已失效）', quantity: quantity as number, amount, currency, currencyText, league, source: 'import' });
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
    const timer = window.setTimeout(() => { finish(); reject(new Error(action === 'ping' ? '未连接同步扩展' : '同步超时。请检查扩展和官网历史页，再重试。')); }, action === 'ping' ? 1500 : 45000);
    window.addEventListener('message', receive); signal?.addEventListener('abort', abort, { once: true });
    window.postMessage({ channel: 'poe2-history-request', id, action, league, passive }, window.location.origin);
  });
}
