import { useEffect, useId, useMemo, useState } from 'react';
import { itemKindLabel, localizeEquipmentName, parseEquipment, type Equipment } from './genericEquipment';
import { buildEquipmentTrade, equipmentTradeRows, type EquipmentTradePreset, type EquipmentTradeRow } from './genericEquipmentTrade';
import { PriceEstimate, type PriceEstimateProps } from './PriceEstimate';
import type { TradeLeague } from './market';
import { upgradeComponents } from './upgradeRanking';
import UpgradeCandidates from './UpgradeCandidates';
import type { PatchData } from '../../packages/engine/src/types';
import type { GearTrade } from '../lib/gearTrade';
import { buildEquipmentT1Rows, equipmentT1Satisfied } from './equipmentT1';
type Preset = EquipmentTradePreset | 't1';

export interface EquipmentTradePanelProps {
  raw: string; league: string; onLeague: (league: string) => void; autoEstimate?: boolean;
  onEstimate?: PriceEstimateProps['onEstimate']; onCompare?: (equipment: Equipment) => void;
  leagues?: readonly TradeLeague[]; leagueError?: string; intent?: 'price' | 'upgrade' | 't1';
  t1Data?: PatchData; t1Trade?: GearTrade | null;
}
export default function EquipmentTradePanel(props: EquipmentTradePanelProps) {
  const parsed = useMemo(() => parseEquipment(props.raw), [props.raw]);
  const [selectedType, setSelectedType] = useState('');
  const selected = parsed?.officialTypeCandidates?.find((candidate) => candidate.type === selectedType);
  const equipment = parsed && selected ? { ...parsed, baseNameEnglish: selected.type, category: selected.category,
    warnings: parsed.warnings.filter((warning) => !warning.includes('对应多件官方物品')) } : parsed;
  if (!equipment) return <div className="wb-trade-search"><h3>全物品查价</h3><p>请粘贴完整物品文本，包括稀有度和名称。支持装备、地图、碑牌、宝石、通货及材料的繁体、简体和英文文本。</p></div>;
  return <>{parsed?.officialTypeCandidates && <label className="wb-form-label">此中文名称存在歧义，请核对物品说明选择官方名称<select aria-label="选择准确的官方物品" value={selected?.type ?? ''} onChange={(event) => setSelectedType(event.target.value)}><option value="">请选择，不自动猜测</option>{parsed.officialTypeCandidates.map((candidate) => <option key={candidate.type} value={candidate.type}>{candidate.type}</option>)}</select></label>}<EquipmentTradeEditor key={`${props.raw}:${selected?.type ?? ''}:${props.intent ?? 'price'}`} {...props} equipment={equipment} /></>;
}

