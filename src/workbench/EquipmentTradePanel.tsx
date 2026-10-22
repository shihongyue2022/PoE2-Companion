import { useId, useMemo, useState } from 'react';
import { localizeEquipmentName, parseEquipment, type Equipment } from './genericEquipment';
import { buildEquipmentTrade, equipmentTradeRows, type EquipmentTradePreset, type EquipmentTradeRow } from './genericEquipmentTrade';
import { PriceEstimate, type PriceEstimateProps } from './PriceEstimate';
import type { TradeLeague } from './market';

export interface EquipmentTradePanelProps {
  raw: string; league: string; onLeague: (league: string) => void; autoEstimate?: boolean;
  onEstimate?: PriceEstimateProps['onEstimate']; onCompare?: (equipment: Equipment) => void;
  leagues?: readonly TradeLeague[]; leagueError?: string; intent?: 'price' | 'upgrade';
}
export default function EquipmentTradePanel(props: EquipmentTradePanelProps) {
  const equipment = useMemo(() => parseEquipment(props.raw), [props.raw]);
  if (!equipment) return <div className="wb-trade-search"><h3>全装备查价</h3><p>请粘贴游戏内完整装备文本，包括稀有度、名称、底座与属性。支持繁体、简体和英文。</p></div>;
  return <EquipmentTradeEditor key={`${props.raw}:${props.intent ?? 'price'}`} {...props} equipment={equipment} />;
}

