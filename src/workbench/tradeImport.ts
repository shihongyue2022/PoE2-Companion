import { collectTrades, confirmTrade, CURRENCIES, isCurrency, type Currency, type FinanceState } from './finance';
import { tradeCurrency, type TradeCandidate } from './tradeTracking';

export const TRADE_COLUMNS = {
  at: '成交时间', item: '物品', amount: '总金额', currency: '通货', kind: '买入／卖出',
  player: '玩家', quantity: '物品数量', league: '联盟', id: '来源交易 ID',
} as const;
export type TradeColumn = keyof typeof TRADE_COLUMNS;
export type TradeMapping = Partial<Record<TradeColumn, number>>;
export interface TradeTable { headers: string[]; rows: string[][] }
const aliases: Record<TradeColumn, string[]> = {
  at: ['时间', '時間', '成交时间', '成交時間', 'at', 'timestamp', 'date', 'datetime', 'time'],
  item: ['物品', '物品名称', '物品名稱', '项目', '項目', 'item', 'itemname', 'label', 'name'],
  amount: ['金额', '金額', '总金额', '總金額', '数量', '數量', 'amount', 'price', 'total', 'totalprice'],
  currency: ['通货', '通貨', '币种', '幣種', 'currency', 'currencytype'],
  kind: ['类型', '類型', '方向', '买入卖出', '買入賣出', 'type', 'kind', 'direction'],
  player: ['玩家', '对方', '對方', 'player', 'playername', 'account', 'character'],
  quantity: ['物品数量', '物品數量', 'quantity', 'itemquantity', 'stacksize'],
  league: ['联盟', '聯盟', '赛季', '賽季', 'league'],
  id: ['交易id', '来源交易id', '來源交易id', 'id', 'sourceid', 'tradeid', 'transactionid'],
};
const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s_/／-]/g, '');
/** RFC 4180 quoting, bounded input and cell sizes; no evaluation of spreadsheet formulas. */
export function parseTradeCsv(input: string): TradeTable {
  if (input.length > 2_000_000) throw new Error('交易 CSV 不能超过 2 MB。');
  const text = input.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const separator = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0]!;
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false, closed = false;
  const pushCell = () => { row.push(cell.trim()); cell = ''; closed = false; if (row.length > 50) throw new Error('CSV 列数超过 50。'); };
  const pushRow = () => { pushCell(); if (row.some(Boolean)) rows.push(row); row = []; if (rows.length > 1001) throw new Error('每次最多导入 1000 笔，请分批导出。'); };
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === '"' && quoted) {
      if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; }
    } else if (char === '"' && !cell && !closed) quoted = true;
    else if (!quoted && char === separator) pushCell();
    else if (!quoted && (char === '\r' || char === '\n')) { if (char === '\r' && text[i + 1] === '\n') i++; pushRow(); }
    else if (!quoted && closed && char.trim()) throw new Error('CSV 引号格式不正确。');
    else cell += char;
    if (cell.length > 16_000) throw new Error('CSV 单元格过长。');
  }
  if (quoted) throw new Error('CSV 引号没有闭合。');
  if (cell || row.length || closed) pushRow();
  const headers = rows.shift();
  if (!headers?.length || !rows.length) throw new Error('没有可读取的交易数据，请保留 CSV 表头。');
  if (new Set(headers.map(normalize)).size !== headers.length) throw new Error('CSV 存在重复表头，请重命名后导入。');
  return { headers, rows };
}
export function suggestTradeMapping(table: TradeTable): TradeMapping {
  return Object.fromEntries(Object.entries(aliases).flatMap(([key, names]) => {
    const index = table.headers.findIndex((header) => names.includes(normalize(header)));
    return index < 0 ? [] : [[key, index]];
  }));
}
const currencyOf = (value: string): Currency | null => isCurrency(value) ? value : tradeCurrency(value)
  ?? (Object.entries(CURRENCIES).find(([, label]) => label === value.trim())?.[0] as Currency | undefined) ?? null;