function EquipmentTradeEditor({ equipment, raw, league, onLeague, autoEstimate, onEstimate, onCompare, leagues = [], leagueError, intent = 'price', t1Data, t1Trade }: EquipmentTradePanelProps & { equipment: Equipment }) {
  const nonEquipment = equipment.kind !== undefined && equipment.kind !== 'equipment';
  const t1 = useMemo(() => t1Data && t1Trade ? buildEquipmentT1Rows(equipment, t1Data, t1Trade) : null, [equipment, t1Data, t1Trade]);
  const initialPreset: Preset = nonEquipment ? 'base' : intent === 't1' ? 't1' : intent === 'upgrade' ? 'upgrade' : 'similar';
  const [preset, setPreset] = useState<Preset>(initialPreset);
  const [rows, setRows] = useState(() => initialPreset === 't1' ? t1?.rows ?? equipmentTradeRows(equipment, 'strict') : equipmentTradeRows(equipment, initialPreset));
  const [exactBase, setExactBase] = useState(intent !== 'upgrade' && intent !== 't1');
  const [exactUnique, setExactUnique] = useState(true);
  const [sameCorruption, setSameCorruption] = useState(true);
  const [status, setStatus] = useState<'any' | 'online' | 'securable'>('any');
  const [custom, setCustom] = useState(false);
  const [budget, setBudget] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState<'exalted' | 'divine'>('divine');
  const activeRows = preset === 't1' && !custom ? t1?.rows ?? rows : rows;
  const fullT1 = preset === 't1' && t1 !== null && equipmentT1Satisfied(t1, activeRows);
  const listId = useId();
  let result: ReturnType<typeof buildEquipmentTrade> | undefined;
  let error = '';
  try {
    if (preset === 't1' && !t1) throw new Error('T1 规则与交易映射正在加载，请稍候。');
    if (preset === 't1' && t1 && !t1.complete) throw new Error('尚不能为这件装备生成完整的全词缀 T1 条件，请核对下方提示；未退回普通查价。');
    result = buildEquipmentTrade({ equipment, league, rows: activeRows, exactBase, exactUnique, status, sameCorruption,
    ranking: preset === 'upgrade', budget: preset === 'upgrade' ? budget : '', budgetCurrency }); }
  catch (failure) { error = failure instanceof Error ? failure.message : String(failure); }
  useEffect(() => {
    if (autoEstimate && error) onEstimate?.({ status: 'error', message: '物品信息需要核对', detail: error, url: 'https://www.pathofexile.com/trade2' });
  }, [autoEstimate, error, onEstimate]);
  const unknown = equipment.mods.filter((mod) => !mod.searchable);
  const upgrading = preset === 'upgrade';
  const noStats = result?.activeCount === 0;
  function applyPreset(next: Preset) { setPreset(next); setRows(next === 't1' ? t1?.rows ?? equipmentTradeRows(equipment, 'strict') : equipmentTradeRows(equipment, next)); setCustom(false); setExactBase(next !== 'upgrade' && next !== 't1'); }
  function edit(key: string, patch: Partial<EquipmentTradeRow>) { setRows(activeRows.map((row) => row.key === key ? { ...row, ...patch } : row)); setCustom(true); }
  const slotLabel = { weapon: '武器', offhand: '副手', helmet: '头盔', body: '胸甲', gloves: '手套', boots: '鞋靴', ring: '戒指', amulet: '项链', belt: '腰带', jewel: '珠宝', flask: '药剂', charm: '护符', relic: '圣物', other: '装备' }[equipment.slot];
  return <div className={`wb-trade-search wb-equipment-trade${upgrading ? ' is-upgrade' : ''}`} role="region" aria-label="全物品查价">
    <div className="wb-section-head"><div><span className="wb-eyebrow">ALL ITEMS · OFFICIAL TRADE</span><h3>{intent === 'upgrade' ? '寻找同类升级装备' : '全物品查价'}</h3></div><span className="wb-tag">{preset === 't1' ? fullT1 ? '全 T1 数值参考' : 'T1 条件待核对' : nonEquipment ? itemKindLabel(equipment) : equipment.rarity === 'unique' ? '传奇装备' : '实际属性'}</span></div>
    <div className="wb-actions">
      {equipment.icon && <img src={equipment.icon} alt="" loading="lazy" style={{ width: 48, height: 64, objectFit: 'contain' }} />}
      <div><strong>{localizeEquipmentName(equipment.name)}</strong><p className="wb-fine">{localizeEquipmentName(equipment.baseName)} · {nonEquipment ? itemKindLabel(equipment) : slotLabel}{equipment.itemLevel ? ` · 物等 ${equipment.itemLevel}` : ''}{equipment.mapTier ? ` · T${equipment.mapTier}` : ''}{equipment.gemLevel ? ` · 宝石等级 ${equipment.gemLevel}` : ''}{equipment.stackSize ? ` · 背包数量 ${equipment.stackSize}` : ''}</p></div>
      {equipment.stateText?.map((state) => <span className="wb-tag" key={state}>{state}</span>)}
      {onCompare && <button className="wb-button" onClick={() => onCompare(equipment)}>加入装备比较</button>}
    </div>
    <p className="wb-description">装备、地图、碑牌、宝石和材料均按已核对的官方名称查询。地图默认保留阶级与稀有度，宝石保留等级与品质；报价不乘背包堆叠数量。属性条件可逐项调整。</p>
    <label className="wb-form-label">交易赛季<input aria-label="全装备交易赛季" list={listId} value={league} placeholder="填写官网赛季名称" onChange={(event) => onLeague(event.target.value)} /><datalist id={listId}>{leagues.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</datalist></label>
    {leagueError && <p className="wb-fine">{leagueError}</p>}
    <div className="wb-trade-presets with-top" role="group" aria-label="全装备查价预设">{([
      ['similar', '相似查价', '核心三项 · 实际值下限80%'], ['strict', '全部已识别属性', '实际数值 · 未识别项另列'],
      ['base', equipment.rarity === 'unique' ? '只查同名传奇' : nonEquipment ? '同档物品查价' : '只查底座', nonEquipment ? '保留阶级 / 等级 · 不限定词缀' : '不限定变量与词缀'], ['upgrade', '综合找升级', '沿用当前方向 · 多属性加权排序'],
      ['t1', '同类全词缀 T1', '全部词缀方向 · 同时满足 T1 门槛'],
    ] as const).filter(([value]) => (!nonEquipment || value !== 'upgrade' && value !== 't1') && (value !== 't1' || equipment.rarity !== 'unique')).map(([value, title, detail]) => <button key={value} disabled={value === 't1' && (!t1 || !equipment.identified)} aria-pressed={preset === value && !custom} className={preset === value && !custom ? 'active' : ''} onClick={() => applyPreset(value)}><strong>{title}</strong><small>{detail}</small></button>)}</div>
    {preset === 't1' && <section className="wb-trade-top" aria-label="全词缀 T1 条件">
      <h3>{fullT1 ? '全部词缀同时满足 T1 参考门槛' : custom && t1?.complete ? '已调整为自定义条件，不再要求全词缀 T1' : '全词缀 T1 条件待核对'}</h3>
      <p>同类指相同装备类别，保留原装备每条词缀方向，额外词缀不限。默认不限具体底座和物等，可勾选“限定当前底座”。无挂单时保持条件，不自动放宽。</p>
      <p className="wb-fine">已核对 {t1?.tieredCount ?? 0} 条 T1 数值条件 · 规则快照 {t1?.patch ?? '加载中'}。固定、附魔和符文效果保持存在条件。数值达到 T1 参考门槛不代表已验证实际阶级；品质、混合词缀和跨底座差异需在官网核对。</p>
      {t1?.issues.map((issue, index) => <p className="wb-inline-warning" key={index}>{issue}</p>)}
      {custom && <button className="wb-text-button" type="button" onClick={() => applyPreset('t1')}>重新应用全部 T1 门槛</button>}
    </section>}
    {upgrading && <>
      <p className="wb-description">按当前装备已识别的数值词缀综合挑选，默认每项方向同等重要。权重越高越优先；最低要求留空时允许该项下降，用其他属性弥补。必须保住的抗性、移速或装备面板数值请设置最低要求。</p>
      <div className="wb-actions"><label className="wb-form-label">购买预算上限<input aria-label="升级预算上限" type="number" min="0" step="any" value={budget} placeholder="不限预算" onChange={(event) => setBudget(event.target.value)} /></label>
        <label className="wb-form-label">预算币种<select aria-label="升级预算币种" value={budgetCurrency} onChange={(event) => setBudgetCurrency(event.target.value as 'exalted' | 'divine')}><option value="divine">神圣石</option><option value="exalted">崇高石</option></select></label></div>
    </>}
    <div className="wb-trade-options">
      <label className="wb-check"><input type="checkbox" checked={nonEquipment || exactBase} disabled={nonEquipment || !equipment.baseNameEnglish} onChange={(event) => setExactBase(event.target.checked)} />{nonEquipment ? '限定当前物品类型' : '限定当前底座'}</label>
      {equipment.rarity === 'unique' && <label className="wb-check"><input type="checkbox" checked={exactUnique} disabled={!equipment.nameEnglish} onChange={(event) => setExactUnique(event.target.checked)} />限定同名传奇</label>}
      {equipment.kind !== 'currency' && equipment.kind !== 'other' && <label className="wb-check"><input type="checkbox" checked={sameCorruption} onChange={(event) => setSameCorruption(event.target.checked)} />限定相同腐化状态（{equipment.corrupted ? '已腐化' : '未腐化'}）</label>}
      <label className="wb-trade-status">卖家状态<select aria-label="全装备卖家状态" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="any">全部挂牌</option><option value="online">在线卖家</option><option value="securable">可即时交易</option></select></label>
    </div>
    {activeRows.length > 0 && <>
      <div className="wb-trade-filter-head"><strong>参与搜索的属性 <span className="wb-count">{activeRows.filter((row) => row.enabled).length} / {activeRows.length}</span></strong><button className="wb-text-button" onClick={() => applyPreset('base')}>清空属性条件</button></div>
      <div className="wb-trade-filters">{activeRows.map((row) => <div key={row.key} className={`wb-trade-filter ${row.enabled ? 'enabled' : ''}`}>
        <label className="wb-trade-filter-label"><input type="checkbox" aria-label={`搜索属性：${row.label}`} checked={row.enabled} onChange={(event) => edit(row.key, { enabled: event.target.checked })} /><span><strong>{row.label}</strong><small>{row.equipmentFilter ? '装备显示属性' : '已核对官方属性'}{row.actualValue === undefined ? ' · 仅搜索是否存在' : ` · 实际值 ${Math.round(row.actualValue * 100) / 100}`}</small>{row.warning && <small>{row.warning}</small>}</span></label>
        <div className={`wb-trade-bounds${upgrading && !row.equipmentFilter && !row.presenceOnly ? ' has-weight' : ''}`}>{upgrading && !row.equipmentFilter && !row.presenceOnly && <label>综合权重<input aria-label={`${row.label}权重`} type="number" min="0" max="100" step="any" value={row.weight ?? '1'} disabled={!row.enabled} onChange={(event) => edit(row.key, { weight: event.target.value })} /></label>}
          <label>{upgrading ? '最低要求' : '下限'}<input aria-label={`${row.label}下限`} type="number" step="any" value={row.min} disabled={!row.enabled} placeholder={upgrading ? '不设硬门槛' : ''} onChange={(event) => edit(row.key, { min: event.target.value })} /></label>
        <label>上限<input aria-label={`${row.label}上限`} type="number" step="any" value={row.max} disabled={!row.enabled} placeholder="不限" onChange={(event) => edit(row.key, { max: event.target.value })} /></label></div>
        {preset === 't1' && t1?.references.has(row.key) && <p className="wb-trade-top-reference">{t1.references.get(row.key)?.note}</p>}
      </div>)}</div>
    </>}
    {unknown.length > 0 && <details open><summary>未加入交易条件的文字（{unknown.length}）</summary>{unknown.map((mod) => <p className="wb-inline-warning" key={mod.key}><strong>{mod.label}</strong><br />{mod.warning}</p>)}</details>}
    {!!equipment.flavourText?.length && <details><summary>装备背景文字</summary>{equipment.flavourText.map((line, index) => <p className="wb-fine" key={index}>{line}</p>)}</details>}
    {!!equipment.descriptionText?.length && <details><summary>物品说明</summary>{equipment.descriptionText.map((line, index) => <p className="wb-fine" key={index}>{line}</p>)}</details>}
    {result?.warnings.map((warning, number) => <p className="wb-inline-warning" key={number}>{warning}</p>)}
    {error && <p className="wb-inline-warning" role="alert">{error}</p>}
    {result && <>
      <div className="wb-actions"><a className="wb-button primary" href={result.url} target="_blank" rel="noopener noreferrer">{fullT1 ? '打开同类全 T1 搜索' : upgrading ? '打开升级候选搜索' : '打开官方交易搜索'}</a></div>
      <p className="wb-fine">{noStats ? '低置信参考：当前只有同名、底座或类别条件。' : '挂牌参考：只比较当前勾选条件，无法衡量所有机制与组合价值。'}{preset === 't1' ? '随机词缀门槛来自 T1 规则参考，原装备实际值另列；' : '每条属性来自复制数值；'}范围伤害按交易网站的平均值搜索。</p>
      {upgrading ? <UpgradeCandidates key={JSON.stringify(result.query)} query={result.query} url={result.url} league={league} components={upgradeComponents(rows)} onCompare={onCompare} itemRaw={raw} />
        : <PriceEstimate query={result.query} url={result.url} league={league} auto={autoEstimate} onEstimate={onEstimate} itemRaw={raw}
          buttonLabel={fullT1 ? '查询全 T1 市场' : undefined}
          emptyMessage={fullT1 ? '当前联盟未找到同时满足全部 T1 参考门槛的挂牌。条件保持不变；这不代表其他时间也没有。' : undefined} />}
      <details><summary>检查官方查询条件</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(result.query, null, 2)}</pre></details>
    </>}
  </div>;
}
