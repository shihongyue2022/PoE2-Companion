import { useCallback, useEffect, useRef, useState } from 'react';
import { CURRENCIES, collectTrades, confirmTrade, isCurrency, trackerReport, validTradeCandidate, type Currency, type FinanceState, ENTRY_LABELS } from './finance';
import { parseTradeMessage, type TradeCandidate, type TradeLogSummary } from './tradeTracking';
import Icon, { IconButton } from './WorkbenchIcon';
import OfficialCurrencyIcon from './OfficialCurrencyIcon';

const format = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
function Unit({ value }: { value: Currency }) { return <span className="tt-unit"><OfficialCurrencyIcon currencyId={value === 'exalted' ? 'exalt' : value} label={CURRENCIES[value]} />{CURRENCIES[value]}</span>; }
function CurrencySelect({ value, onChange, label }: { value: Currency | ''; onChange: (value: Currency) => void; label: string }) {
  return <select aria-label={label} value={value} onChange={(event) => { if (isCurrency(event.target.value)) onChange(event.target.value); }}>
    {!value && <option value="" disabled>选择通货</option>}{Object.entries(CURRENCIES).map(([id, text]) => <option key={id} value={id}>{text}</option>)}
  </select>;
}
function PendingTrade({ trade, onConfirm, onIgnore, disabled }: { trade: TradeCandidate; onConfirm: (actual: { amount: number; currency: Currency; kind: 'sale' | 'purchase' }) => void; onIgnore: () => void; disabled: boolean }) {
  const [amount, setAmount] = useState(String(trade.amount ?? '')), [currency, setCurrency] = useState<Currency | ''>(trade.currency ?? '');
  const [kind, setKind] = useState(trade.kind ?? '');
  return <div className="tt-pending-row">
    <div><strong>{trade.quantity > 1 ? `${trade.quantity} × ` : ''}{trade.item}</strong><small>{trade.player || '玩家待核对'} · {new Date(trade.at).toLocaleString('zh-CN')}{trade.league && ` · ${trade.league}`}</small>
      {trade.acceptedAt && <small>日志出现接受交易提示，仍需核对实际交付。</small>}{!trade.currency && <small>原通货：{trade.currencyText}，请核对币种。</small>}</div>
    <select aria-label={`${trade.item}成交方向`} value={kind} onChange={(event) => setKind(event.target.value)}><option value="" disabled>买入 / 卖出</option><option value="sale">卖出</option><option value="purchase">买入</option></select>
    <input aria-label={`${trade.item}实际成交数量`} type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} />
    <CurrencySelect label={`${trade.item}实际成交通货`} value={currency} onChange={setCurrency} />
    <button type="button" className="wb-button primary" disabled={disabled || !currency || !kind || !Number.isFinite(Number(amount)) || Number(amount) <= 0} onClick={() => { if (currency && (kind === 'sale' || kind === 'purchase')) onConfirm({ amount: Number(amount), currency, kind }); }}><Icon name="check" size={16} />确认成交</button>
    <IconButton icon="close" label={`忽略${trade.item}交易线索`} onClick={onIgnore} />
  </div>;
}
export default function TradeTracker({ state, league, save, onError, onManual }: {
  state: FinanceState; league: string; save: (next: FinanceState, message?: string) => boolean; onError: (message: string) => void; onManual: () => void;
}) {
  const [currency, setCurrency] = useState<Currency>('exalted'), [days, setDays] = useState(30), [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false), [status, setStatus] = useState('尚未读取游戏日志'), [paste, setPaste] = useState(''), [showPaste, setShowPaste] = useState(false);
  const inflight = useRef(false), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const latest = useRef({ state, save });
  useEffect(() => { latest.current = { state, save }; }, [state, save]);
  const refresh = useCallback(async (history = false) => {
    if (inflight.current) return;
    inflight.current = true; setBusy(true);
    try {
      const response = await fetch(`/api/workbench/trade-log${history ? '?history=1' : ''}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('无法读取本地日志，请确认工坊后台服务已启动。');
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || !('events' in data) || !Array.isArray(data.events) || data.events.length > 500 || !data.events.every(validTradeCandidate)) throw new Error('日志摘要格式不正确。');
      if (!mounted.current) return;
      const summary = data as TradeLogSummary;
      const current = latest.current;
      const next = collectTrades(current.state, summary.events);
      if (next !== current.state) current.save(next);
      setStatus(summary.found ? `${summary.source ?? '游戏日志'} · ${summary.events.length} 条可读交易线索${summary.warning ? ` · ${summary.warning}` : ''}` : summary.warning ?? '没有找到游戏日志');
    } catch (reason) { if (mounted.current) setStatus(reason instanceof Error ? reason.message : '读取失败，可手动粘贴密语。'); }
    finally { inflight.current = false; if (mounted.current) setBusy(false); }
  }, []);
  useEffect(() => {
    if (!state.tradeEnabled) return;
    const first = setTimeout(() => { void refresh(); }, 0);
    const timer = setInterval(() => { void refresh(); }, 10000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [state.tradeEnabled, refresh]);
  const report = trackerReport(state, league, currency, days, search);
  const inbox = (state.tradeInbox ?? []).filter((row) => !row.league || row.league === league);
  const other = (state.tradeInbox?.length ?? 0) - inbox.length;
  function exportCsv() {
    const cell = (value: string | number) => `"${String(value).replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const rows = [['时间', '物品', '玩家', '类型', '数量', '通货'], ...report.rows.map((row) => [row.at, row.label, row.trade?.player ?? '', ENTRY_LABELS[row.kind], row.amount, CURRENCIES[row.currency]])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'poe2-trades.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="tt-dashboard" aria-label="交易追踪器">
    <div className="tt-heading"><div><h2>交易追踪器</h2><p>{league} · 收入与支出</p></div><div className="tt-filters"><CurrencySelect label="交易统计通货" value={currency} onChange={setCurrency} /><select aria-label="交易统计时间" value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={1}>今天</option><option value={7}>最近 7 天</option><option value={30}>最近 30 天</option><option value={0}>全部时间</option></select></div></div>
    <div className="tt-cards">{([['总收入', report.income, 'positive'], ['总支出', report.expense, 'negative'], ['净收支', report.net, report.net >= 0 ? 'positive' : 'negative']] as const).map(([label, value, color]) => <div className="tt-card" key={label}><span>{label}</span><strong className={color}>{format(value)}</strong><Unit value={currency} /></div>)}</div>
    <div className="tt-toolbar"><label className="tt-search"><Icon name="search" size={17} /><input aria-label="搜索交易记录" placeholder="搜索物品或玩家" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="tt-enable"><input type="checkbox" checked={Boolean(state.tradeEnabled)} onChange={(event) => save({ ...state, tradeEnabled: event.target.checked })} />自动读取交易线索</label>
      <IconButton icon="refresh" label="读取最近 30 天日志" disabled={busy} onClick={() => { void refresh(true); }} /><IconButton icon="paste" label="粘贴交易密语" aria-expanded={showPaste} onClick={() => setShowPaste(!showPaste)} /><IconButton icon="plus" label="手动添加收支" onClick={onManual} /><IconButton icon="download" label="导出当前筛选交易 CSV" disabled={!report.rows.length} onClick={exportCsv} />
    </div>
    <p className="wb-fine tt-status" role="status">{busy ? '正在读取交易线索…' : status}{(state.tradeInbox?.length ?? 0) >= 500 ? ' · 待确认列表已满，请先处理现有线索，再读取新记录。' : ''}</p>
    {showPaste && <div className="tt-paste"><textarea aria-label="交易密语文字" maxLength={16000} value={paste} onChange={(event) => setPaste(event.target.value)} rows={3} placeholder="粘贴官方交易密语；带 @來自 / @From 可识别出售方向。" /><button type="button" className="wb-button" disabled={!paste.trim()} onClick={() => {
      const candidate = parseTradeMessage(paste, { id: `paste-${crypto.randomUUID()}`, source: 'paste' });
      if (!candidate) { onError('未识别到官方买卖密语，请保留物品、报价、通货和联盟。'); return; }
      if (save(collectTrades(state, [candidate]), '已加入待确认，请核对实际成交金额。')) { setPaste(''); setShowPaste(false); }
    }}>识别交易</button></div>}
    <details className="tt-inbox" open={inbox.length > 0}><summary>待确认交易 <span className="wb-count">{inbox.length}</span>{other > 0 && <small> · 另有 {other} 条属于其他联盟</small>}</summary><p className="wb-fine">密语是报价线索，不代表已经成交。按实际交付核对后确认；自动读取只在工坊网页打开时运行。</p>
      {inbox.map((row) => <PendingTrade key={row.id} trade={row} disabled={busy} onConfirm={(actual) => { try { save(confirmTrade(state, row, league, actual), '已计入成交记录。'); } catch (reason) { onError(reason instanceof Error ? reason.message : '未能确认。'); } }} onIgnore={() => save({ ...state, tradeInbox: state.tradeInbox?.filter((entry) => entry.id !== row.id), ignoredTradeIds: [...state.ignoredTradeIds ?? [], row.id] })} />)}
      {!inbox.length && <p className="tt-empty">暂无待确认交易。开启自动读取，或粘贴官方交易密语。</p>}
    </details>
    <div className="tt-records"><div className="tt-record-heading"><h3>交易记录</h3><span>{report.rows.length} 笔 · {CURRENCIES[currency]}</span></div>
      {report.groups.map(([day, entries], index) => { const income = entries.filter((row) => row.kind === 'sale' || row.kind === 'income').reduce((n, row) => n + row.amount, 0); const expense = entries.filter((row) => row.kind === 'purchase' || row.kind === 'craft').reduce((n, row) => n + row.amount, 0);
        return <details className="tt-day" key={day} open={index === 0}><summary><strong>{day}</strong><span>{entries.length} 笔</span><span className="positive">+{format(income)}</span><span className="negative">−{format(expense)}</span><b>净额 {format(income - expense)}</b></summary>
          <div className="fn-scroll"><table><thead><tr><th>物品 / 项目</th><th>玩家</th><th>类型</th><th>金额</th><th>时间</th><th>操作</th></tr></thead><tbody>{entries.map((row) => <tr key={row.id}><td>{row.trade && row.trade.quantity > 1 ? `${row.trade.quantity} × ` : ''}{row.label}</td><td>{row.trade?.player || '—'}</td><td>{ENTRY_LABELS[row.kind]}</td><td className={row.kind === 'sale' || row.kind === 'income' ? 'positive' : 'negative'}>{row.kind === 'sale' || row.kind === 'income' ? '+' : '−'}{format(row.amount)}</td><td>{new Date(row.at).toLocaleTimeString('zh-CN')}</td><td><IconButton icon="undo" label={`撤回${row.label}成交确认`} onClick={() => save({ ...state, entries: state.entries.map((entry) => entry.id === row.id ? { ...entry, confirmed: false } : entry) }, '已撤回确认，可在场次记账中重新确认。')} /></td></tr>)}</tbody></table></div></details>;
      })}
      {!report.rows.length && <div className="tt-empty"><Icon name="ledger" size={32} /><p>当前筛选下还没有已确认记录。</p><small>先确认一笔交易，或展开下方手动记账。</small></div>}
    </div><p className="wb-fine">按所选通货统计，不跨币种相加。净收支为已确认收入减支出；持有资产的价格涨跌在下方独立查看。</p>
  </section>;
}
