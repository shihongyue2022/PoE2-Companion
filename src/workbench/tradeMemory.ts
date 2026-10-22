import type { FlexibleTradeDocument } from './tradeSearch';

export const TRADE_MEMORY_KEY = 'poe2-workbench-trade-memory-v1';
export const TRADE_MEMORY_EVENT = 'poe2-workbench-trade-memory';
const MAX_ENTRIES = 80;
const MAX_SAVED = 40;
export interface TradeMemoryInput {
  query: FlexibleTradeDocument;
  league: string;
  title?: string;
  raw?: string;
}
export interface TradeMemoryEntry extends TradeMemoryInput {
  id: string;
  title: string;
  saved: boolean;
  folder: string;
  updatedAt: string;
  observation?: { at: string; message: string; detail: string; failed: boolean };
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function validQuery(value: unknown): value is FlexibleTradeDocument {
  if (!object(value) || !object(value.query) || !object(value.sort)) return false;
  const q = value.query;
  return object(q.status) && ['any', 'online', 'securable'].includes(String(q.status.option))
    && object(q.filters) && object(q.filters.type_filters) && object(q.filters.type_filters.filters)
    && Array.isArray(q.stats) && q.stats.length <= 40
    && (value.sort.price === 'asc' || value.sort['statgroup.0'] === 'desc');
}
function validEntry(value: unknown): value is TradeMemoryEntry {
  if (!object(value)) return false;
  return typeof value.id === 'string' && value.id.length < 100 && typeof value.league === 'string' && value.league.length > 0 && value.league.length <= 120
    && typeof value.title === 'string' && value.title.length <= 120 && typeof value.saved === 'boolean'
    && typeof value.folder === 'string' && value.folder.length <= 40
    && typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))
    && (value.raw === undefined || typeof value.raw === 'string' && value.raw.length <= 16000)
    && (value.observation === undefined || object(value.observation) && typeof value.observation.at === 'string'
      && Number.isFinite(Date.parse(value.observation.at)) && typeof value.observation.message === 'string' && value.observation.message.length <= 500
      && typeof value.observation.detail === 'string' && value.observation.detail.length <= 1500 && typeof value.observation.failed === 'boolean')
    && validQuery(value.query) && JSON.stringify(value.query).length <= 60000;
}
export function readTradeMemory(): TradeMemoryEntry[] {
  try {
    const text = localStorage.getItem(TRADE_MEMORY_KEY);
    if (!text || text.length > 5000000) return [];
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? value.slice(0, MAX_ENTRIES).filter(validEntry) : [];
  } catch { return []; }
}
export function tradeMemoryUrl(entry: TradeMemoryInput): string {
  // Never persist or trust a result URL: regenerate the fixed official origin from the exact query.
  return `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(entry.league)}?q=${encodeURIComponent(JSON.stringify(entry.query))}`;
}
function write(entries: TradeMemoryEntry[]): string {
  try {
    const kept = entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const saved = kept.filter((entry) => entry.saved);
    localStorage.setItem(TRADE_MEMORY_KEY, JSON.stringify([...saved, ...kept.filter((entry) => !entry.saved).slice(0, MAX_ENTRIES - saved.length)]));
    window.dispatchEvent(new Event(TRADE_MEMORY_EVENT));
    return '';
  } catch { return '无法保存查价记录，浏览器存储可能已满或被禁用。'; }
}
export function rememberTrade(input: TradeMemoryInput, change: {
  save?: boolean; folder?: string; observation?: TradeMemoryEntry['observation'];
} = {}): string {
  if (!validQuery(input.query) || !input.league.trim() || input.league.length > 120 || JSON.stringify(input.query).length > 60000) return '查询条件无效，未保存。';
  // Read at mutation time, so a mounted older panel cannot overwrite another tab's changes.
  const entries = readTradeMemory();
  const queryText = JSON.stringify(input.query);
  const prior = entries.find((entry) => entry.league === input.league && JSON.stringify(entry.query) === queryText);
  if (change.save && !prior?.saved && entries.filter((entry) => entry.saved).length >= MAX_SAVED) return '最多收藏 40 条搜索，请先移除不再需要的收藏。';
  const entry: TradeMemoryEntry = {
    ...prior, id: prior?.id ?? crypto.randomUUID(), league: input.league, query: input.query,
    title: ((change.save ? input.title : prior?.title) || input.title || input.query.query.name || input.query.query.type || '物品搜索').trim().slice(0, 120),
    raw: input.raw?.slice(0, 16000) ?? prior?.raw,
    saved: change.save ?? prior?.saved ?? false, folder: (change.folder ?? prior?.folder ?? '').trim().slice(0, 40),
    updatedAt: new Date().toISOString(),
    observation: change.observation ? { ...change.observation, message: change.observation.message.slice(0, 500), detail: change.observation.detail.slice(0, 1500) } : prior?.observation,
  };
  return write([entry, ...entries.filter((row) => row.id !== entry.id)]);
}
export function removeTradeMemory(id: string): string { return write(readTradeMemory().filter((row) => row.id !== id)); }
export function clearTradeHistory(): string { return write(readTradeMemory().filter((row) => row.saved)); }
