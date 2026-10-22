import { useEffect, useState } from 'react';
import { PriceEstimate } from './PriceEstimate';
import { readTradeMemory, rememberTrade, removeTradeMemory, clearTradeHistory, tradeMemoryUrl,
  TRADE_MEMORY_EVENT, TRADE_MEMORY_KEY, type TradeMemoryEntry } from './tradeMemory';

export default function TradeMemoryPanel({ league, onOpenItem }: { league: string; onOpenItem: (raw: string) => void }) {
  const [entries, setEntries] = useState(readTradeMemory);
  const [view, setView] = useState<'recent' | 'saved'>('recent');
  const [allLeagues, setAllLeagues] = useState(false);
  const [folder, setFolder] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const update = () => setEntries(readTradeMemory());
    const storage = (event: StorageEvent) => { if (event.key === TRADE_MEMORY_KEY || event.key === null) update(); };
    window.addEventListener(TRADE_MEMORY_EVENT, update); window.addEventListener('storage', storage);
    return () => { window.removeEventListener(TRADE_MEMORY_EVENT, update); window.removeEventListener('storage', storage); };
  }, []);
  const selected = entries.find((entry) => entry.id === selectedId);
  const folders = [...new Set(entries.filter((entry) => entry.saved).map((entry) => entry.folder).filter(Boolean))];
  const filtered = entries.filter((entry) => (allLeagues || entry.league === league) && (view === 'recent' ? !!entry.observation : entry.saved)
    && (!folder || entry.folder === folder)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  function show(entry: TradeMemoryEntry) { setSelectedId(entry.id); }
  return <details className="wb-trade-memory"><summary>查价历史与收藏 · {entries.filter((entry) => entry.observation).length} 条记录 · {entries.filter((entry) => entry.saved).length} 条收藏</summary>
    <p className="wb-fine">仅保存在本浏览器。历史保留最近查询结果摘要；重新打开保留原赛季、词缀、T1 门槛、权重及预算，不自动请求市场。历史价格是当时的挂牌参考。</p>
    <div className="wb-actions">
      <button className="wb-button" aria-pressed={view === 'recent'} onClick={() => setView('recent')}>最近查价</button>
      <button className="wb-button" aria-pressed={view === 'saved'} onClick={() => setView('saved')}>搜索收藏</button>
      <label className="wb-check"><input type="checkbox" checked={allLeagues} onChange={(e) => setAllLeagues(e.target.checked)} />显示其他赛季</label>
      <label className="wb-form-label">收藏分组<select aria-label="筛选收藏分组" value={folder} onChange={(e) => setFolder(e.target.value)}><option value="">全部分组</option>{folders.map((value) => <option key={value}>{value}</option>)}</select></label>
      <button className="wb-text-button" onClick={() => setMessage(clearTradeHistory() || '已清除未收藏的历史，收藏已保留。')}>清除未收藏历史</button>
    </div>
    {message && <p role="status">{message}</p>}
    {!filtered.length && <p>暂无{view === 'saved' ? '收藏' : '查询记录'}。可先在下方查价，或收藏调好的条件。</p>}
    <div className="wb-search-history-list">{filtered.map((entry) => <article className="wb-card" key={entry.id}>
      <strong>{entry.saved ? '★ ' : ''}{entry.title}</strong><p className="wb-fine">{entry.league}{entry.folder ? ` · ${entry.folder}` : ''} · {new Date(entry.updatedAt).toLocaleString('zh-CN', { hour12: false })}</p>
      {entry.observation && <p className={entry.observation.failed ? 'wb-inline-warning' : ''}>{entry.observation.failed ? '上次查询未成功：' : '历史挂牌参考：'}{entry.observation.message}</p>}
      <div className="wb-actions"><button className="wb-button" onClick={() => show(entry)}>打开原条件</button>
        <a className="wb-button" href={tradeMemoryUrl(entry)} target="_blank" rel="noreferrer">官网搜索</a>
        {!entry.saved && <button className="wb-text-button" onClick={() => setMessage(rememberTrade(entry, { save: true }) || '已加入收藏。')}>加入收藏</button>}
        <button className="wb-text-button" onClick={() => setMessage(removeTradeMemory(entry.id))}>删除记录</button></div>
    </article>)}</div>
    {selected && <section className="wb-card" aria-label="已保存的搜索条件">
      <div className="wb-row wb-wrap"><h3>{selected.title} · 原条件</h3><button className="wb-text-button" onClick={() => setSelectedId('')}>收起原条件</button></div>
      <p>{selected.league} · 原查询完整保留。可点击下方按钮更新挂牌参考。</p>
      {selected.observation && <p className="wb-fine">上次查询：{new Date(selected.observation.at).toLocaleString('zh-CN', { hour12: false })} · {selected.observation.detail}</p>}
      {selected.raw && <button className="wb-button" onClick={() => { onOpenItem(selected.raw!); setSelectedId(''); }}>重新载入原物品并调整条件</button>}
      {selected.raw && <p className="wb-fine">重新载入从物品默认条件开始；本收藏的完整原条件保持在这里。</p>}
      <details><summary>查看保存的完整查询</summary><pre>{JSON.stringify(selected.query, null, 2)}</pre></details>
      {'statgroup.0' in selected.query.sort ? <p>这条收藏按综合权重排序，请使用“官网搜索”查看原权重和预算下的候选；加权候选价格不作为低价估值。</p>
        : <PriceEstimate query={selected.query} league={selected.league} url={tradeMemoryUrl(selected)} memoryTitle={selected.title} itemRaw={selected.raw}
          emptyMessage="当前保存条件没有找到挂单，原条件保持不变。" />}
    </section>}
  </details>;
}
