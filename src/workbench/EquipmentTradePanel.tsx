import { useEffect, useMemo, useRef, useState } from 'react';
import { equipmentDisplayName, itemKindLabel, localizeEquipmentName, parseEquipment, type Equipment } from './genericEquipment';
import { buildEquipmentTrade, equipmentTradeRows, type EquipmentTradePreset, type EquipmentTradeRow } from './genericEquipmentTrade';
import { PriceEstimate, type PriceEstimateProps } from './PriceEstimate';
import type { TradeLeague } from './market';
import { upgradeComponents } from './upgradeRanking';
import UpgradeCandidates from './UpgradeCandidates';
import type { PatchData } from '../../packages/engine/src/types';
import type { GearTrade } from '../lib/gearTrade';
import { buildEquipmentT1Rows, equipmentT1Satisfied } from './equipmentT1';
import { liveLoadoutContext, priorityNames, type LoadoutContext } from './loadoutIntegration';
import { slotLabel as loadoutSlotLabel } from './loadout';
import PobItemRepair from './PobItemRepair';
import AffixReferencePanel from './AffixReferencePanel';
import { cachedAffixReference, mergeReferenceRows, readAffixReference, type AffixReferenceResult } from './affixReference';
import { POB_REVIEW_MARKER } from './pobRepair';
import { damageSkill, enforceDamageGoalRows, resistanceGate, usesDamageGoal } from './damageGoal';
import { guidedSearchRows, rollGuides, type SearchAmbition } from './searchGuidance';
import SearchGuidancePanel, { RollRangeHint, SearchConditionHint } from './SearchGuidancePanel';
import { mergeSkillTargetRows, skillPlan, skillTargetRows } from './skillRecommendation';
import { captureUpgradeSearch, upgradeSearchRows, type UpgradeSearchSnapshot } from './upgradeWorkflow';
import PresetNumberInput, { budgetPresets } from './PresetNumberInput';
import AffixSearchChoice from './AffixSearchChoice';
import LeaguePicker from './LeaguePicker';
import { addResistanceAffixRows, affixRowGroups, availableAffixes, describeAffixRows, rareAlternative } from './equipmentAffixes';
import AffixStructurePanel from './AffixStructurePanel';
import AffixPriceStudy from './AffixPriceStudy';
import CorePriceEstimate from './CorePriceEstimate';
type Preset = EquipmentTradePreset | 't1';

export interface EquipmentTradePanelProps {
  raw: string; league: string; onLeague: (league: string) => void; autoEstimate?: boolean;
  onEstimate?: PriceEstimateProps['onEstimate']; onCompare?: (equipment: Equipment, search?: UpgradeSearchSnapshot) => void;
  leagues?: readonly TradeLeague[]; leagueError?: string; intent?: 'price' | 'upgrade' | 't1';
  t1Data?: PatchData; t1Trade?: GearTrade | null;
  loadoutContext?: LoadoutContext;
  onRecordQuote?: PriceEstimateProps['onRecordQuote'];
  onRepairItem?: (expectedRaw: string, repairedRaw: string) => void;
}
export default function EquipmentTradePanel(props: EquipmentTradePanelProps) {
  const [recovered, setRecovered] = useState<{ original: string; raw: string } | null>(null);
  const raw = recovered?.original === props.raw ? recovered.raw : props.raw;
  const parsed = useMemo(() => parseEquipment(raw), [raw]);
  const [selectedType, setSelectedType] = useState('');
  const [repairOnUpgrade, setRepairOnUpgrade] = useState(props.intent === 'upgrade');
  const intent = repairOnUpgrade ? 'upgrade' : props.intent;
  const selected = parsed?.officialTypeCandidates?.find((candidate) => candidate.type === selectedType);
  const equipment = parsed && selected ? { ...parsed, baseNameEnglish: selected.type, category: selected.category,
    warnings: parsed.warnings.filter((warning) => !warning.includes('对应多件官方物品')) } : parsed;
  if (!equipment) return <div className="wb-trade-search"><h3>全物品查价</h3><p>请粘贴完整物品文本，包括稀有度和名称。支持装备、地图、碑牌、宝石、通货及材料的繁体、简体和英文文本。</p></div>;
  return <><PobItemRepair key={raw} raw={raw} auto={repairOnUpgrade} context={props.loadoutContext} onRepair={(next) => {
    props.onRepairItem?.(raw, next); setRecovered({ original: props.raw, raw: next });
  }} />{parsed?.officialTypeCandidates && <label className="wb-form-label">此中文名称存在歧义，请核对物品说明选择官方名称<select aria-label="选择准确的官方物品" value={selected?.type ?? ''} onChange={(event) => setSelectedType(event.target.value)}><option value="">请选择，不自动猜测</option>{parsed.officialTypeCandidates.map((candidate) => <option key={candidate.type} value={candidate.type}>{candidate.type}</option>)}</select></label>}<EquipmentTradeEditor key={`${raw}:${selected?.type ?? ''}:${intent ?? 'price'}`} {...props} intent={intent} raw={raw} equipment={equipment} onUpgrade={() => setRepairOnUpgrade(true)} /></>;
}

