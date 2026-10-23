import { useRef, useState } from 'react';
import { CURRENCIES } from './finance';
import { parseTradeCsv, previewTradeImport, suggestTradeMapping, TRADE_COLUMNS, type TradeMapping, type TradeTable } from './tradeImport';
import type { TradeCandidate } from './tradeTracking';

export default function TradeImportPanel({ league, onImport }: { league: string; onImport: (rows: TradeCandidate[], confirmed: boolean) => boolean }) {
  const [table, setTable] = useState<TradeTable>();
  const [mapping, setMapping] = useState<TradeMapping>({});
  const [direction, setDirection] = useState<'' | 'sale' | 'purchase'>('');
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewTradeImport>>>();
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const revision = useRef(0);
  function invalidate() { revision.current++; setPreview(undefined); setConfirmed(false); }
  return <section className="tt-import" aria-label="导入交易记录">
    <h3>导入已有成交记录</h3>
    <p className="wb-fine">选择交易 CSV，核对时间、方向、总金额和通货后导入。可读取本工具导出的 CSV；其他工具的 CSV 可在下方指定列。不会从报价推断成交，也不会自动连接 Overwolf。</p>
    <label>交易 CSV 文件<input type="file" accept=".csv,text/csv,text/tab-separated-values" disabled={busy} onChange={(event) => { void (async () => {
      const file = event.target.files?.[0]; invalidate(); setTable(undefined); setError('');
      if (!file) return;
      const task = revision.current;
      try {
        if (file.size > 2_000_000) throw new Error('文件不能超过 2 MB。');
        const parsed = parseTradeCsv(await file.text());
        if (task !== revision.current) return;
        setTable(parsed); setMapping(suggestTradeMapping(parsed));
      } catch (failure) { if (task === revision.current) setError(failure instanceof Error ? failure.message : 'CSV 无法读取。'); }
    })(); }} /></label>
    {table && <>
      <p>已读取 {table.rows.length} 行，尚未写入账本。没有联盟列时使用 {league}；金额是本笔交易总额，不乘物品数量。</p>
      <details open={Object.keys(mapping).length < 5}><summary>列对应与交易方向</summary><div className="tt-import-columns">{Object.entries(TRADE_COLUMNS).map(([key, label]) => <label key={key}>{label}<select aria-label={`导入列：${label}`} value={mapping[key as keyof TradeMapping] ?? ''} onChange={(event) => {
        invalidate(); const next = { ...mapping }; if (event.target.value === '') delete next[key as keyof TradeMapping]; else next[key as keyof TradeMapping] = Number(event.target.value); setMapping(next);
      }}><option value="">{['player', 'quantity', 'league', 'id'].includes(key) ? '不提供' : '请选择'}</option>{table.headers.map((header, index) => <option key={index} value={index}>{header}</option>)}</select></label>)}</div>
        <label>无方向列时整份文件为<select aria-label="导入默认交易方向" value={direction} onChange={(event) => { invalidate(); setDirection(event.target.value as typeof direction); }}><option value="">必须提供方向列</option><option value="sale">卖出收入</option><option value="purchase">买入支出</option></select></label>
      </details>
      <button type="button" className="wb-button" disabled={busy} onClick={() => { void (async () => {
        const task = ++revision.current; setBusy(true); setError(''); setPreview(undefined); setConfirmed(false);
        try { const parsed = await previewTradeImport(table, mapping, league, direction); if (task === revision.current) setPreview(parsed); }
        catch (failure) { if (task === revision.current) setError(failure instanceof Error ? failure.message : '无法解析交易。'); }
        finally { setBusy(false); }
      })(); }}>{busy ? '正在预览…' : '预览交易'}</button>
    </>}
    {preview && <>
      <p>{preview.candidates.length} 笔可导入 · {preview.warnings.length} 行需处理。重复来源会跳过。</p>
      {preview.missingIds && <p className="wb-fine">部分记录没有来源 ID，按内容及同秒序号去重；同一交易若来自不同工具，请核对是否重复。</p>}
      {preview.warnings.length > 0 && <details><summary>未导入行与原因</summary>{preview.warnings.map((warning) => <p key={warning} className="wb-fine">{warning}</p>)}</details>}
      <div className="fn-scroll"><table><thead><tr><th>时间</th><th>物品</th><th>方向</th><th>总金额</th><th>联盟</th></tr></thead><tbody>{preview.candidates.slice(0, 8).map((row) => <tr key={row.id}><td>{new Date(row.at).toLocaleString('zh-CN')}</td><td>{row.item}</td><td>{row.kind === 'sale' ? '卖出' : '买入'}</td><td>{row.amount} {row.currency && CURRENCIES[row.currency]}</td><td>{row.league}</td></tr>)}</tbody></table></div>
      <label className="tt-enable"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />这些是已完成的交易，实际金额与通货已经核对</label>
      <button type="button" className="wb-button primary" disabled={!preview.candidates.length || busy} onClick={() => {
        if (onImport(preview.candidates, confirmed)) { setTable(undefined); setPreview(undefined); setConfirmed(false); }
      }}>{confirmed ? '确认并导入已成交记录' : '加入待确认列表'}</button>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
