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
}
export interface Asset { id: string; league: string; label: string; quantity: number; price: number | null; currency: Currency }
export interface Valuation {
  id: string; league: string; at: string; label: string; currency: Currency;
  assets: { id: string; label: string; quantity: number; price: number | null }[];
}
export interface FinanceState { version: 1; sessions: PlaySession[]; entries: LedgerEntry[]; assets: Asset[]; valuations: Valuation[] }
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
    const session = sessions.find((session) => session.id === row.sessionId)!;
    if (Date.parse(row.at) < Date.parse(session.startedAt) || session.endedAt && Date.parse(row.at) > Date.parse(session.endedAt)) throw new Error('收支记录时间超出所属场次。');
  }
  for (const row of value.assets) if (!object(row) || !string(row.league) || !isCurrency(row.currency) || !mark(row)) throw new Error('资产记录不正确。');
  for (const row of value.valuations) if (!object(row) || !string(row.id) || !string(row.league) || !string(row.label)
    || !date(row.at) || !isCurrency(row.currency) || !Array.isArray(row.assets) || row.assets.length > 500
    || !row.assets.every(mark) || !uniqueIds(row.assets)) throw new Error('估值快照不正确。');
  const state = value as unknown as FinanceState;
  if (![state.sessions, state.entries, state.assets, state.valuations].every(uniqueIds)) throw new Error('记录 ID 重复，已拒绝导入以避免重复记账。');
  return state;
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