function EquipmentTradeEditor({ equipment, raw, league, onLeague, autoEstimate, onEstimate, onCompare, leagues = [], leagueError, intent = 'price', t1Data, t1Trade, loadoutContext, onRecordQuote, onUpgrade }: EquipmentTradePanelProps & { equipment: Equipment; onUpgrade: () => void }) {
  const nonEquipment = equipment.kind !== undefined && equipment.kind !== 'equipment';
  const [searchRare, setSearchRare] = useState(false);
  const searchEquipment = useMemo(() => searchRare ? rareAlternative(equipment, t1Data, t1Trade) : equipment, [searchRare, equipment, t1Data, t1Trade]);
  const catalogue = useMemo(() => availableAffixes(searchEquipment, t1Data, t1Trade), [searchEquipment, t1Data, t1Trade]);
  const t1 = useMemo(() => t1Data && t1Trade ? buildEquipmentT1Rows(equipment, t1Data, t1Trade) : null, [equipment, t1Data, t1Trade]);
  const initialPreset: Preset = nonEquipment ? 'base' : intent === 't1' ? 't1' : intent === 'upgrade' ? 'upgrade' : 'similar';
  const [preset, setPreset] = useState<Preset>(initialPreset);
  const targets = useMemo(() => loadoutContext && liveLoadoutContext(loadoutContext) && usesDamageGoal(loadoutContext.state)
    ? skillTargetRows(searchEquipment, loadoutContext.state, t1Data, t1Trade ?? undefined) : [], [searchEquipment, loadoutContext, t1Data, t1Trade]);
  const makeRows = (next: Preset) => next === 't1' ? t1?.rows ?? equipmentTradeRows(equipment, 'strict')
    : next === 'upgrade' ? upgradeSearchRows(searchEquipment, loadoutContext, t1Data, t1Trade) : equipmentTradeRows(equipment, next);
  const [rows, setRows] = useState(() => initialPreset === 't1' ? makeRows(initialPreset) : mergeReferenceRows(makeRows(initialPreset), cachedAffixReference(equipment)));
  const [exactBase, setExactBase] = useState(intent !== 'upgrade' && intent !== 't1');
  const [exactUnique, setExactUnique] = useState(true);
  const [sameCorruption, setSameCorruption] = useState(initialPreset !== 'upgrade');
  const [status, setStatus] = useState<'any' | 'online' | 'securable'>('any');
  const [custom, setCustom] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [budget, setBudget] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState<'exalted' | 'divine'>('divine');
  const [ambition, setAmbition] = useState<SearchAmbition | 'custom'>('auto');
  const [rowPresetReset, setRowPresetReset] = useState(0);
  const [guidanceNote, setGuidanceNote] = useState('');
  const [rollReference, setRollReference] = useState<AffixReferenceResult | undefined>(() => cachedAffixReference(equipment));
  const [rangeBusy, setRangeBusy] = useState(false), [rangeAttempted, setRangeAttempted] = useState(false);
  const rangeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => rangeRequest.current?.abort(), []);
  const damageMode = preset === 'upgrade' && !!loadoutContext && liveLoadoutContext(loadoutContext) && usesDamageGoal(loadoutContext.state);
  const sourceRows = searchRare && !custom && preset === 'upgrade' ? makeRows('upgrade') : rows;
  const mergedTargets = damageMode && !custom ? mergeSkillTargetRows(sourceRows, targets.map((row) => sourceRows.find((old) => old.key === row.key && old.referenceScale) ?? row), searchEquipment) : sourceRows;
  const constrainedRows = damageMode ? enforceDamageGoalRows(mergedTargets, searchEquipment, loadoutContext.state, loadoutContext.slot)
    : preset === 't1' && !custom ? t1?.rows ?? rows : rows;
  const activeRows = describeAffixRows(damageMode ? addResistanceAffixRows(constrainedRows, searchEquipment, loadoutContext, catalogue, t1Data?.patch) : constrainedRows, searchEquipment, catalogue, t1Data?.patch);
  const guides = useMemo(() => rollGuides(searchEquipment, searchRare ? null : t1, rollReference, activeRows), [searchEquipment, searchRare, t1, rollReference, activeRows]);
  const damageSort = damageMode && !activeRows.some((row) => row.referenceScale) && equipment.slot === 'weapon' && !!damageSkill(loadoutContext.state)?.tags.includes('attack');
  const goalGate = damageMode ? resistanceGate(loadoutContext.state, loadoutContext.slot, equipment) : undefined;
  const constraintOnly = damageMode && !damageSort && upgradeComponents(activeRows).length === 0;
  const fullT1 = preset === 't1' && t1 !== null && equipmentT1Satisfied(t1, activeRows);
  let result: ReturnType<typeof buildEquipmentTrade> | undefined;
  let error = '';
  try {
    if (preset === 'upgrade' && raw.includes(POB_REVIEW_MARKER)) throw new Error('原 PoB2 词缀仍需核对，完成重新识别后再搜索升级；原文件不一致时请先选择正确 XML。');
    if (preset === 't1' && !t1) throw new Error('T1 规则与交易映射正在加载，请稍候。');
    if (preset === 't1' && t1 && !t1.complete) throw new Error('尚不能为这件装备生成完整的全词缀 T1 条件，请核对下方提示；未退回普通查价。');
    result = buildEquipmentTrade({ equipment: searchEquipment, league, rows: activeRows, exactBase, exactUnique: searchRare ? false : exactUnique, status, sameCorruption,
    ranking: preset === 'upgrade', damageSort, constraintOnly, budget: preset === 'upgrade' ? budget : '', budgetCurrency }); }
  catch (failure) { error = failure instanceof Error ? failure.message : String(failure); }
  useEffect(() => {
    if (autoEstimate && error) onEstimate?.({ status: 'error', message: '物品信息需要核对', detail: error, url: 'https://www.pathofexile.com/trade2' });
  }, [autoEstimate, error, onEstimate]);
  const unknown = equipment.mods.filter((mod) => !mod.searchable && !mod.recognized);
  const components = upgradeComponents(activeRows);
  const preserved = activeRows.filter((row) => row.enabled && !row.equipmentFilter && (row.presenceOnly || row.actualValue === undefined));
  const upgrading = preset === 'upgrade';
  const noStats = result?.activeCount === 0;
  function applyPreset(next: Preset) { if (next === 'upgrade') onUpgrade(); setSearchRare(false); setRowPresetReset((old) => old + 1); setPreset(next); const generated = next === 't1' ? t1?.rows ?? equipmentTradeRows(equipment, 'strict') : next === 'upgrade' ? upgradeSearchRows(equipment, loadoutContext, t1Data, t1Trade) : equipmentTradeRows(equipment, next); setRows(next === 't1' ? generated : mergeReferenceRows(generated, cachedAffixReference(equipment))); setCustom(false); setAmbition('auto'); setGuidanceNote(''); setExactBase(next !== 'upgrade' && next !== 't1'); setSameCorruption(next !== 'upgrade'); }
  function edit(key: string, patch: Partial<EquipmentTradeRow>) { setRows(activeRows.map((row) => row.key === key ? { ...row, ...patch } : row)); if (preset === 'similar' && !nonEquipment) setPreset('strict'); setCustom(true); setAmbition('custom'); }
  function chooseGuidance(value: SearchAmbition) {
    setRowPresetReset((old) => old + 1);
    const generated = guidedSearchRows(value === 'auto' ? mergeReferenceRows(makeRows('upgrade'), searchRare ? undefined : cachedAffixReference(equipment)) : activeRows, guides, value);
    setRows(generated.rows); setAmbition(value); setCustom(false);
    setGuidanceNote(value === 'auto' ? '已恢复系统推荐条件，无需设置单项 roll 下限。点击搜索更新候选。'
      : `已自动设置 ${generated.applied} 项门槛${generated.unavailable ? `；${generated.unavailable} 项范围未确认，保持自动择优` : ''}。不是全词缀 T1 保证，点击搜索更新候选。`);
  }
  async function lookupRanges() {
    if (rangeBusy) return;
    const request = new AbortController(); rangeRequest.current?.abort(); rangeRequest.current = request;
    setRangeBusy(true); setRangeAttempted(true);
    try {
      const next = await readAffixReference(equipment, request.signal);
      if (!request.signal.aborted) { setRollReference(next); setRows((old) => mergeReferenceRows(old, next)); setGuidanceNote('已核对英文传奇资料；对应范围会显示在属性下方，未将资料数值写入当前装备。'); }
    } catch (reason) { if (!request.signal.aborted) setGuidanceNote(reason instanceof Error ? reason.message : '范围资料暂不可用，保持自动排序。'); }
    finally { if (!request.signal.aborted) setRangeBusy(false); }
  }
  const slotLabel = { weapon: '武器', offhand: '副手', helmet: '头盔', body: '胸甲', gloves: '手套', boots: '鞋靴', ring: '戒指', amulet: '项链', belt: '腰带', jewel: '珠宝', flask: '药剂', charm: '护符', relic: '圣物', other: '装备' }[equipment.slot];
  return <div className={`wb-trade-search wb-equipment-trade${upgrading ? ' is-upgrade' : ''}`} role="region" aria-label="全物品查价">
    <div className="wb-section-head"><div><span className="wb-eyebrow">ALL ITEMS · OFFICIAL TRADE</span><h3>{intent === 'upgrade' ? '寻找同类升级装备' : '全物品查价'}</h3></div><span className="wb-tag">{preset === 't1' ? fullT1 ? '全 T1 数值参考' : 'T1 条件待核对' : nonEquipment ? itemKindLabel(equipment) : equipment.rarity === 'unique' ? '传奇装备' : '实际属性'}</span></div>
    <div className="wb-actions">
      {equipment.icon && <img src={equipment.icon} alt="" loading="lazy" style={{ width: 48, height: 64, objectFit: 'contain' }} />}
      <div><strong title={equipment.name}>{equipmentDisplayName(equipment)}</strong><p className="wb-fine">{localizeEquipmentName(equipment.baseName)} · {nonEquipment ? itemKindLabel(equipment) : slotLabel}{equipment.itemLevel ? ` · 物等 ${equipment.itemLevel}` : ''}{equipment.mapTier ? ` · T${equipment.mapTier}` : ''}{equipment.gemLevel ? ` · 宝石等级 ${equipment.gemLevel}` : ''}{equipment.stackSize ? ` · 背包数量 ${equipment.stackSize}` : ''}</p></div>
      {equipment.stateText?.map((state) => <span className="wb-tag" key={state}>{state}</span>)}
      {onCompare && !nonEquipment && <button className="wb-button" onClick={() => onCompare(equipment)}>加入装备比较</button>}
    </div>
    {!nonEquipment && <AffixStructurePanel equipment={equipment} data={t1Data} />}
    <p className="wb-fine">选择查价方向即可搜索；工坊自动生成条件，无需先了解词缀 roll 范围。</p>
    <LeaguePicker label="全装备交易赛季" value={league} leagues={leagues} onChange={onLeague} />
    {leagueError && <p className="wb-fine">{leagueError}</p>}
    <div className="wb-trade-presets with-top" role="group" aria-label="全装备查价预设">{([
      ['similar', '相似查价', '核心属性降序 · 相近数值档位比价'], ['strict', '全部已识别属性', '实际数值 · 未识别项另列'],
      ['base', equipment.rarity === 'unique' ? '只查同名传奇' : nonEquipment ? '同档物品查价' : '只查底座', nonEquipment ? '保留阶级 / 等级 · 不限定词缀' : '不限定变量与词缀'], ['upgrade', '综合找升级', loadoutContext && usesDamageGoal(loadoutContext.state) ? '四抗封顶 · 主技能伤害优先' : '沿用当前方向 · 多属性加权排序'],
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
      {damageMode && <section className="wb-trade-top" aria-label="四抗封顶伤害目标"><h3>配装目标：四抗达到上限，再追求伤害</h3>
        <p className="wb-fine">火、冰、雷、混沌抗性分别按角色上限约束；溢出抗性、生命和防御不增加伤害分。{damageSort ? '先按武器面板 DPS 找候选，再核对全套抗性。' : '按主技能方向的伤害词缀筛选候选。'}技能最终 DPS 仍需在 PoB2 重算。</p>
        <p className="wb-fine">{goalGate?.origin ?? '尚无有效角色抗性基准'} · 主技能：{damageSkill(loadoutContext.state)?.label ?? '待导入技能资料'}</p>
        {skillPlan(loadoutContext.state) && <p className="wb-fine">已按主输出与参考 BD 生成 {activeRows.filter((row) => row.referenceScale).length} 个底座可出现的评分方向，其中 {activeRows.filter((row) => row.suggested).length} 个是旧装备没有的潜在属性。按已核对 T1 量尺比较，不要求同时拥有全部词缀。</p>}
        <details open={goalGate?.status !== 'met'}><summary>四抗门槛与计算依据 · {goalGate?.status === 'met' ? '当前全部达标' : goalGate?.status === 'unmet' ? '当前仍有缺口' : '需要补齐数据'}</summary>{goalGate?.rows.map((row) => <p key={row.key} className={row.met === false ? 'wb-inline-warning' : 'wb-fine'}>{row.label}：当前 {row.before ?? '未知'}% / 上限 {row.cap ?? '未知'}%{row.requiredOnItem !== undefined && row.requiredOnItem > 0 ? ` · 候选本栏合计至少 ${Number(row.requiredOnItem.toFixed(2))}%` : ''}</p>)}
        {goalGate?.notes.map((note) => <p key={note} className="wb-inline-warning">{note}</p>)}</details>
        {constraintOnly && <p className="wb-inline-warning">本栏没有可安全评分的伤害属性，先筛选抗性约束候选并按价格排列；技能伤害需要 PoB2 重算，不用生命或溢出抗性代替伤害分。</p>}
      </section>}
      <p className="wb-description" role="status">升级依据：{components.length} 项数值参与排序 · {preserved.length} 项技能 / 机制作为必须保留条件{unknown.length ? ` · ${unknown.length} 项文字未单独筛选` : ''}。进入后自动搜索一次，调整条件后点击重新搜索。</p>
      {equipment.rarity === 'unique' && <p className="wb-fine">默认比较同名传奇的词缀配置，以保留独有技能与机制；取消“限定同名传奇”可搜索同类装备（含稀有），但需自行核对技能与流派兼容性。升级搜索默认不限腐化状态。</p>}
      {equipment.rarity === 'unique' && damageMode && <section className="wb-trade-top" aria-label="传奇与稀有补抗替代">
        <p>{searchRare ? '正在检索同部位非传奇替代：已移除本件传奇独有机制的存在条件，整套抗性门槛保持。是否兼容 BD 仍须核对，不能仅凭方向分替换。' : '同名传奇无法新增普通稀有词缀。若本件没有所需混沌抗性，可切换到同部位非传奇替代检索。'}</p>
        <button type="button" className="wb-button" disabled={!t1Data || !t1Trade} onClick={() => { const next = !searchRare; setSearchRare(next); setRows(upgradeSearchRows(next ? rareAlternative(equipment, t1Data, t1Trade) : equipment, loadoutContext, t1Data, t1Trade)); setCustom(false); setHasSearched(true); setRowPresetReset((n) => n + 1); }}>{searchRare ? '返回同名传奇检索' : '检索同部位稀有替代'}</button>
      </section>}
      {damageMode && <section className="wb-trade-top" aria-label="角色缺口推荐检索"><h4>根据整套面板推荐补齐</h4>
        {goalGate?.rows.filter((row) => (row.requiredOnItem ?? 0) > 0).map((row) => {
          const suggestion = activeRows.find((entry) => entry.recommendation?.startsWith(`补${row.label}：`));
          return <div key={row.key}><strong>{row.label} · 候选本栏合计 ≥ {Number(row.requiredOnItem!.toFixed(2))}%</strong>
            <p className="wb-fine">{suggestion ? `${suggestion.affixType === 'suffix' ? '后缀' : '前缀'} · T1 范围 ${suggestion.targetRange?.min}–${suggestion.targetRange?.max} · 已加入下方推荐属性。` : searchEquipment.rarity === 'unique' ? '当前按同名传奇检索；不添加普通稀有词缀。' : '本底座暂无已核对的普通单条词缀范围；仍按合法抗性合计筛选，不猜 roll。'}</p>
            {suggestion?.targetRange && row.requiredOnItem! > suggestion.targetRange.max && <p className="wb-inline-warning">所需合计超过普通单条 T1 上限，需要其他合法来源组合或调整其他栏位；不会把单条 roll 提高到不存在的数值。</p>}
          </div>;
        })}
        {goalGate?.rows.every((row) => row.requiredOnItem === 0) && <p className="wb-fine">本栏可以不带抗性而保持四抗目标，检索不为溢出抗性额外加分。</p>}
        {goalGate?.rows.some((row) => row.requiredOnItem === undefined) && <p className="wb-inline-warning">部分抗性基准或上限未知，暂不能生成对应的补齐门槛；请更新 PoB2／游戏面板基准。</p>}
        <p className="wb-fine">先从角色总抗性扣除旧装备，再计算候选应补多少；混沌抗性单独处理。推荐词缀不是必须同时具备的整件配置。</p>
      </section>}
      {equipment.slot === 'weapon' && !equipment.properties.some((property) => property.name === 'attacksPerSecond') && <p className="wb-inline-warning">当前 PoB 文本未包含武器的物品面板 DPS，综合分只比较可识别词缀。可复制游戏中的完整武器文字，补充物品伤害与攻速；不会将综合分当作角色伤害提升。</p>}
      {!damageMode && loadoutContext && <p className="wb-description">{liveLoadoutContext(loadoutContext) ? `已关联角色${loadoutSlotLabel(loadoutContext.slot)}。优先属性：${priorityNames(loadoutContext.state.goals.priorities).join('、') || '未设置'}；${loadoutContext.state.goals.build ? `参考 BD 主攻：${loadoutContext.state.goals.build.main.label}，相关已识别词缀按 BD 方向分配相对权重` : '可识别的优先词缀默认权重 3，其余为 1'}。候选同时核对整套抗性目标。` : '来源装备栏已变化，请从角色装备页重新打开升级搜索，以更新比较基准。'}</p>}
      {!damageMode && <p className="wb-description">默认按当前装备方向自动排序，无需设置数值下限。需要自动保证整套四抗时，请从角色装备栏的“寻找这件的升级”进入。</p>}
      <div className="wb-actions"><PresetNumberInput label="升级预算上限" value={budget} onChange={setBudget} min={0} automaticLabel="不限预算" unit={budgetCurrency === 'divine' ? '神圣石' : '崇高石'} presets={budgetPresets([5, 10, 25, 50, 100, 500])} />
        <label className="wb-form-label">预算币种<select aria-label="升级预算币种" value={budgetCurrency} onChange={(event) => setBudgetCurrency(event.target.value as 'exalted' | 'divine')}><option value="divine">神圣石</option><option value="exalted">崇高石</option></select></label></div>
    </>}
    {upgrading && <SearchGuidancePanel ambition={ambition} onChoose={chooseGuidance} guideCount={[...guides.values()].filter((guide) => guide.safe && !!guide.top).length}
      note={guidanceNote} busy={rangeBusy} unique={equipment.rarity === 'unique'} onLookup={equipment.rarity === 'unique' ? () => { void lookupRanges(); } : undefined} />}
    <details className="wb-fold wb-search-conditions" onToggle={(event) => { if (event.currentTarget.open && !searchRare && equipment.rarity === 'unique' && !rollReference && !rangeBusy && !rangeAttempted) void lookupRanges(); }}><summary>调整搜索条件 · 已选 {activeRows.filter((row) => row.enabled).length} 项属性{custom ? ' · 已自定义' : ''}</summary><div className="wb-trade-options">
      <label className="wb-check"><input type="checkbox" checked={nonEquipment || exactBase} disabled={nonEquipment || !equipment.baseNameEnglish} onChange={(event) => setExactBase(event.target.checked)} />{nonEquipment ? '限定当前物品类型' : '限定当前底座'}</label>
      {equipment.rarity === 'unique' && <label className="wb-check"><input type="checkbox" checked={!searchRare && exactUnique} disabled={searchRare || !equipment.nameEnglish} onChange={(event) => setExactUnique(event.target.checked)} />限定同名传奇</label>}
      {equipment.kind !== 'currency' && equipment.kind !== 'other' && <label className="wb-check"><input type="checkbox" checked={sameCorruption} onChange={(event) => setSameCorruption(event.target.checked)} />限定相同腐化状态（{equipment.corrupted ? '已腐化' : '未腐化'}）</label>}
      <label className="wb-trade-status">卖家状态<select aria-label="全装备卖家状态" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="any">全部挂牌</option><option value="online">在线卖家</option><option value="securable">可即时交易</option></select></label>
    </div>
    {activeRows.length > 0 && <>
      <div className="wb-trade-filter-head"><strong>参与搜索的属性 <span className="wb-count">{activeRows.filter((row) => row.enabled).length} / {activeRows.length}</span></strong><button className="wb-text-button" onClick={() => applyPreset('base')}>清空属性条件</button></div>
      <div className="wb-trade-filters">{affixRowGroups(activeRows, equipment.rarity === 'unique' && !searchRare).map((group) => <section className="wb-affix-group" aria-label={`${group.label}搜索属性`} key={group.label}><h4>{group.label} · {group.rows.length} 项</h4>{group.rows.map((row) => <div key={row.key} className={`wb-trade-filter ${row.enabled ? 'enabled' : ''}`}>
        <label className="wb-trade-filter-label"><input type="checkbox" aria-label={`搜索属性：${row.label}`} checked={row.enabled} disabled={row.locked} onChange={(event) => edit(row.key, { enabled: event.target.checked })} /><span><strong>{row.label}</strong><small>{row.suggested ? row.key.startsWith('need:') ? '补齐推荐 · 当前装备未拥有' : 'BD 潜在属性 · 当前装备未拥有' : row.locked ? '抗性封顶硬约束' : row.referenceOnly ? 'Wiki 参考 · 勾选后只要求效果存在' : row.equipmentFilter ? '装备显示属性' : '已核对官方属性'}{row.suggested ? '' : row.actualValue === undefined ? row.locked ? '' : ' · 仅搜索是否存在' : ` · 实际值 ${Math.round(row.actualValue * 100) / 100}`}</small>{row.recommendation && <small>{row.recommendation}</small>}<RollRangeHint guide={guides.get(row.key)} />{row.warning && !row.referenceOnly && <small>{row.warning}</small>}</span></label>
        <SearchConditionHint row={row} upgrading={upgrading} />
        <AffixSearchChoice key={`${row.key}:${rowPresetReset}`} row={row} guide={guides.get(row.key)} onChoose={(patch) => edit(row.key, patch)} />
        {(row.targetTiers ?? guides.get(row.key)?.tiers)?.length ? <details><summary>全部阶层与 roll 范围 · {(row.targetTiers ?? guides.get(row.key)?.tiers)?.length} 档</summary>{(row.targetTiers ?? guides.get(row.key)?.tiers)?.map((tier) => <p className="wb-fine" key={tier.tier}>T{tier.tier}：{tier.roll.min}–{tier.roll.max} · 所需物等 {tier.requiredLevel}</p>)}<p className="wb-fine">词池规则 {row.targetPatch ?? t1?.patch}。伤害区间按官方平均值比较；数值门槛不证明实际词缀阶层，品质／复合来源须核对。</p></details> : null}
        {!row.referenceOnly && <details className="wb-trade-manual"><summary>手动调整（高级）</summary><div className={`wb-trade-bounds${upgrading && !row.equipmentFilter && !row.presenceOnly ? ' has-weight' : ''}`}>{upgrading && !row.equipmentFilter && !row.presenceOnly && <label>{damageMode ? '伤害方向权重' : '综合权重'}<input aria-label={`${row.label}权重`} type="number" min="0" max="100" step="any" value={row.weight ?? '1'} disabled={!row.enabled || damageMode && row.weight === '0'} onChange={(event) => edit(row.key, { weight: event.target.value })} /></label>}
          <label>{upgrading ? '最低要求' : '下限'}<input aria-label={`${row.label}下限`} type="number" step="any" value={row.min} disabled={!row.enabled || row.locked} placeholder={upgrading ? '不设硬门槛' : ''} onChange={(event) => edit(row.key, { min: event.target.value })} /></label>
        <label>上限<input aria-label={`${row.label}上限`} type="number" step="any" value={row.max} disabled={!row.enabled || row.locked} placeholder="不限" onChange={(event) => edit(row.key, { max: event.target.value })} /></label></div></details>}
        {preset === 't1' && t1?.references.has(row.key) && <p className="wb-trade-top-reference">{t1.references.get(row.key)?.note}</p>}
      </div>)}</section>)}</div>
    </>}
    </details><AffixReferencePanel equipment={equipment} onReference={preset === 't1' || searchRare ? undefined : (reference) => { setRollReference(reference); setRows((old) => mergeReferenceRows(old, reference)); }} />
    {!!equipment.flavourText?.length && <details><summary>装备背景文字</summary>{equipment.flavourText.map((line, index) => <p className="wb-fine" key={index}>{line}</p>)}</details>}
    {!!equipment.descriptionText?.length && <details><summary>物品说明</summary>{equipment.descriptionText.map((line, index) => <p className="wb-fine" key={index}>{line}</p>)}</details>}
    {result?.warnings.map((warning, number) => <p className="wb-inline-warning" key={number}>{warning}</p>)}
    {error && <p className="wb-inline-warning" role="alert">{error}</p>}
    {result && <>
      {upgrading && <AffixPriceStudy key={JSON.stringify({ equipment: searchEquipment.raw, rare: searchRare, league, rows: activeRows, guides: [...guides], exactBase, exactUnique, status, sameCorruption, budget, budgetCurrency })}
        options={{ equipment: searchEquipment, league, rows: activeRows, exactBase, exactUnique: !searchRare && exactUnique, status, sameCorruption, ranking: true, constraintOnly: true, budget, budgetCurrency }} guides={guides} />}
      {(nonEquipment || preset !== 'similar') && <><div className="wb-actions"><a className="wb-button primary" href={result.url} target="_blank" rel="noopener noreferrer">{fullT1 ? '打开同类全 T1 搜索' : upgrading ? '打开升级候选搜索' : '打开官方交易搜索'}</a></div>
      <p className="wb-fine">{noStats ? '低置信参考：当前只有同名、底座或类别条件。' : '挂牌参考：只比较当前勾选条件，无法衡量所有机制与组合价值。'}{preset === 't1' ? '随机词缀门槛来自 T1 规则参考，原装备实际值另列；' : '每条属性来自复制数值；'}范围伤害按交易网站的平均值搜索。</p></>}
      {upgrading ? <UpgradeCandidates key={JSON.stringify(result.query)} query={result.query} url={result.url} league={league} components={upgradeComponents(activeRows)} scoringRows={activeRows} auto={!hasSearched && !raw.includes(POB_REVIEW_MARKER)} onSearch={() => setHasSearched(true)} onCompare={onCompare ? (item) => onCompare(item, captureUpgradeSearch(loadoutContext, activeRows)) : undefined} itemRaw={raw}
        loadoutContext={loadoutContext && liveLoadoutContext(loadoutContext) ? loadoutContext : undefined} />
        : !nonEquipment && preset === 'similar' ? <CorePriceEstimate key={JSON.stringify([raw, league, exactBase, exactUnique, sameCorruption, status, activeRows])}
          options={{ equipment: searchEquipment, league, rows: activeRows, exactBase, exactUnique, sameCorruption, status }} guides={guides}
          auto={autoEstimate} onEstimate={onEstimate} onRecordQuote={onRecordQuote} onCompare={onCompare} />
        : <PriceEstimate query={result.query} url={result.url} league={league} auto={autoEstimate} onEstimate={onEstimate} itemRaw={raw}
          onRecordQuote={preset === 'similar' || preset === 'strict' ? onRecordQuote : undefined}
          buttonLabel={fullT1 ? '查询全 T1 市场' : undefined}
          emptyMessage={fullT1 ? '当前联盟未找到同时满足全部 T1 参考门槛的挂牌。条件保持不变；这不代表其他时间也没有。' : undefined} />}
      <details><summary>检查官方查询条件</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(result.query, null, 2)}</pre></details>
    </>}
  </div>;
}
