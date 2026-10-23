import { useMemo, useState } from 'react';
import type { EquipmentTradePanelProps } from './EquipmentTradePanel';
import { equipmentDisplayName, hasSocketScaling, localizeEquipmentName, type Equipment } from './genericEquipment';
import { equipmentTradeRows } from './genericEquipmentTrade';
import { liveLoadoutContext } from './loadoutIntegration';
import { resistanceGate, resistanceQueryRows, damageSkill } from './damageGoal';
import { cachedAffixReference, mergeReferenceRows } from './affixReference';
import { POB_REVIEW_MARKER } from './pobRepair';
import CorePriceEstimate from './CorePriceEstimate';
import LeaguePicker from './LeaguePicker';
import PresetNumberInput, { budgetPresets } from './PresetNumberInput';
import { equipmentSearchOptions } from './equipmentSearchOptions';
import { rareAlternative } from './equipmentAffixes';
import { captureUpgradeSearch, upgradeSearchRows } from './upgradeWorkflow';
import { protectedUnique, workflowPreferences } from './workflowPreferences';

const percent = (value: number | undefined) => value === undefined ? '未知' : `${Number(value.toFixed(2))}%`;

/** Caps constrain the loadout. Item floors apply only in explicit single-slot mode. */
export default function EquipmentUpgradeSearch({ equipment, league, onLeague, leagues = [], leagueError, loadoutContext, autoEstimate, onEstimate, onCompare, t1Data, t1Trade, skillSearch }: EquipmentTradePanelProps & { equipment: Equipment }) {
  const workflow = loadoutContext && workflowPreferences(loadoutContext.state);
  const [budget, setBudget] = useState(workflow?.budget === undefined ? '' : String(workflow.budget)), [budgetCurrency, setBudgetCurrency] = useState<'divine' | 'exalted'>(workflow?.currency ?? 'divine');
  const [exactBase, setExactBase] = useState(!skillSearch), [sameCorruption, setSameCorruption] = useState(true);
  const [status, setStatus] = useState<'any' | 'online' | 'securable'>('any');
  const [replacementMode, setReplacementMode] = useState(workflow?.replacement === 'single' ? 'single' : 'loadout');
  const [rareBelt, setRareBelt] = useState(false);
  const searchEquipment = useMemo(() => rareBelt || skillSearch ? rareAlternative(equipment, t1Data, t1Trade) : equipment, [rareBelt, skillSearch, equipment, t1Data, t1Trade]);
  const context = loadoutContext && (liveLoadoutContext(loadoutContext) || skillSearch && !loadoutContext.raw && !loadoutContext.state.slots[loadoutContext.slot]) ? loadoutContext : undefined;
  const gate = context ? resistanceGate(context.state, context.slot, equipment) : undefined;
  const rows = useMemo(() => {
    const base = equipmentSearchOptions(searchEquipment, mergeReferenceRows(equipmentTradeRows(searchEquipment, 'similar'), rareBelt || skillSearch ? undefined : cachedAffixReference(equipment)), t1Data, t1Trade, skillSearch ? [skillSearch.ref] : [], skillSearch?.requiredRune ? [skillSearch.requiredRune] : []);
    // Preserve granted skills/mechanics alongside selected numeric cores.
    const required = new Set(skillSearch ? [] : equipmentTradeRows(searchEquipment, 'upgrade').filter((row) => row.enabled && row.presenceOnly).map((row) => row.key));
    return [...base.map((row) => required.has(row.key) ? { ...row, enabled: true, locked: true } : row),
      ...(context && replacementMode === 'single' && !hasSocketScaling(equipment) ? resistanceQueryRows(context.state, context.slot, equipment) : [])];
  }, [equipment, searchEquipment, rareBelt, t1Data, t1Trade, context, replacementMode, skillSearch]);
  const initial = skillSearch && rows.find((row) => row.scoringRef === skillSearch.ref && row.searchPresets?.some((entry) => entry.id === skillSearch.preset));
  const unfiltered = equipment.mods.filter((mod) => !mod.searchable);
  const needsRepair = equipment.raw.includes(POB_REVIEW_MARKER);
  const protectedName = context && protectedUnique(context.state, context.slot);
  return <section className="wb-equipment-core-search" aria-label="全物品查价">
    <div className="wb-section-head"><h3>装备提升检索</h3><LeaguePicker compact label="全装备交易赛季" value={league} leagues={leagues} onChange={onLeague} /></div>
    <div className="wb-core-item"><div className="wb-core-item-title">{equipment.icon && <img src={equipment.icon} alt="" loading="lazy" />}<div><strong title={equipment.name}>{equipmentDisplayName(equipment)}</strong><p className="wb-fine">{localizeEquipmentName(equipment.baseName)}{equipment.itemLevel ? ` · 物等 ${equipment.itemLevel}` : ''}{context && damageSkill(context.state) ? ` · 主技能 ${damageSkill(context.state)!.label}` : ''}</p></div></div>
      <div className="wb-core-budget"><PresetNumberInput label="升级预算上限" value={budget} onChange={setBudget} min={0} automaticLabel="不限预算" presets={budgetPresets([5, 10, 25, 50, 100, 500])} /><label className="wb-form-label">通货<select aria-label="升级预算币种" value={budgetCurrency} onChange={(event) => setBudgetCurrency(event.target.value as 'divine' | 'exalted')}><option value="divine">神圣石</option><option value="exalted">崇高石</option></select></label></div>
    </div>
    {leagueError && <p className="wb-inline-warning">{leagueError}</p>}
    {skillSearch && <p className="wb-fine">来自技能增伤路线：已带入所选词缀与档位，检索稀有装备。原传奇独有机制不会自动保留；当前装备尚未替换。</p>}
    {protectedName && <p className="wb-fine">此部位保留同名传奇机制；其他身份的物品可研究，但不会通过候选组合。需要替换时，在角色页配装规则解除本部位保护。</p>}
    {!skillSearch && equipment.slot === 'belt' && equipment.rarity === 'unique' && <label className="wb-form-label">腰带范围<select aria-label="腰带检索范围" value={rareBelt ? 'rare' : 'unique'} onChange={(event) => setRareBelt(event.target.value === 'rare')}><option value="unique">同名传奇腰带</option><option value="rare">同类稀有腰带 · 可选普通前后缀</option></select></label>}
    {gate ? <div className="wb-core-resistance" role="region" aria-label="整套抗性约束"><strong>整套四抗目标</strong><label className="wb-core-resistance-mode">配装方式<select aria-label="配装方式" value={replacementMode} onChange={(event) => setReplacementMode(event.target.value)}><option value="loadout">整套规划 · 可跨部位补抗</option><option value="single">只换这一件 · 四抗必须达标</option></select></label>
      {gate.rows.map((row) => <span key={row.key}>{row.label}：当前 {percent(row.effectiveBefore)} / 目标 {percent(row.minimum)}{row.overflowBefore ? ` · 溢出 ${percent(row.overflowBefore)}` : ''}</span>)}
      <p className="wb-fine">{replacementMode === 'loadout' ? '四抗约束整套配装，不要求每件装备补齐。先找核心属性候选，再列出换入后的整套缺口，由其他部位共同补足；待补抗候选不作为已完成的升级。' : '固定其他装备，只保留换入后整套四抗已确认达标的候选。插槽联动效果在候选返回后核对。'}</p>
      {gate.rows.some((row) => row.met === undefined) && <p className="wb-inline-warning">部分抗性基准未知，请更新角色面板；未知不会视为达标。</p>}</div>
      : <p className="wb-fine">从角色装备栏打开检索，可核对换装后的整套火、冰、雷、混沌抗性。</p>}
    <details className="wb-core-extra-filters"><summary>底座、腐化与卖家筛选</summary><div className="wb-trade-options">
      <label className="wb-check"><input type="checkbox" checked={exactBase} disabled={!equipment.baseNameEnglish} onChange={(event) => setExactBase(event.target.checked)} />限定当前底座</label>
      <label className="wb-check"><input type="checkbox" checked={sameCorruption} onChange={(event) => setSameCorruption(event.target.checked)} />限定相同腐化状态</label>
      <label>卖家<select aria-label="全装备卖家状态" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="any">全部挂牌</option><option value="online">在线卖家</option><option value="securable">可即时交易</option></select></label>
    </div></details>
    {needsRepair ? <p role="alert" className="wb-inline-warning">原 PoB2 词缀仍需核对，完成上方重新识别后再检索。</p> : skillSearch && !initial ? <p role="alert" className="wb-inline-warning">所选技能词缀或档位尚未核对，请返回技能详情重新选择；未改用其他属性检索。</p> : <CorePriceEstimate key={rareBelt ? 'rare' : 'current'} initialSelection={initial && skillSearch ? { key: initial.key, preset: skillSearch.preset } : undefined} options={{ equipment: searchEquipment, league, rows, exactBase, exactUnique: !rareBelt && !skillSearch, sameCorruption, status, budget, budgetCurrency }} auto={autoEstimate} onEstimate={onEstimate} onCompare={onCompare ? (candidate, quote) => onCompare(candidate, skillSearch && context ? captureUpgradeSearch(context, upgradeSearchRows({ ...equipment, rarity: 'rare' }, context, t1Data, t1Trade, skillSearch.requiredRune ? [skillSearch.requiredRune] : [])) : undefined, quote) : undefined}
      reviewCandidate={context ? (candidate) => {
        const next = resistanceGate(context.state, context.slot, candidate);
        return { eligible: replacementMode === 'loadout' || next.status === 'met', status: next.status,
          label: next.status === 'met' ? '整套四抗达标' : next.status === 'unmet' ? '需补抗 · 待组合' : '抗性待核对',
          detail: next.rows.filter((row) => row.met !== true).map((row) => `${row.label} ${percent(row.effectiveAfter)} / 目标 ${percent(row.minimum)}${row.after !== undefined && row.minimum !== undefined ? `，缺 ${percent(Math.max(0, row.minimum - row.after))}` : '，基准待补齐'}`).join('；') };
      } : undefined} />}
    {unfiltered.length > 0 && <details className="wb-core-unfiltered"><summary>{unfiltered.length} 项机制／文字未加入筛选</summary>{unfiltered.map((mod) => <p className="wb-fine" key={mod.key}>{mod.text}</p>)}<p className="wb-fine">候选返回角色页后核对技能和特殊机制，核心属性达标不等于完整 BD 伤害提升。</p></details>}
  </section>;
}