export function importTradeTime(value: string): string | undefined {
  const iso = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/i.test(value);
  const local = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d\d)(?::(\d\d))?$/.exec(value);
  if (iso && Number.isFinite(Date.parse(value))) {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number) as [number, number, number];
    const calendar = new Date(Date.UTC(year, month - 1, day));
    if (calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day) return new Date(value).toISOString();
  }
  if (local) {
    const [year, month, day, hour, minute, second] = local.slice(1).map((part) => Number(part ?? 0)) as [number, number, number, number, number, number];
    const date = new Date(year, month - 1, day, hour, minute, second);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && date.getHours() === hour && date.getMinutes() === minute && date.getSeconds() === second) return date.toISOString();
  }
  return undefined;
}
export async function previewTradeImport(table: TradeTable, mapping: TradeMapping, league: string, defaultKind: '' | 'sale' | 'purchase' = '') {
  for (const key of ['at', 'item', 'amount', 'currency'] as const) if (mapping[key] === undefined) throw new Error(`请选择“${TRADE_COLUMNS[key]}”对应的列。`);
  if (mapping.kind === undefined && !defaultKind) throw new Error('请选择买入／卖出列，或指定整份文件的交易方向。');
  const assigned = Object.values(mapping).filter((index) => index !== undefined);
  if (new Set(assigned).size !== assigned.length) throw new Error('同一列不能同时作为两个字段。');
  const candidates: TradeCandidate[] = [], warnings: string[] = [], occurrence = new Map<string, number>();
  const text = (row: string[], key: TradeColumn) => {
    const value = row[mapping[key] ?? -1] ?? '';
    // Undo only this workbench's spreadsheet-safe text escape.
    return /^'[=+@-]/.test(value) ? value.slice(1) : value;
  };
  for (const [index, row] of table.rows.entries()) {
    const at = importTradeTime(text(row, 'at')), item = text(row, 'item'), rawKind = text(row, 'kind').toLowerCase();
    const kind = mapping.kind === undefined ? defaultKind : /^(?:sale|sell|sold|出售收入|卖出|賣出|出售)$/.test(rawKind) ? 'sale' : /^(?:purchase|buy|bought|购买支出|购买|購買|买入|買入)$/.test(rawKind) ? 'purchase' : '';
    const amountText = text(row, 'amount'), amount = /^\d+(?:,\d{3})*(?:\.\d+)?$/.test(amountText) ? Number(amountText.replace(/,/g, '')) : NaN;
    const currency = currencyOf(text(row, 'currency')), quantity = mapping.quantity === undefined ? 1 : Number(text(row, 'quantity'));
    const player = text(row, 'player'), realm = mapping.league === undefined ? league : text(row, 'league');
    const externalId = text(row, 'id');
    const reason = !at ? '时间格式无法确认，请使用 ISO 时间或 年/月/日 时:分:秒' : Date.parse(at) > Date.now() + 60_000 ? '时间在未来' : !item || item.length > 300 ? '物品名称为空或过长'
      : !kind ? '交易方向无法确认' : !Number.isFinite(amount) || amount <= 0 || amount > 1e12 ? '总金额必须为正数'
      : !currency ? '通货尚未识别' : !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1e9 ? '物品数量无效'
      : !realm || realm.length > 150 || player.length > 150 || externalId.length > 300 ? '联盟、玩家或来源 ID 无效' : '';
    if (reason) { warnings.push(`第 ${index + 2} 行：${reason}，未导入。`); continue; }
    const facts = JSON.stringify([realm, at, player, item, kind, amount, currency, quantity]);
    const count = occurrence.get(facts) ?? 0; occurrence.set(facts, count + 1);
    const identity = externalId ? JSON.stringify([realm, externalId]) : JSON.stringify([facts, count]);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
    const id = externalId && /^(?:log|paste|import|entry)-[a-zA-Z0-9-]{1,100}$/.test(externalId) ? externalId : `import-${Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('')}`;
    candidates.push({ id, at: at!, item, player, kind: kind as 'sale' | 'purchase', amount, currency, currencyText: text(row, 'currency'), quantity, league: realm, source: 'import' });
  }
  if (new Set(candidates.map((row) => row.id)).size !== candidates.length) throw new Error('来源交易 ID 重复，请核对导出文件。');
  return { candidates, warnings, missingIds: mapping.id === undefined || table.rows.some((row) => !text(row, 'id')) };
}

export function applyTradeImport(state: FinanceState, candidates: readonly TradeCandidate[], confirmed: boolean, league: string) {
  const seen = new Set([...(state.tradeInbox ?? []).map((row) => row.id), ...(state.ignoredTradeIds ?? []), ...state.entries.flatMap((row) => row.trade ? [row.trade.sourceId, `entry-${row.id}`] : [`entry-${row.id}`])]);
  const fresh = candidates.filter((row) => !seen.has(row.id));
  if (!confirmed && fresh.length + (state.tradeInbox?.length ?? 0) > 500) throw new Error('待确认列表最多 500 条，请先处理现有线索，或分批导入。没有写入本次文件。');
  let next = state;
  for (const candidate of fresh) {
    if (!candidate.kind || !candidate.currency || !candidate.amount) throw new Error('导入记录缺少方向、金额或通货，请重新预览。');
    next = collectTrades(next, [candidate]);
    if (confirmed) next = confirmTrade(next, candidate, candidate.league ?? league, { kind: candidate.kind, amount: candidate.amount, currency: candidate.currency });
  }
  return { state: next, added: fresh.length, duplicates: candidates.length - fresh.length };
}
