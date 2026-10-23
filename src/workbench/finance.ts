import type { TradeCandidate } from './tradeTracking';
import type { OfficialHistoryReport } from './officialHistory';
export const FINANCE_KEY = 'poe2-workbench-finance-v1';
export const CURRENCIES = {
  exalted: '崇高石', divine: '神圣石', chaos: '混沌石', alchemy: '点金石', annul: '剥离石', regal: '富豪石', transmute: '蜕变石', augment: '增幅石',
  exalt_greater: '高阶崇高石', exalt_perfect: '完美崇高石', chaos_greater: '高阶混沌石', chaos_perfect: '完美混沌石',
  regal_greater: '高阶富豪石', regal_perfect: '完美富豪石', transmute_greater: '高阶蜕变石', transmute_perfect: '完美蜕变石',
  augment_greater: '高阶增幅石', augment_perfect: '完美增幅石',
} as const;
export type Currency = keyof typeof CURRENCIES;
export type EntryKind = 'sale' | 'purchase' | 'craft' | 'income';
export const ENTRY_LABELS: Record<EntryKind, string> = { sale: '出售收入', purchase: '购买支出', craft: '实际制作消耗', income: '拾取 / 其他收入' };
export interface PlaySession { id: string; league: string; startedAt: string; endedAt?: string }
export interface LedgerEntry {
  id: string; sessionId: string; at: string; kind: EntryKind; label: string;
  amount: number; currency: Currency; confirmed: boolean;
  trade?: { sourceId: string; player: string; quantity: number };
}
export interface Asset { id: string; league: string; label: string; quantity: number; price: number | null; currency: Currency;
  source?: { kind: 'loadout'; itemKey: string } }
export interface Valuation {
  id: string; league: string; at: string; label: string; currency: Currency;
  assets: { id: string; label: string; quantity: number; price: number | null }[];
}
export interface FinanceState { version: 1; sessions: PlaySession[]; entries: LedgerEntry[]; assets: Asset[]; valuations: Valuation[];
  tradeInbox?: TradeCandidate[]; ignoredTradeIds?: string[]; tradeEnabled?: boolean; officialHistory?: Record<string, OfficialHistoryReport> }
export const emptyFinance = (): FinanceState => ({ version: 1, sessions: [], entries: [], assets: [], valuations: [] });
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12;
export const isCurrency = (value: unknown): value is Currency => typeof value === 'string' && Object.prototype.hasOwnProperty.call(CURRENCIES, value);
const string = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 300;
const date = (value: unknown): value is string => string(value) && Number.isFinite(Date.parse(value));
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const mark = (value: unknown): value is Valuation['assets'][number] => object(value) && string(value.id) && string(value.label)
  && finite(value.quantity) && (value.price === null || finite(value.price));