function EquipmentTradeEditor({ equipment, raw: _raw, league, onLeague, autoEstimate, onEstimate, onCompare, leagues = [], leagueError, intent = 'price' }: EquipmentTradePanelProps & { equipment: Equipment }) {
  const [preset, setPreset] = useState<EquipmentTradePreset>(intent === 'upgrade' ? 'upgrade' : 'similar');
  const [rows, setRows] = useState(() => equipmentTradeRows(equipment, intent === 'upgrade' ? 'upgrade' : 'similar'));
  const [exactBase, setExactBase] = useState(intent !== 'upgrade');
  const [exactUnique, setExactUnique] = useState(true);
  const [sameCorruption, setSameCorruption] = useState(true);
  const [status, setStatus] = useState<'any' | 'online' | 'securable'>('any');
  const [custom, setCustom] = useState(false);
  const listId = useId();
  let result: ReturnType<typeof buildEquipmentTrade> | undefined;
  let error = '';
  try { result = buildEquipmentTrade({ equipment, league, rows, exactBase, exactUnique, status, sameCorruption }); }
  catch (failure) { error = failure instanceof Error ? failure.message : String(failure); }
  const unknown = equipment.mods.filter((mod) => !mod.searchable);
  const upgrading = preset === 'upgrade';
  const noStats = result?.activeCount === 0;
  function applyPreset(next: EquipmentTradePreset) { setPreset(next); setRows(equipmentTradeRows(equipment, next)); setCustom(false); setExactBase(next !== 'upgrade'); }
  function edit(key: string, patch: Partial<EquipmentTradeRow>) { setRows((previous) => previous.map((row) => row.key === key ? { ...row, ...patch } : row)); setCustom(true); }
  const slotLabel = { weapon: '武器', offhand: '副手', helmet: '头盔', body: '胸甲', gloves: '手套', boots: '鞋靴', ring: '戒指', amulet: '项链', belt: '腰带', jewel: '珠宝', flask: '药剂', charm: '护符', relic: '圣物', other: '装备' }[equipment.slot];
  return <div className="wb-trade-search wb-equipment-trade" role="region" aria-label="全装备查价">
    <div className="wb-section-head"><div><span className="wb-eyebrow">ALL EQUIPMENT · OFFICIAL TRADE</span><h3>{intent === 'upgrade' ? '寻找同类升级装备' : '全装备查价'}</h3></div><span className="wb-tag">{equipment.rarity === 'unique' ? '传奇装备' : '实际属性'}</span></div>
    <div className="wb-actions">
      {equipment.icon && <img src={equipment.icon} alt="" loading="lazy" style={{ width: 48, height: 64, objectFit: 'contain' }} />}
      <div><strong>{localizeEquipmentName(equipment.name)}</strong><p className="wb-fine">{localizeEquipmentName(equipment.baseName)} · {slotLabel}{equipment.itemLevel ? ` · 物等 ${equipment.itemLevel}` : ''}</p></div>
      {onCompare && <button className="wb-button" onClick={() => onCompare(equipment)}>加入装备比较</button>}
    </div>
    <p className="wb-description">按复制文本中的实际数值比较武器、防具、首饰、传奇、珠宝、药剂、护符和圣物。勾选属性可调整下限与上限，未识别文字会逐条保留。</p>
    <label className="wb-form-label">交易赛季<input aria-label="全装备交易赛季" list={listId} value={league} placeholder="填写官网赛季名称" onChange={(event) => onLeague(event.target.value)} /><datalist id={listId}>{leagues.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</datalist></label>
    {leagueError && <p className="wb-fine">{leagueError}</p>}
    <div className="wb-trade-presets with-top" role="group" aria-label="全装备查价预设">{([
      ['similar', '相似查价', '核心三项 · 实际值下限80%'], ['strict', '全部已识别属性', '实际数值 · 未识别项另列'],
      ['base', equipment.rarity === 'unique' ? '只查同名传奇' : '只查底座', '不限定变量与词缀'], ['upgrade', '找升级', '核心三项 · 提高下限10%'],
    ] as const).map(([value, title, detail]) => <button key={value} aria-pressed={preset === value && !custom} className={preset === value && !custom ? 'active' : ''} onClick={() => applyPreset(value)}><strong>{title}</strong><small>{detail}</small></button>)}</div>
    {upgrading && <p className="wb-inline-warning">按所选正向属性提高门槛，不推测词缀阶级。请调整其他条件并核对机制；候选装备的挂牌价格属于升级搜索，不能作为当前装备估价。</p>}
    <div className="wb-trade-options">
      <label className="wb-check"><input type="checkbox" checked={exactBase} disabled={!equipment.baseNameEnglish} onChange={(event) => setExactBase(event.target.checked)} />限定当前底座</label>
      {equipment.rarity === 'unique' && <label className="wb-check"><input type="checkbox" checked={exactUnique} disabled={!equipment.nameEnglish} onChange={(event) => setExactUnique(event.target.checked)} />限定同名传奇</label>}
      <label className="wb-check"><input type="checkbox" checked={sameCorruption} onChange={(event) => setSameCorruption(event.target.checked)} />限定相同腐化状态（{equipment.corrupted ? '已腐化' : '未腐化'}）</label>
      <label className="wb-trade-status">卖家状态<select aria-label="全装备卖家状态" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="any">全部挂牌</option><option value="online">在线卖家</option><option value="securable">可即时交易</option></select></label>
    </div>
    {rows.length > 0 && <>
      <div className="wb-trade-filter-head"><strong>参与搜索的属性 <span className="wb-count">{rows.filter((row) => row.enabled).length} / {rows.length}</span></strong><button className="wb-text-button" onClick={() => applyPreset('base')}>清空属性条件</button></div>
      <div className="wb-trade-filters">{rows.map((row) => <div key={row.key} className={`wb-trade-filter ${row.enabled ? 'enabled' : ''}`}>
        <label className="wb-trade-filter-label"><input type="checkbox" aria-label={`搜索属性：${row.label}`} checked={row.enabled} onChange={(event) => edit(row.key, { enabled: event.target.checked })} /><span><strong>{row.label}</strong><small>{row.equipmentFilter ? '装备显示属性' : '已核对官方属性'}{row.actualValue === undefined ? ' · 仅搜索是否存在' : ` · 实际值 ${Math.round(row.actualValue * 100) / 100}`}</small>{row.warning && <small>{row.warning}</small>}</span></label>
        <div className="wb-trade-bounds"><label>下限<input aria-label={`${row.label}下限`} type="number" step="any" value={row.min} disabled={!row.enabled} onChange={(event) => edit(row.key, { min: event.target.value })} /></label>
        <label>上限<input aria-label={`${row.label}上限`} type="number" step="any" value={row.max} disabled={!row.enabled} placeholder="不限" onChange={(event) => edit(row.key, { max: event.target.value })} /></label></div>
      </div>)}</div>
    </>}
    {unknown.length > 0 && <details open><summary>未加入交易条件的文字（{unknown.length}）</summary>{unknown.map((mod) => <p className="wb-inline-warning" key={mod.key}><strong>{mod.label}</strong><br />{mod.warning}</p>)}</details>}
    {result?.warnings.map((warning, number) => <p className="wb-inline-warning" key={number}>{warning}</p>)}
    {error && <p className="wb-inline-warning" role="alert">{error}</p>}
    {result && <>
      <div className="wb-actions"><a className="wb-button primary" href={result.url} target="_blank" rel="noopener noreferrer">{upgrading ? '打开升级候选搜索' : '打开官方交易搜索'}</a></div>
      <p className="wb-fine">{noStats ? '低置信参考：当前只有同名、底座或类别条件。' : '挂牌参考：只比较当前勾选条件，无法衡量所有机制与组合价值。'}每条属性来自复制数值；范围伤害按交易网站的平均值搜索。</p>
      <PriceEstimate query={result.query} url={result.url} league={league} auto={autoEstimate} onEstimate={upgrading ? undefined : onEstimate} />
      <details><summary>检查官方查询条件</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(result.query, null, 2)}</pre></details>
    </>}
  </div>;
}
