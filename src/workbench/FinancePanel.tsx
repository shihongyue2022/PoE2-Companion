import { useEffect, useRef, useState } from 'react';
import { addLoadoutAssets, compareValuations, CURRENCIES, emptyFinance, ENTRY_LABELS, FINANCE_KEY, isCurrency, readFinance, sessionReport, takeValuation,
  type Asset, type Currency, type EntryKind, type FinanceState } from './finance';
import './finance.css';
import TradeTracker from './TradeTracker';
import { useSavedLoadout } from './loadoutStore';
import { loadoutAssetInputs } from './loadoutIntegration';

const format = (value: number | null) => value === null ? '未估值' : value.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
const timestamp = (value: string) => new Date(value).toLocaleString('zh-CN');
function loadSaved(): { state: FinanceState; error: string; raw: string } {
  let saved = '';
  try {
    saved = localStorage.getItem(FINANCE_KEY) ?? '';
    return { state: saved ? readFinance(saved) : emptyFinance(), error: '', raw: saved };
  } catch { return { state: emptyFinance(), error: '本地账本无法读取，暂未覆盖原记录。请先检查或恢复备份。', raw: saved }; }
}
function CurrencyInput({ value, onChange, label }: { value: Currency; onChange: (value: Currency) => void; label: string }) {
  return <select aria-label={label} value={value} onChange={(event) => { if (isCurrency(event.target.value)) onChange(event.target.value); }}>{Object.entries(CURRENCIES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select>;
}

export default function FinancePanel({ league, active: visible = true }: { league: string; active?: boolean }) {
  const loadout = useSavedLoadout();
  const [addingEquipment, setAddingEquipment] = useState(false);
  const [refreshEquipmentPrices, setRefreshEquipmentPrices] = useState(false);
  const [saved] = useState(loadSaved); const [state, setState] = useState(saved.state);
  const [unreadable, setUnreadable] = useState(Boolean(saved.error));
  const [error, setError] = useState(saved.error); const [notice, setNotice] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [kind, setKind] = useState<EntryKind>('sale'); const [label, setLabel] = useState('');
  const [amount, setAmount] = useState(''); const [currency, setCurrency] = useState<Currency>('exalted');
  const [assetName, setAssetName] = useState(''); const [assetQuantity, setAssetQuantity] = useState('1');
  const [valuationCurrency, setValuationCurrency] = useState<Currency>('exalted');
  const [snapshotLabel, setSnapshotLabel] = useState('下线时');
  const [beforeId, setBeforeId] = useState(''); const [afterId, setAfterId] = useState('');
  const [backup, setBackup] = useState(saved.error ? saved.raw : '');
  const manual = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const receive = (event: StorageEvent) => {
      if (event.key !== FINANCE_KEY) return;
      try {
        setState(event.newValue ? readFinance(event.newValue) : emptyFinance()); setUnreadable(false);
        setNotice('账本已同步另一工坊页面的修改。');
      } catch { setError('另一页面写入的账本无法读取，请先检查备份。'); setUnreadable(true); }
    };
    window.addEventListener('storage', receive);
    return () => window.removeEventListener('storage', receive);
  }, []);
  const active = state.sessions.find((session) => !session.endedAt);
  const sessions = state.sessions.filter((session) => session.league === league);
  const selected = sessions.find((session) => session.id === selectedSession) ?? sessions.at(-1);
  const report = sessionReport(state, selected?.id ?? '');
  const assets = state.assets.filter((asset) => asset.league === league);
  const snapshots = state.valuations.filter((snapshot) => snapshot.league === league && snapshot.currency === valuationCurrency);
  const before = snapshots.find((snapshot) => snapshot.id === beforeId) ?? snapshots.at(-2);
  const after = snapshots.find((snapshot) => snapshot.id === afterId) ?? snapshots.at(-1);
  let comparison: ReturnType<typeof compareValuations> | null = null; let comparisonError = '';
  if (before && after) try { comparison = compareValuations(before, after); } catch (reason) { comparisonError = reason instanceof Error ? reason.message : '快照无法比较。'; }

  function save(next: FinanceState, message = '', restoring = false) {
    try {
      if (unreadable && !restoring) throw new Error('原账本读取失败，已阻止覆盖。请先从下方导出原文，再导入有效备份。');
      if (!restoring) {
        const stored = localStorage.getItem(FINANCE_KEY), current = stored ? readFinance(stored) : emptyFinance();
        if (JSON.stringify(current) !== JSON.stringify(state)) {
          setState(current);
          throw new Error('另一工坊页面已更新账本，已载入最新记录。请重新操作，避免覆盖。');
        }
      }
      // Validate before replacing either the saved ledger or the visible state.
      const checked = readFinance(JSON.stringify(next));
      localStorage.setItem(FINANCE_KEY, JSON.stringify(checked)); setState(checked); setUnreadable(false); setError(''); setNotice(message);
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : '本地记录未能保存，请先导出备份。'); return false; }
  }
  function editAsset(id: string, patch: Partial<Asset>) {
    save({ ...state, assets: state.assets.map((asset) => asset.id === id ? { ...asset, ...patch } : asset) });
  }
  function startSession() {
    if (active) return;
    const session = { id: crypto.randomUUID(), league, startedAt: new Date().toISOString() };
    if (save({ ...state, sessions: [...state.sessions, session] }, '已开始记录。本页不自动判断游戏在线状态。')) setSelectedSession(session.id);
  }
  function addEntry() {
    if (active && active.league !== league || !label.trim() || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      setError('请填写项目与正数数量；如正在记录其他联盟，请先结束该场次。'); return;
    }
    const at = new Date().toISOString();
    const session = active ?? { id: crypto.randomUUID(), league, startedAt: at };
    const entry = { id: crypto.randomUUID(), sessionId: session.id, at, kind, label: label.trim(), amount: Number(amount), currency, confirmed: false };
    if (save({ ...state, sessions: active ? state.sessions : [...state.sessions, session], entries: [...state.entries, entry] }, '已加入待确认记录；实际成交或消耗后，点击确认才会计入收支。')) {
      setLabel(''); setAmount(''); setSelectedSession(session.id);
    }
  }
  function addAsset() {
    const quantity = Number(assetQuantity);
    if (!assetName.trim() || !Number.isFinite(quantity) || quantity < 0) { setError('请填写资产名称和有效数量。'); return; }
    if (save({ ...state, assets: [...state.assets, { id: crypto.randomUUID(), league, label: assetName.trim(), quantity, price: null, currency: valuationCurrency }] })) {
      setAssetName(''); setAssetQuantity('1');
    }
  }
  function snapshot() {
    if (!assets.length || !snapshotLabel.trim()) { setError('请先添加持有资产并填写快照名称。'); return; }
    const value = takeValuation(state, league, valuationCurrency, snapshotLabel.trim());
    if (save({ ...state, valuations: [...state.valuations, value] }, '估值快照已保存。价格来自手动填写的挂牌参考，不代表已经出售。')) {
      if (snapshots.length) setBeforeId(snapshots.at(-1)!.id);
      setAfterId(value.id); setSnapshotLabel('重新上线时');
    }
  }
  return <section className="wb-panel wb-finance" aria-label="交易与资产损益">
    {error && <p className="wb-inline-warning" role="alert">{error}</p>}{notice && <p className="lo-notice" role="status">{notice}</p>}
    <TradeTracker active={visible} state={state} league={league} save={save} onError={setError} onManual={() => {
      if (manual.current) { manual.current.open = true; manual.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); manual.current.querySelector<HTMLInputElement>('[aria-label="收支说明"]')?.focus(); }
    }} />
    <details ref={manual} className="fn-section fn-advanced"><summary>场次与手动记账</summary><section aria-label="已确认收支">
      <h3>已确认收支</h3><p>按通货分别列出本场收入、购买支出和实际材料消耗。净收支不等于售出装备的利润，也不包含尚未卖出的装备价值；不同通货不按未知汇率相加。</p>
      <div className="fn-toolbar"><button className="wb-button primary" type="button" disabled={Boolean(active)} onClick={startSession}>开始本场记录</button>
        <button className="wb-button" type="button" disabled={!active} onClick={() => {
          if (!active) return;
          save({ ...state, sessions: state.sessions.map((session) => session.id === active.id ? { ...session, endedAt: new Date().toISOString() } : session) }, '本场已结束，收支报告已保留。资产涨跌请在下方保存独立快照。');
          setSelectedSession(active.id);
        }}>结束本场 / 下线记账</button>
        <span>{active ? `${active.league} · 记录中（${timestamp(active.startedAt)}）` : '尚未开始记录'}</span></div>
      <p className="wb-fine">材料只记录实际使用数量及原通货，不填写折算后的重复成本。例如已记入购买剥离石的崇高石支出，制作时应记录消耗几颗剥离石。</p>
      <div className="fn-entry-form"><label>类型<select aria-label="收支类型" value={kind} onChange={(event) => setKind(event.target.value as EntryKind)}>{Object.entries(ENTRY_LABELS).map(([key, name]) => <option value={key} key={key}>{name}</option>)}</select></label>
        <label>物品 / 材料说明<input aria-label="收支说明" maxLength={300} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如：出售烈焰之击" /></label>
        <label>通货数量<input aria-label="收支数量" type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <label>通货<CurrencyInput label="收支通货" value={currency} onChange={setCurrency} /></label>
        <button type="button" className="wb-button" disabled={Boolean(active && active.league !== league)} onClick={addEntry}>加入待确认</button></div>
      <label>查看场次<select aria-label="查看收支场次" value={selected?.id ?? ''} onChange={(event) => setSelectedSession(event.target.value)}><option value="" disabled>暂无记录</option>{[...sessions].reverse().map((session) => <option key={session.id} value={session.id}>{timestamp(session.startedAt)} · {session.endedAt ? '已结束' : '记录中'}</option>)}</select></label>
      {selected && <>
        <p>开始：{timestamp(selected.startedAt)}；结束：{selected.endedAt ? timestamp(selected.endedAt) : '进行中'}。待确认 {report.pending} 条，不计入报告。</p>
        <div className="fn-scroll"><table><thead><tr><th>通货</th><th>收入</th><th>购买支出</th><th>制作消耗</th><th>净收支</th></tr></thead><tbody>{Object.entries(report.currencies).map(([unit, row]) => <tr key={unit}><th>{CURRENCIES[unit as Currency]}</th><td>{format(row.income)}</td><td>{format(row.purchase)}</td><td>{format(row.craft)}</td><td className={row.net >= 0 ? 'positive' : 'negative'}>{format(row.net)}</td></tr>)}</tbody></table></div>
        <div className="fn-scroll"><table><thead><tr><th>记录时间</th><th>项目</th><th>类型</th><th>数量</th><th>状态 / 操作</th></tr></thead><tbody>{state.entries.filter((entry) => entry.sessionId === selected.id).slice().reverse().map((entry) => <tr key={entry.id}><td>{timestamp(entry.at)}</td><td>{entry.label}</td><td>{ENTRY_LABELS[entry.kind]}</td><td>{format(entry.amount)} {CURRENCIES[entry.currency]}</td><td><div className="fn-actions"><button type="button" className="wb-text-button" onClick={() => save({ ...state, entries: state.entries.map((row) => row.id === entry.id ? { ...row, confirmed: !row.confirmed } : row) })}>{entry.confirmed ? '已确认 · 撤回确认' : '确认已成交 / 消耗'}</button><button type="button" className="wb-text-button" onClick={() => save({ ...state, entries: state.entries.filter((row) => row.id !== entry.id) })}>删除此条</button></div></td></tr>)}</tbody></table></div>
      </>}
    </section></details>
    <details className="fn-section fn-advanced"><summary>持有资产估值涨跌 · 下线前后对比</summary><section aria-label="持有资产估值涨跌">
      <h3>下线前后持有资产的估值涨跌</h3>
      <div className="fn-toolbar"><button className="wb-button" type="button" disabled={addingEquipment || !!loadout.error || !Object.keys(loadout.state.slots).length} onClick={() => {
        setAddingEquipment(true);
        void loadoutAssetInputs(loadout.state, league, valuationCurrency).then((inputs) => {
          const next = addLoadoutAssets(state, league, inputs, refreshEquipmentPrices);
          save(next.state, `已新增 ${next.added} 项装备资产，更新 ${next.updated} 项参考单价。缺价保持未知；已有持有数量和历史快照未覆盖，未生成成交记录。`);
        }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '无法读取角色装备。'))
          .finally(() => setAddingEquipment(false));
      }}>{addingEquipment ? '正在整理装备…' : '从角色装备添加持有资产'}</button><span>{Object.keys(loadout.state.slots).length} 件当前装备</span></div>
      <label><input type="checkbox" checked={refreshEquipmentPrices} onChange={(event) => setRefreshEquipmentPrices(event.target.checked)} />同时用新记录的挂牌参考更新已有装备资产单价（保留持有数量）</label>
      <p className="wb-fine">复用当前整套装备和你主动记录的挂牌参考。相同物品不重复添加；换装后旧装备是否仍持有、是否出售需手动核对，不从装备变化推断成交或利润。</p>
      <p>从角色装备加入资产，或手动填写装备、通货及材料的数量与单价，再在下线和重新上线时分别保存快照。涨跌固定使用起始持有数量，新增或卖出另列；不会与上面的收支相加。</p>
      <div className="fn-toolbar"><label>快照计价单位<CurrencyInput label="快照计价单位" value={valuationCurrency} onChange={(value) => { setValuationCurrency(value); setBeforeId(''); setAfterId(''); }} /></label><span>单价币种不同的资产，在此快照中记为未估值。</span></div>
      <div className="fn-entry-form"><label>资产名称<input aria-label="资产名称" maxLength={300} value={assetName} onChange={(event) => setAssetName(event.target.value)} /></label><label>持有数量<input aria-label="新增资产数量" min="0" step="any" type="number" value={assetQuantity} onChange={(event) => setAssetQuantity(event.target.value)} /></label><button className="wb-button" type="button" onClick={addAsset}>添加持有资产</button></div>
      <div className="fn-scroll"><table><thead><tr><th>资产</th><th>持有数量</th><th>当前参考单价</th><th>单价币种</th></tr></thead><tbody>{assets.map((asset) => <tr key={asset.id}><th>{asset.label}</th><td><input aria-label={`${asset.label}持有数量`} type="number" min="0" step="any" value={asset.quantity} onChange={(event) => { if (event.target.value !== '') editAsset(asset.id, { quantity: Number(event.target.value) }); }} /></td><td><input aria-label={`${asset.label}参考单价`} type="number" min="0" step="any" placeholder="未估值" value={asset.price ?? ''} onChange={(event) => editAsset(asset.id, { price: event.target.value === '' ? null : Number(event.target.value) })} /></td><td><CurrencyInput label={`${asset.label}单价币种`} value={asset.currency} onChange={(value) => editAsset(asset.id, { currency: value, price: null })} /></td></tr>)}</tbody></table></div>
      <p className="wb-fine">卖出后将持有数量设为 0，仍填写当前市场单价以观察原持仓的价格变化。留空表示未知，0 表示你明确估价为零。</p>
      <div className="fn-toolbar"><label>快照名称<input aria-label="估值快照名称" maxLength={300} value={snapshotLabel} onChange={(event) => setSnapshotLabel(event.target.value)} /></label><button type="button" className="wb-button primary" onClick={snapshot}>保存估值快照</button></div>
      <div className="fn-toolbar"><label>起始快照<select aria-label="起始估值快照" value={before?.id ?? ''} onChange={(event) => setBeforeId(event.target.value)}><option value="" disabled>至少需要两份快照</option>{snapshots.map((value) => <option key={value.id} value={value.id}>{value.label} · {timestamp(value.at)}</option>)}</select></label><label>结束快照<select aria-label="结束估值快照" value={after?.id ?? ''} onChange={(event) => setAfterId(event.target.value)}><option value="" disabled>尚无快照</option>{snapshots.map((value) => <option key={value.id} value={value.id}>{value.label} · {timestamp(value.at)}</option>)}</select></label></div>
      {comparisonError && <p className="wb-inline-warning">{comparisonError}</p>}
      {comparison && <><p className="fn-result">{comparison.missing ? '已估值部分的涨跌小计' : '原持仓的价格涨跌'}：<strong>{format(comparison.knownMovement)} {CURRENCIES[comparison.currency]}</strong> · {comparison.missing} 项未估值，{comparison.changedHoldings} 项持有数量变更。</p>
        <div className="fn-scroll"><table><thead><tr><th>资产</th><th>起始 → 结束数量</th><th>起始 → 结束单价</th><th>原持仓价格涨跌</th><th>数量变动按结束价计值</th></tr></thead><tbody>{comparison.rows.map((row) => <tr key={row.id}><th>{row.label}</th><td>{format(row.quantity)} → {format(row.quantityNow)}</td><td>{format(row.before)} → {format(row.after)}</td><td>{format(row.movement)}</td><td>{format(row.inventoryChange)}</td></tr>)}</tbody></table></div>
        <p className="wb-fine">数量变动计值仅解释持仓变化，不等于真实买卖收入或利润。快照保存的是当时手动输入或主动记录的挂牌参考，不会追溯补齐缺价。</p>
      </>}
    </section></details>
    <details className="fn-section"><summary>导入 / 导出本地账本</summary><p>只包含收支、场次和资产估值。导入会替换本页账本，不会影响装备或制作方案。</p>
      <textarea aria-label="损益账本 JSON" rows={5} value={backup} onChange={(event) => setBackup(event.target.value)} />
      <div className="fn-toolbar"><button type="button" className="wb-button" onClick={() => { setBackup(unreadable ? saved.raw : JSON.stringify(state, null, 2)); setNotice('账本已导出到文本框，请复制保存。'); }}>导出账本</button><button type="button" className="wb-button" disabled={!backup.trim()} onClick={() => {
        try { const next = readFinance(backup); save(next, '账本已载入。', true); setSelectedSession(''); setBeforeId(''); setAfterId(''); } catch (reason) { setError(reason instanceof Error ? reason.message : '账本无法导入。'); }
      }}>替换为备份账本</button></div>
    </details>
  </section>;
}
