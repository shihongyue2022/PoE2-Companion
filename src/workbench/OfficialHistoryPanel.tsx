import { useEffect, useRef, useState } from 'react';
import { historyBridge, parseOfficialHistory } from './officialHistory';
import { collectTrades, type FinanceState } from './finance';
import { applyTradeImport } from './tradeImport';
import Icon from './WorkbenchIcon';

export default function OfficialHistoryPanel({ league, state, save, active = true }: { league: string; state: FinanceState; save: (next: FinanceState, message?: string) => boolean; active?: boolean }) {
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [automatic, setAutomatic] = useState(false), [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const report = state.officialHistory?.[league];
  const [directory, setDirectory] = useState('');
  const current = useRef({ league, state, save }), task = useRef<AbortController | null>(null), locked = useRef(false);
  useEffect(() => { current.current = { league, state, save }; }, [league, state, save]);
  useEffect(() => { const controller = new AbortController(); void historyBridge('ping', league, controller.signal).then((value) => setReady(value.ready === true)).catch(() => {}); return () => controller.abort(); }, [league]);
  useEffect(() => () => task.current?.abort(), []);
  useEffect(() => { if (!retry) return; const timer = setInterval(() => setRetry((old) => Math.max(0, old - 1)), 1000); return () => clearInterval(timer); }, [retry]);
  async function sync(action: 'open' | 'sync', passive = false) {
    if (locked.current || action === 'sync' && retry) return;
    const controller = new AbortController(); task.current?.abort(); task.current = controller; locked.current = true; setBusy(true); setNotice('');
    const expectedLeague = current.current.league;
    try {
      const value = await historyBridge(action, expectedLeague, controller.signal, passive);
      if (controller.signal.aborted || expectedLeague !== current.current.league) return;
      setReady(true);
      if (typeof value.retryAfter === 'number') setRetry(Math.min(86400, Math.max(1, Math.ceil(value.retryAfter))));
      if (typeof value.error === 'string') { setNotice(value.error); return; }
      if (action === 'open') return;
      const parsed = await parseOfficialHistory(value.payload, expectedLeague);
      if (controller.signal.aborted || expectedLeague !== current.current.league) return;
      const known = parsed.candidates.filter((row) => row.currency !== null), unknown = parsed.candidates.filter((row) => row.currency === null);
      const live = current.current;
      const imported = applyTradeImport(live.state, known, true, expectedLeague), next = collectTrades(imported.state, unknown);
      if (!live.save({ ...next, officialHistory: { ...next.officialHistory, [expectedLeague]: parsed.report } })) throw new Error('同步已读取，但本地账本未保存，请先处理账本错误后重试。');
      setRetry(60);
      setNotice(`已同步 ${imported.added} 笔新成交 · 重复 ${imported.duplicates} 笔${unknown.length ? ` · ${unknown.length} 笔通货待确认` : ''}。官网未返回的历史不会补造。`);
    } catch (error) { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : '同步失败，未写入账本。'); }
    finally { if (!controller.signal.aborted) setBusy(false); locked.current = false; }
  }
  const syncRef = useRef(sync); useEffect(() => { syncRef.current = sync; });
  useEffect(() => { if (!ready || !automatic || !active) return; const timer = setInterval(() => { if (document.visibilityState === 'visible') void syncRef.current('sync', true); }, 120000); return () => clearInterval(timer); }, [ready, automatic, active]);
  async function setup() {
    setNotice('');
    try {
      const response = await fetch('/api/workbench/history/setup', { method: 'POST', signal: AbortSignal.timeout(10000) });
      const value: unknown = await response.json();
      if (!value || typeof value !== 'object' || !('ok' in value) || value.ok !== true || !('directory' in value) || typeof value.directory !== 'string') throw new Error('无法打开安装入口。请在扩展管理页手动加载项目下 browser-extension/official-history 目录。');
      setDirectory(value.directory); setNotice('已打开扩展目录与扩展管理页。开启开发者模式 → 加载已解压的扩展程序，选择这个目录。完成后刷新工坊和官网历史页。');
    } catch (error) { setNotice(error instanceof Error ? error.message : '请手动加载同步扩展。'); }
  }
  return <section className="tt-official wb-card" aria-label="官方成交同步">
    <div className="wb-section-head"><div><h3><Icon name="refresh" /> 官方成交同步</h3><p className="wb-fine">官网登录 → 同步近期成交 → 去重计入收入／支出</p></div><span className="wb-tag">{ready ? '浏览器同步桥已连接' : '首次需加载同步扩展'}</span></div>
    <div className="wb-actions"><button type="button" className="wb-button" disabled={busy} onClick={() => { void sync('open'); }}>① 打开官网并登录</button><button type="button" className="wb-button primary" disabled={!ready || busy || retry > 0} onClick={() => { void sync('sync'); }}>{busy ? '同步中…' : retry ? `${retry} 秒后可同步` : '② 同步官方成交'}</button>{ready && <label className="tt-auto-sync"><input type="checkbox" checked={automatic} onChange={(event) => setAutomatic(event.target.checked)} />本页打开时每 2 分钟同步</label>}</div>
    {!ready && <details open><summary>安装同步桥（只需一次）</summary><button type="button" className="wb-button" onClick={() => { void setup(); }}><Icon name="external" />打开扩展安装入口与目录</button>{directory && <p className="wb-fine"><code>{directory}</code></p>}<ol><li>Chrome／Edge 扩展管理页 → 开发者模式 → 加载已解压的扩展程序。</li><li>选择项目下 <code>browser-extension/official-history</code> 目录。</li><li>刷新工坊和官网历史页，再点击上面的同步按钮。</li></ol><p className="wb-fine">登录由官网完成，扩展不读取或保存 Cookie、密码。仅转发这次历史接口返回的成交字段。</p><a className="wb-link" href="https://www.pathofexile.com/trade2/history" target="_blank" rel="noreferrer">打开官方成交历史 ↗</a></details>}
    {notice && <p role="status" className="lo-notice">{notice}</p>}
    {report && <details open><summary>本次实际读取范围 · {report.count} 条</summary><p className="wb-fine">{report.firstAt ? `${new Date(report.firstAt).toLocaleString('zh-CN')} ～ ${new Date(report.lastAt!).toLocaleString('zh-CN')}` : '没有可读成交'} · 卖出 {report.sales} · 买入 {report.purchases} · 跳过无效／非成交 {report.skipped} 条。</p><p className="wb-fine">{report.purchases ? '本次返回了显式标记的买入；不保证所有买入齐全。' : '本次未读取到买入，不能据此认为支出为零。'}{report.hasMore ? '接口提示仍有更多记录；当前仅同步已返回内容。' : '官网未承诺固定历史天数；此处只代表这次返回的时间窗口。'}密语交易仍从日志单独确认。</p>{report.missingIds > 0 && <p className="wb-inline-warning">{report.missingIds} 条没有来源 ID，按时间与物品金额去重；完全相同的无 ID 成交无法区分。</p>}</details>}
    <p className="wb-fine">已知接口以近期商人卖出记录为主。同步结果不是完整账户流水，净收支只涵盖已读且已确认的交易；本地记录会逐次积累。</p>
  </section>;
}