const uniqueIds = (values: { id: string }[]) => new Set(values.map((entry) => entry.id)).size === values.length;
export function readFinance(input: string): FinanceState {
  if (input.length > 5_000_000) throw new Error('记录文件过大。');
  let value: unknown;
  try { value = JSON.parse(input); } catch { throw new Error('记录不是有效的 JSON。'); }
  if (!object(value) || value.version !== 1 || !Array.isArray(value.sessions) || !Array.isArray(value.entries)
    || !Array.isArray(value.assets) || !Array.isArray(value.valuations)) throw new Error('损益记录版本或格式不正确。');
  if (value.sessions.length > 5000 || value.entries.length > 20000 || value.assets.length > 500 || value.valuations.length > 1000) throw new Error('记录条数超过本地账本限制。');
  for (const row of value.sessions) if (!object(row) || !string(row.id) || !string(row.league) || !date(row.startedAt)
    || row.endedAt !== undefined && (!date(row.endedAt) || Date.parse(row.endedAt) < Date.parse(row.startedAt))) throw new Error('游戏场次记录不正确。');
  const sessions = value.sessions as unknown as PlaySession[];
  if (sessions.filter((row) => !row.endedAt).length > 1) throw new Error('同时只能有一场进行中的游戏。');
  for (const row of value.entries) {
    if (!object(row) || !string(row.id) || !string(row.label) || !date(row.at) || !string(row.sessionId)
      || !sessions.some((session) => session.id === row.sessionId) || !finite(row.amount) || row.amount === 0
      || !isCurrency(row.currency) || typeof row.confirmed !== 'boolean' || typeof row.kind !== 'string'
      || !Object.prototype.hasOwnProperty.call(ENTRY_LABELS, row.kind)) throw new Error('收支记录不正确，或所属场次不存在。');
    if (row.trade !== undefined && (!object(row.trade) || !string(row.trade.sourceId) || typeof row.trade.player !== 'string' || row.trade.player.length > 150
      || !Number.isSafeInteger(row.trade.quantity) || (row.trade.quantity as number) < 1 || (row.trade.quantity as number) > 1e9)) throw new Error('交易来源不正确。');
    const session = sessions.find((session) => session.id === row.sessionId)!;
    if (Date.parse(row.at) < Date.parse(session.startedAt) || session.endedAt && Date.parse(row.at) > Date.parse(session.endedAt)) throw new Error('收支记录时间超出所属场次。');
  }
  for (const row of value.assets) if (!object(row) || !string(row.league) || !isCurrency(row.currency)
    || row.source !== undefined && (!object(row.source) || row.source.kind !== 'loadout' || typeof row.source.itemKey !== 'string' || !/^[a-f0-9]{64}$/.test(row.source.itemKey))
    || !mark(row)) throw new Error('资产记录不正确。');
  for (const row of value.valuations) if (!object(row) || !string(row.id) || !string(row.league) || !string(row.label)
    || !date(row.at) || !isCurrency(row.currency) || !Array.isArray(row.assets) || row.assets.length > 500
    || !row.assets.every(mark) || !uniqueIds(row.assets)) throw new Error('估值快照不正确。');
  const state = value as unknown as FinanceState;
  if (value.officialHistory !== undefined && (!object(value.officialHistory) || Object.keys(value.officialHistory).length > 100 || !Object.entries(value.officialHistory).every(([league, report]) =>
    string(league) && object(report) && date(report.fetchedAt) && ['count', 'skipped', 'missingIds', 'unknownCurrencies', 'sales', 'purchases'].every((key) => Number.isSafeInteger(report[key]) && (report[key] as number) >= 0 && (report[key] as number) <= 1000) &&
    (report.firstAt === undefined || date(report.firstAt)) && (report.lastAt === undefined || date(report.lastAt)) && (report.hasMore === undefined || typeof report.hasMore === 'boolean') &&
    (report.unavailableItems === undefined || Number.isSafeInteger(report.unavailableItems) && (report.unavailableItems as number) >= 0 && (report.unavailableItems as number) <= 1000) &&
    (report.skipReasons === undefined || object(report.skipReasons) && Object.entries(report.skipReasons).every(([key, count]) => ['format', 'status', 'direction', 'time', 'price', 'item', 'quantity', 'league'].includes(key) && Number.isSafeInteger(count) && (count as number) >= 0 && (count as number) <= 1000))))) throw new Error('官方成交同步范围不正确。');
  if (state.tradeEnabled !== undefined && typeof state.tradeEnabled !== 'boolean') throw new Error('追踪设置不正确。');
  if (state.ignoredTradeIds !== undefined && (!Array.isArray(state.ignoredTradeIds) || state.ignoredTradeIds.length > 20000 || !state.ignoredTradeIds.every(string))) throw new Error('忽略记录不正确。');
  if (state.tradeInbox !== undefined && (!Array.isArray(state.tradeInbox) || state.tradeInbox.length > 500 || !state.tradeInbox.every(validTradeCandidate) || !uniqueIds(state.tradeInbox))) throw new Error('待确认交易不正确。');
  if (![state.sessions, state.entries, state.assets, state.valuations].every(uniqueIds)) throw new Error('记录 ID 重复，已拒绝导入以避免重复记账。');
  const tradeIds = state.entries.flatMap((entry) => entry.trade ? [entry.trade.sourceId] : []);
  if (new Set(tradeIds).size !== tradeIds.length) throw new Error('同一交易重复记账。');
  return state;
}
export function validTradeCandidate(value: unknown): value is TradeCandidate {
  return object(value) && string(value.id) && date(value.at) && string(value.item) && typeof value.player === 'string' && value.player.length <= 150
    && Number.isSafeInteger(value.quantity) && (value.quantity as number) >= 1 && (value.quantity as number) <= 1e9
    && (value.amount === null || finite(value.amount) && value.amount > 0) && (value.currency === null || isCurrency(value.currency))
    && typeof value.currencyText === 'string' && value.currencyText.length <= 100 && (value.kind === null || value.kind === 'sale' || value.kind === 'purchase')
    && ['log', 'paste', 'import'].includes(value.source as string) && (value.league === undefined || string(value.league))
    && (value.acceptedAt === undefined || date(value.acceptedAt) && Date.parse(value.acceptedAt) >= Date.parse(value.at));
}
export function collectTrades(state: FinanceState, events: readonly TradeCandidate[]): FinanceState {
  // Acceptance may arrive in a later poll. Stable IDs deduplicate the quote, but
  // must not discard new evidence for a pending quote already in the inbox.
  const updated = (state.tradeInbox ?? []).map((row) => {
    const incoming = events.find((event) => event.id === row.id && validTradeCandidate(event) && event.acceptedAt
      && event.at === row.at && event.player === row.player && event.item === row.item && event.amount === row.amount
      && event.currency === row.currency && event.kind === row.kind && event.league === row.league && event.quantity === row.quantity);
    return incoming?.acceptedAt && (!row.acceptedAt || Date.parse(incoming.acceptedAt) > Date.parse(row.acceptedAt)) ? { ...row, acceptedAt: incoming.acceptedAt } : row;
  });
  const enriched = updated.some((row, index) => row !== state.tradeInbox![index]) ? { ...state, tradeInbox: updated } : state;
  const seen = new Set([...(state.ignoredTradeIds ?? []), ...(state.tradeInbox ?? []).map((row) => row.id), ...state.entries.flatMap((row) => row.trade ? [row.trade.sourceId, `entry-${row.id}`] : [`entry-${row.id}`])]);
  const added = events.filter((row) => { if (!validTradeCandidate(row) || seen.has(row.id)) return false; seen.add(row.id); return true; });
  if (!added.length) return enriched;
  // Keep unprocessed records instead of silently evicting them when the inbox is full.
  const space = Math.max(0, 500 - (state.tradeInbox?.length ?? 0));
  return space ? { ...enriched, tradeInbox: [...enriched.tradeInbox ?? [], ...added.slice(0, space)] } : enriched;
}
export function confirmTrade(state: FinanceState, candidate: TradeCandidate, league: string,
  actual: { amount: number; currency: Currency; kind: 'sale' | 'purchase' }): FinanceState {
  if (!validTradeCandidate(candidate) || !finite(actual.amount) || actual.amount <= 0 || !isCurrency(actual.currency)
    || !['sale', 'purchase'].includes(actual.kind)) throw new Error('请核对成交方向、正数金额和通货。');
  if (!state.tradeInbox?.some((row) => row.id === candidate.id) || state.entries.some((row) => row.trade?.sourceId === candidate.id)) throw new Error('此交易已处理，请刷新列表。');
  if (candidate.league && candidate.league !== league) throw new Error('请切换到该交易所属联盟后确认。');
  const at = candidate.acceptedAt ?? candidate.at;
  let session = state.sessions.find((row) => row.league === league && Date.parse(row.startedAt) <= Date.parse(at) && (!row.endedAt || Date.parse(row.endedAt) >= Date.parse(at)));
  const sessions = [...state.sessions];
  if (!session) { session = { id: crypto.randomUUID(), league, startedAt: at, endedAt: at }; sessions.push(session); }
  return { ...state, sessions, tradeInbox: state.tradeInbox.filter((row) => row.id !== candidate.id), entries: [...state.entries, {
    id: crypto.randomUUID(), sessionId: session.id, at, kind: actual.kind, label: candidate.item, amount: actual.amount,
    currency: actual.currency, confirmed: true, trade: { sourceId: candidate.id, player: candidate.player, quantity: candidate.quantity },
  }] };
}
export function trackerReport(state: FinanceState, league: string, currency: Currency, days: number, search = '', now = Date.now()) {
  const ids = new Set(state.sessions.filter((row) => row.league === league).map((row) => row.id));
  const start = days === 1 ? new Date(new Date(now).setHours(0, 0, 0, 0)).getTime() : days ? now - days * 86400_000 : 0;
  const eligible = state.entries.filter((row) => row.confirmed && ids.has(row.sessionId) && Date.parse(row.at) >= start
    && Date.parse(row.at) <= now && `${row.label} ${row.trade?.player ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const rows = eligible.filter((row) => row.currency === currency).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const currencies = Object.keys(CURRENCIES).flatMap((key) => {
    const unit = key as Currency, entries = eligible.filter((row) => row.currency === unit);
    if (!entries.length) return [];
    const income = entries.filter((row) => row.kind === 'sale' || row.kind === 'income').reduce((sum, row) => sum + row.amount, 0);
    const expense = entries.filter((row) => row.kind === 'purchase' || row.kind === 'craft').reduce((sum, row) => sum + row.amount, 0);
    return [{ currency: unit, count: entries.length, income, expense, expenseCount: entries.filter((row) => row.kind === 'purchase' || row.kind === 'craft').length, net: income - expense }];
  });
  const income = rows.filter((row) => row.kind === 'sale' || row.kind === 'income').reduce((sum, row) => sum + row.amount, 0);
  const expense = rows.filter((row) => row.kind === 'purchase' || row.kind === 'craft').reduce((sum, row) => sum + row.amount, 0);
  const groups = new Map<string, LedgerEntry[]>();
  for (const row of rows) { const key = new Date(row.at).toLocaleDateString('zh-CN'); groups.set(key, [...groups.get(key) ?? [], row]); }
  const expenseCount = rows.filter((row) => row.kind === 'purchase' || row.kind === 'craft').length;
  const pendingPurchases = (state.tradeInbox ?? []).filter((row) => row.kind === 'purchase' && (!row.league || row.league === league)
    && (row.currency === currency || row.currency === null) && Date.parse(row.at) >= start && Date.parse(row.at) <= now
    && `${row.item} ${row.player}`.toLowerCase().includes(search.toLowerCase()));
  // A merchant-history sync and a whisper-log scan are partial sources. Zero
  // recorded purchases is not evidence of zero account spending.
  return { rows, income, expense, expenseCount, pendingPurchases, net: income - expense, groups: [...groups.entries()], currencies };
}
export function correctTradeDirection(state: FinanceState, id: string, kind: 'sale' | 'purchase'): FinanceState {
  const entry = state.entries.find((row) => row.id === id);
  if (!entry || !entry.confirmed || !['sale', 'purchase'].includes(entry.kind) || !['sale', 'purchase'].includes(kind)) throw new Error('只能更正已确认买卖记录的方向。');
  // Keep the original source ID so future syncs cannot reimport the transaction
  // or undo the user's correction. Amount and currency remain the same facts.
  return { ...state, entries: state.entries.map((row) => row.id === id ? { ...row, kind } : row) };
}
export function addLoadoutAssets(state: FinanceState, league: string, inputs: readonly { itemKey: string; label: string; quantity: number; price: number | null; currency: Currency }[], refreshPrices = false) {
  const existing = new Set(state.assets.filter((asset) => asset.league === league && asset.source?.kind === 'loadout').map((asset) => asset.source!.itemKey));
  const added = inputs.filter((input) => !existing.has(input.itemKey)).map((input): Asset => ({
    id: crypto.randomUUID(), league, label: input.label, quantity: input.quantity, price: input.price, currency: input.currency,
    source: { kind: 'loadout', itemKey: input.itemKey },
  }));
  let updated = 0;
  const assets = state.assets.map((asset) => {
    const input = refreshPrices && asset.league === league && asset.source?.kind === 'loadout' ? inputs.find((row) => row.itemKey === asset.source!.itemKey) : undefined;
    if (!input || input.price === null) return asset;
    updated++;
    return { ...asset, price: input.price, currency: input.currency };
  });
  return { state: { ...state, assets: [...assets, ...added] }, added: added.length, updated, skipped: inputs.length - added.length };
}
export function sessionReport(state: FinanceState, sessionId: string) {
  const currencies: Partial<Record<Currency, { income: number; purchase: number; craft: number; net: number }>> = {};
  const entries = state.entries.filter((entry) => entry.sessionId === sessionId);
  for (const entry of entries) {
    if (!entry.confirmed) continue;
    const row = currencies[entry.currency] ?? { income: 0, purchase: 0, craft: 0, net: 0 };
    if (entry.kind === 'purchase') row.purchase += entry.amount;
    else if (entry.kind === 'craft') row.craft += entry.amount;
    else row.income += entry.amount;
    row.net = row.income - row.purchase - row.craft;
    currencies[entry.currency] = row;
  }
  return { currencies, pending: entries.filter((entry) => !entry.confirmed).length };
}
export function takeValuation(state: FinanceState, league: string, currency: Currency, label: string, at = new Date().toISOString()): Valuation {
  return { id: crypto.randomUUID(), league, currency, label, at,
    assets: state.assets.filter((asset) => asset.league === league).map(({ id, label: name, quantity, price, currency: unit }) => ({ id, label: name, quantity, price: unit === currency ? price : null })) };
}
/** Fixed starting quantities isolate price movement from purchases, sales and new drops. */
export function compareValuations(before: Valuation, after: Valuation) {
  if (before.league !== after.league || before.currency !== after.currency) throw new Error('只能比较同联盟、同计价通货的快照。');
  if (Date.parse(after.at) <= Date.parse(before.at)) throw new Error('结束快照必须晚于起始快照。');
  const ids = new Set([...before.assets.map((asset) => asset.id), ...after.assets.map((asset) => asset.id)]);
  const rows = [...ids].map((id) => {
    const old = before.assets.find((asset) => asset.id === id), current = after.assets.find((asset) => asset.id === id);
    const quantity = old?.quantity ?? 0, quantityNow = current?.quantity ?? 0;
    // Missing marks are unknown, never zero; new assets have no baseline holdings to reprice.
    const movement = quantity === 0 ? 0 : old?.price === null || old?.price === undefined || current?.price === null || current?.price === undefined
      ? null : quantity * (current.price - old.price);
    const inventoryChange = quantityNow === quantity ? 0 : current?.price === null || current?.price === undefined ? null : (quantityNow - quantity) * current.price;
    return { id, label: current?.label ?? old!.label, quantity, quantityNow, before: old?.price ?? null, after: current?.price ?? null, movement, inventoryChange };
  });
  return { rows, knownMovement: rows.reduce((sum, row) => sum + (row.movement ?? 0), 0),
    missing: rows.filter((row) => row.movement === null).length,
    changedHoldings: rows.filter((row) => row.quantity !== row.quantityNow).length,
    currency: before.currency };
}
