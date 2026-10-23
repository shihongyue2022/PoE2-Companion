import { useMemo, useRef, useState } from 'react';
import { equipmentDisplayName, localizeEquipmentName, localizeEquipmentProperty, parseEquipment, type Equipment } from './genericEquipment';
import {
  compareCandidate, deserializeLoadout, equipRaw, isLoadoutSlot, LOADOUT_SLOTS,
  loadoutTotals, loadoutWarnings, METRICS, removeSlot, RESISTANCE_KEYS,
  serializeLoadout, slotLabel, type LoadoutSlot, type LoadoutState, type MetricKey,
} from './loadout';
import './loadout.css';
import CharacterPanelCalibration from './CharacterPanelCalibration';
import PobImportPanel from './PobImportPanel';
import { validCharacterPanel } from './characterPanel';
import { useSavedLoadout, writeSavedLoadout } from './loadoutStore';
import LoadoutSourcePanel from './LoadoutSourcePanel';
import { applyPobLoadout, chooseComparisonSlot } from './loadoutIntegration';
import LoadoutQuoteSummary from './LoadoutQuoteSummary';
import LocalGameDataPanel from './LocalGameDataPanel';
import BuildAdvicePanel from './BuildAdvicePanel';
import Icon from './WorkbenchIcon';
import SocketComparisonControls from './SocketComparisonControls';
import PobItemRepair from './PobItemRepair';
import AffixReferencePanel from './AffixReferencePanel';
import { applyPobItemRepair } from './pobRepair';
import CharacterAnalysisPanel from './CharacterAnalysisPanel';
import { damageSkill, resistanceBaseline, usesDamageGoal } from './damageGoal';
import { comparisonSearchRows, upgradeSearchRows, type UpgradeCandidateInput } from './upgradeWorkflow';
import SkillRecommendationPanel from './SkillRecommendationPanel';
import type { PatchData } from '../../packages/engine/src/types';
import type { GearTrade } from '../lib/gearTrade';
import { currentResistanceGate, knownFilledSockets, resistanceGate, recordSocketEvidence } from './resistanceModel';
import { hasSocketScaling } from './genericEquipment';
import ResistanceComparisonPanel from './ResistanceComparisonPanel';
import PobResistanceSync from './PobResistanceSync';
import PresetNumberInput from './PresetNumberInput';
import { activeWeaponSet, switchWeaponSet, weaponPair } from './weaponSets';
import PobWeaponSync from './PobWeaponSync';
import WeaponContributionPanel from './WeaponContributionPanel';

export interface LoadoutPanelProps {
  onPrice: (raw: string, intent?: 'price' | 'upgrade', slot?: LoadoutSlot) => void;
  onCraft?: (raw: string) => void;
  league?: string;
  candidate?: UpgradeCandidateInput;
  active?: boolean;
  recommendationData?: PatchData;
  recommendationTrade?: GearTrade | null;
}
const format = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const deltaText = (value: number, unit = '') => `${value > 0 ? '+' : ''}${format(value)}${unit}`;

function SlotGlyph({ kind }: { kind: string }) {
  const drawings: Record<string, React.ReactNode> = {
    weapon: <><path d="m24 5 4 1 1 4-14 14-5-5zM9 21l8 8M12 26l-7 7M5 30l4 4" /><path d="m12 21 13-13" /></>,
    offhand: <><path d="M8 8 20 4l12 4v13c0 7-12 14-12 14S8 28 8 21z" /><path d="M20 9v20M13 13l7-3 7 3" /></>,
    helmet: <><path d="M8 29V18a12 12 0 0 1 24 0v11l-8 5-4-8-4 8zM8 18h24M20 6v20M11 22h5M24 22h5" /></>,
    body: <><path d="m14 5-8 5-3 9 8 3v12h18V22l8-3-3-9-8-5-6 5zM12 8l3 13h10l3-13M15 21v13M25 21v13" /></>,
    gloves: <><path d="m8 19 1-11 4-1 1 10 2-12 4 1v12l3-11 4 2-2 13 5-3 4 4-9 12H12z" /></>,
    boots: <><path d="m12 5 14 2-2 17 9 5v6H8v-9l5-6zM11 13h14M9 30h23" /></>,
    belt: <><path d="M4 14h32v13H4zM16 11h10v19H16zM20 16v9M26 20h6" /></>,
    amulet: <><path d="M9 5c-7 18 1 18 11 23C30 23 38 23 31 5M20 28l-5 6 5 5 5-5z" /><path d="m16 31 8 6" /></>,
    ring: <><ellipse cx="20" cy="25" rx="12" ry="10" /><path d="m13 9 7-5 7 5-7 9zM13 9h14M20 4v14" /></>,
    flask: <><path d="M15 4h10v7l6 14c3 9-1 12-11 12S6 34 9 25l6-14zM15 11h10M10 26h20M13 3h14" /></>,
    charm: <><path d="M20 3v7M13 9h14l6 15-13 13L7 24zM13 9l7 15 7-15M7 24h26M20 24v13" /></>,
  };
  return <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{drawings[kind] ?? drawings.charm}</svg>;
}

function EquipmentArt({ item, kind }: { item: Equipment | null; kind: string }) {
  const [failedUrl, setFailedUrl] = useState('');
  return item?.icon && item.icon !== failedUrl
    ? <img src={item.icon} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(item.icon ?? '')} />
    : <SlotGlyph kind={kind} />;
}

export default function LoadoutPanel({ onPrice, onCraft, league, candidate: incoming, active = true, recommendationData, recommendationTrade }: LoadoutPanelProps) {
  const saved = useSavedLoadout(), loadout = saved.state;
  const [selected, setSelected] = useState<LoadoutSlot>(() => {
    const item = parseEquipment(incoming?.raw ?? '');
    return item ? chooseComparisonSlot(loadout, item, incoming?.slot) ?? 'mainHand' : incoming?.slot ?? 'mainHand';
  });
  const [importText, setImportText] = useState('');
  const [candidateText, setCandidateText] = useState(incoming?.raw ?? '');
  const [notice, setNotice] = useState(incoming ? '市场候选已放入比较区，尚未替换装备。请核对目标栏位及差值。' : '');
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [socketCounts, setSocketCounts] = useState<{ before?: { raw: string; filled: number }; after?: { raw: string; filled: number }; scenario?: boolean }>({});
  const [backupText, setBackupText] = useState('');
  const importEntry = useRef<HTMLDivElement>(null), directionEntry = useRef<HTMLDivElement>(null), calibrationEntry = useRef<HTMLDivElement>(null), comparisonEntry = useRef<HTMLDetailsElement>(null);
  const selectedItem = useMemo(() => parseEquipment(loadout.slots[selected] ?? ''), [loadout.slots, selected]);
  const candidate = useMemo(() => parseEquipment(candidateText), [candidateText]);
  const beforeFilled = selectedItem ? knownFilledSockets(loadout, selectedItem, socketCounts.before?.raw === selectedItem.raw ? socketCounts.before.filled : undefined) : undefined;
  const afterFilled = candidate ? knownFilledSockets(loadout, candidate, socketCounts.after?.raw === candidate.raw ? socketCounts.after.filled : undefined) : undefined;
  const capturedRows = comparisonSearchRows(incoming?.search, loadout, selected);
  const damageRows = useMemo(() => capturedRows ?? (selectedItem && recommendationData && recommendationTrade ? upgradeSearchRows(selectedItem, { state: loadout, slot: selected, raw: selectedItem.raw }, recommendationData, recommendationTrade) : undefined),
    [capturedRows, selectedItem, selected, loadout, recommendationData, recommendationTrade]);
  const comparison = useMemo(() => candidate ? compareCandidate(loadout, selected, candidate, { beforeFilledSockets: beforeFilled, afterFilledSockets: afterFilled, damageRows }) : null, [candidate, loadout, selected, beforeFilled, afterFilled, damageRows]);
  const resistanceCheck = useMemo(() => candidate && selectedItem ? resistanceGate(loadout, selected, candidate, { beforeFilledSockets: beforeFilled, afterFilledSockets: afterFilled, socketScenario: socketCounts.scenario }) : undefined, [candidate, selectedItem, loadout, selected, beforeFilled, afterFilled, socketCounts.scenario]);
  const currentResistances = useMemo(() => currentResistanceGate(loadout), [loadout]);
  const failedResistances = resistanceCheck?.rows.filter((row) => row.met === false).map((row) => row.label).join('、');
  const totals = useMemo(() => loadoutTotals(loadout), [loadout]);
  const warnings = useMemo(() => loadoutWarnings(loadout), [loadout]);
  const equippedCount = Object.keys(loadout.slots).length;
  function reveal(element: HTMLElement | null, focusSelector?: string) {
    if (!element) return;
    if (element instanceof HTMLDetailsElement) element.open = true;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    element.querySelector<HTMLElement>(focusSelector ?? 'summary, select, textarea, button')?.focus({ preventScroll: true });
  }

  function save(next: LoadoutState) {
    if (saved.error) { setStorageError('原装备方案无法读取，已阻止覆盖。请先恢复有效备份。'); return false; }
    const error = writeSavedLoadout(next, saved.raw); setStorageError(error); return !error;
  }
  function selectSlot(slot: LoadoutSlot) {
    const keepCandidate = candidate && chooseComparisonSlot(loadout, candidate, slot) === slot;
    setSelected(slot); setImportText(''); if (!keepCandidate) setCandidateText(''); setError('');
    setNotice(keepCandidate ? `候选已保留，正在与${slotLabel(slot)}比较。` : '');
  }
  function changeCandidate(raw: string) {
    setCandidateText(raw); setError('');
    const item = parseEquipment(raw);
    if (!item) return;
    const target = chooseComparisonSlot(loadout, item, selected);
    if (!target || target === selected) return;
    setSelected(target); setImportText(''); setSocketCounts({});
    setNotice(`候选已识别为${slotLabel(target)}，已自动切换到${slotLabel(target)}比较；尚未替换任何装备。`);
  }
  function importToSlot(raw: string, fromCandidate = false) {
    const result = equipRaw(loadout, selected, raw, fromCandidate ? { beforeFilledSockets: beforeFilled, afterFilledSockets: afterFilled, socketScenario: socketCounts.scenario } : {});
    if (!result.ok) { setError(result.error); setNotice(''); return; }
    if (!save(result.state)) return;
    setError(''); setNotice(`已将「${equipmentDisplayName(result.item)}」放入${slotLabel(selected)}。`);
    if (fromCandidate) setCandidateText(''); else setImportText('');
  }
  function setPriority(key: MetricKey, checked: boolean) {
    save({ ...loadout, goals: { ...loadout.goals,
      priorities: checked ? [...new Set([...loadout.goals.priorities, key])] : loadout.goals.priorities.filter((entry) => entry !== key),
    } });
  }
  function importBackup() {
    const result = deserializeLoadout(backupText);
    if (!result.state) { setError(result.error); setNotice(''); return; }
    if (writeSavedLoadout(result.state, saved.raw)) { setError('方案未能保存，请检查浏览器存储。'); return; }
    setError(''); setCandidateText(''); setImportText('');
    setNotice('已载入全身装备方案。工艺台装备不受影响。');
  }
  function renderSlot(slot: typeof LOADOUT_SLOTS[number]) {
    const item = parseEquipment(loadout.slots[slot.id] ?? '');
    return <button type="button" key={slot.id} className={`lo-slot lo-slot-${slot.id}${selected === slot.id ? ' selected' : ''}${item ? ` equipped ${item.rarity}` : ''}`}
      aria-pressed={selected === slot.id} aria-label={`${slot.label}：${item?.name ?? '未装备'}`} onClick={() => selectSlot(slot.id)}>
      <span className="lo-slot-label">{slot.label}</span>
      <span className="lo-slot-art"><EquipmentArt item={item} kind={slot.kind} /></span>
      <strong title={item?.name}>{item ? equipmentDisplayName(item) : '点击导入'}</strong>
      {item && <small>{!item.identified ? '未鉴定' : localizeEquipmentName(item.baseName)}</small>}
    </button>;
  }

  return <section className="wb-loadout" aria-label="角色全身装备">
    <div className="lo-heading">
      <div><span className="wb-eyebrow">角色快照 · 全身配装</span><h2>我的全身装备</h2><p>更新角色 → 点选装备 → 查价或找升级 → 比较候选 → 确认替换。</p></div>
      <div className="lo-save-status"><span>{league ?? '当前联盟'} · {equippedCount} 件</span><small>独立保存在此浏览器</small></div>
    </div>
    {(storageError || error || saved.error) && <p className="lo-alert" role="alert">{error || storageError || saved.error}</p>}
    {notice && <p className="lo-notice" role="status">{notice}</p>}
    {usesDamageGoal(loadout) && <div className="lo-notice" role="note"><strong>配装标准：四抗达到各自上限后，优先提高主技能伤害</strong>
      <p className="lo-footnote">{damageSkill(loadout)?.label ? `主技能：${damageSkill(loadout)!.label} · ` : ''}{resistanceBaseline(loadout)?.origin ?? '请导入 PoB2 总抗性或录入当前游戏面板'}。抗性溢出、生命和防御不增加伤害分；最终技能伤害用 PoB2 换装计算验证。</p></div>}
    <nav className="lo-workflow" aria-label="配装提升流程">
      <button type="button" onClick={() => reveal(importEntry.current, 'button')}><Icon name="paste" /><strong>导入角色</strong><small>{equippedCount ? `已记录 ${equippedCount} 件 · 更新快照` : '读取 PoB2 / 本机 BD'}</small></button>
      <button type="button" onClick={() => reveal(directionEntry.current, 'select')}><Icon name="sliders" /><strong>确认方向</strong><small>{damageSkill(loadout)?.label ?? '选择主输出技能'}</small></button>
      <button type="button" onClick={() => reveal(calibrationEntry.current?.querySelector('details') ?? null)}><Icon name="check" /><strong>校准抗性</strong><small>{resistanceBaseline(loadout)?.origin ?? '补齐角色总值与上限'}</small></button>
      <button type="button" disabled={!selectedItem} onClick={() => { if (selectedItem) onPrice(selectedItem.raw, 'upgrade', selected); }}><Icon name="search" /><strong>寻找升级</strong><small>{selectedItem ? `搜索${slotLabel(selected)}` : '先点选已装备栏位'}</small></button>
      <button type="button" onClick={() => reveal(comparisonEntry.current, 'textarea')}><Icon name="equipment" /><strong>比较候选</strong><small>{candidate ? '候选已就位 · 确认后替换' : '粘贴或从市场加入'}</small></button>
    </nav>
    <div ref={importEntry} className="lo-import-entry"><section aria-label="整套装备导入">
      <PobImportPanel current={loadout} onImport={(slots, source) => {
        if (!save(applyPobLoadout(loadout, slots, source))) return;
        setError(''); setCandidateText(''); setImportText('');
        setNotice('已导入所选 PoB2 装备组，原角色面板基准已清除。请核对预览中的未解析效果。');
      }} />
      <details className="lo-import-availability"><summary>参考 BD 与本机游戏资料</summary><LocalGameDataPanel characterLevel={loadout.source?.level} onBuild={(profile) => {
        if (save({ ...loadout, goals: { ...loadout.goals, build: profile, mainSkill: { source: 'bd' }, priorities: profile.metrics } })) setNotice(`已采用「${profile.main.label}」的 BD 配装方向，可选择栏位查看建议或寻找升级。`);
      }} /></details>
      <details className="lo-import-availability"><summary>能直接连接官方账号同步吗？</summary>
        <p>本工坊目前未接入官方账号授权。GGG 官方角色接口支持 PoE2 装备读取，但截至 2026-10-22，官网暂停受理新应用注册，尚不能为本项目开通新的账号直连。当前可用方式为 PoB2 代码或 XML 导入；导入的是导出时的快照，不会随游戏自动同步。</p>
        <a href="https://www.pathofexile.com/developer/docs#getting-started" target="_blank" rel="noreferrer">查看 GGG 官方注册说明 ↗</a>
      </details>
    </section></div>
    <div ref={directionEntry} className="lo-workflow-direction"><SkillRecommendationPanel state={loadout} onSave={save} /></div>
    <PobResistanceSync active={active} />
    <PobWeaponSync active={active} />
    {currentResistances && <section className="lo-current-resistances" aria-label="当前整套抗性"><strong>当前整套抗性</strong>{currentResistances.rows.map((row) => <span key={row.key} className={row.met === false ? 'negative' : ''}>{row.label}：{row.effectiveAfter !== undefined ? `${format(row.effectiveAfter)}%` : row.after !== undefined ? `${format(row.after)}%（总值）` : '未知'} / {row.cap === undefined ? '上限未导出' : `${row.cap}%`}{row.overflowAfter !== undefined ? ` · 溢出 ${format(row.overflowAfter)}%` : ''}</span>)}<small>全元素不含混沌；已换装部分按累计差值推算。{loadout.socketEvidence?.some((entry) => entry.assumed) ? '镶嵌包含满孔情景，请核对实际数量。' : ''}</small>{currentResistances.rows.some((row) => row.cap === undefined) && <button type="button" className="wb-button" onClick={() => save({ ...loadout, goals: { ...loadout.goals, resistanceCaps: Object.fromEntries(RESISTANCE_KEYS.map((key) => [key, 75])) } })}>确认我的四项抗性上限均为 75%</button>}</section>}
    <div className="lo-layout">
      <div className="lo-inventory-column">
        <div className="lo-weapon-switch" role="group" aria-label="当前武器组">{([1, 2] as const).map((number) => {
          const pair = number === activeWeaponSet(loadout) ? weaponPair(loadout.slots) : loadout.weaponSets?.[number === 1 ? 'first' : 'second'];
          const count = Object.keys(pair ?? {}).length;
          return <button type="button" className={`wb-button${activeWeaponSet(loadout) === number ? ' primary' : ''}`} aria-pressed={activeWeaponSet(loadout) === number} key={number} onClick={() => {
            if (!save(switchWeaponSet(loadout, number))) return;
            setCandidateText(''); setImportText(''); setSocketCounts({}); setError('');
            setNotice(`已切换到武器组 ${number === 1 ? 'I' : 'II'}，只计算这一组主副手；另一组保留。`);
          }}>武器组 {number === 1 ? 'I' : 'II'} <small>{count ? `${count} 件` : loadout.weaponSets ? '空' : number === activeWeaponSet(loadout) ? '空' : '待导入／可粘贴'}</small></button>;
        })}</div>
        <p className="lo-footnote">两组主副手独立保存，防具与饰品共用。当前查看武器组 {activeWeaponSet(loadout) === 1 ? 'I' : 'II'}；切换不控制游戏，另一组不计入当前属性。</p>
        <div className="lo-character" aria-label="装备栏位">
          <svg className="lo-silhouette" viewBox="0 0 200 440" fill="none" aria-hidden="true"><path d="M80 48c0-35 40-35 40 0l-8 24 20 12 25 82 17 93-16 8-25-84-10-23 9 92-10 75 8 102h-25l-5-102-5 102H70l8-102-10-75 9-92-10 23-25 84-16-8 17-93 25-82 20-12z" /><path d="m70 94 30 42 30-42M76 160l24 22 24-22M72 243h56M100 136v107M78 280l22-27 22 27" /></svg>
          {LOADOUT_SLOTS.filter((slot) => !slot.id.startsWith('flask') && !slot.id.startsWith('charm')).map(renderSlot)}
          <div className="lo-board-note">点击栏位<br />粘贴游戏物品文字</div>
        </div>
        <div className="lo-consumables" aria-label="药剂与护符栏位">{LOADOUT_SLOTS.filter((slot) => slot.id.startsWith('flask') || slot.id.startsWith('charm')).map(renderSlot)}</div>
        <p className="lo-footnote">药剂与护符为记录栏，效果不加入常驻属性。可用护符栏位、唯一装备限制、属性需求和特殊天赋请在游戏内核对。</p>
        {warnings.length > 0 && <ul className="lo-warnings">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
        <WeaponContributionPanel state={loadout} />
        <details className="lo-backup"><summary>角色来源与更新记录{loadout.lastImport?.equipmentChanges ? ` · ${loadout.lastImport.equipmentChanges} 栏变化` : ''}</summary><LoadoutSourcePanel state={loadout} /></details>
        <CharacterAnalysisPanel state={loadout} onSave={save} onSelectSlot={selectSlot} />
        <LoadoutQuoteSummary state={loadout} league={league ?? 'Forbidden Rites'} />
        <details className="lo-summary"><summary>装备贡献合计（非角色面板）</summary>
          <p className="lo-footnote">下列生命、护盾、护甲等属于装备贡献；角色最终面板请在下方录入，不能直接按同一数值比较。</p>
          <div className="lo-total-grid">{METRICS.filter((metric) => !metric.key.endsWith('Dps') && ((totals[metric.key] ?? 0) !== 0 || RESISTANCE_KEYS.some((key) => key === metric.key) || metric.key === 'life')).map((metric) => <div key={metric.key}><span>{metric.label}</span><strong>{format(totals[metric.key] ?? 0)}{metric.unit}</strong></div>)}</div>
          <p className="lo-footnote">只合计可直接读取的数值，不含天赋、技能、剧情抗性惩罚、条件效果和百分比生命/防御缩放；这不是角色面板。武器 DPS 分件比较。</p>
        </details>
        <div ref={calibrationEntry}><CharacterPanelCalibration key={JSON.stringify([loadout.character?.recordedAt, activeWeaponSet(loadout), loadout.slots, loadout.source?.reference])} state={loadout} totals={totals} onSave={(character) => {
          save({ ...loadout, character, goals: { ...loadout.goals, resistanceCaps: character?.caps ?? loadout.goals.resistanceCaps } }); setNotice(character ? '游戏面板已记录。换装时比较有效抗性，生命与防御仍只列出装备差值。' : '已清除游戏面板基准。');
        }} /></div>
        <details className="lo-goals">
          <summary>设置升级目标 <span>{usesDamageGoal(loadout) ? '四抗封顶 · 伤害优先' : `${loadout.goals.priorities.length} 项优先属性`}</span></summary>
          <label>配装评分标准<select aria-label="配装评分标准" value={loadout.goals.objective ?? 'capped-damage'} onChange={(event) => { if (event.target.value === 'balanced' || event.target.value === 'capped-damage') save({ ...loadout, goals: { ...loadout.goals, objective: event.target.value } }); }}><option value="capped-damage">四抗封顶后，主技能伤害优先</option><option value="balanced">自定义属性方向</option></select></label>
          {usesDamageGoal(loadout) && <p className="lo-footnote">火、冰、雷、混沌分别达到当前角色上限，生命和防御只列差值，不能抵消抗性不达标。下方更高的抗性要求仍保留。</p>}
          {!usesDamageGoal(loadout) && <><p className="lo-footnote">优先属性单独标出，不将生命、抗性或武器 DPS 换算成一个虚构的战力分数。</p>
          <div className="lo-priorities">{METRICS.map((metric) => <label key={metric.key}><input type="checkbox" checked={loadout.goals.priorities.includes(metric.key)} onChange={(event) => setPriority(metric.key, event.target.checked)} />{metric.label}</label>)}</div></>}
          <h4>{usesDamageGoal(loadout) ? '角色总抗性额外下限（至少达到各自上限）' : validCharacterPanel(loadout) ? '角色未封顶总抗性下限' : '装备合计抗性下限'}</h4>
          <div className="lo-minimums">{RESISTANCE_KEYS.map((key) => {
            const cap = currentResistances?.rows.find((row) => row.key === key)?.cap;
            return <PresetNumberInput key={key} label={`${METRICS.find((metric) => metric.key === key)!.label}装备目标`} min={-200} max={1000} value={loadout.goals.minimums[key]?.toString() ?? ''} automaticLabel={usesDamageGoal(loadout) ? `跟随角色上限${cap === undefined ? '（待确认）' : ` ${cap}%`}` : '不加额外下限'} presets={cap === undefined ? [] : [{ value: String(cap), label: `达到上限 · ${cap}%` }, { value: String(cap + 10), label: `上限 +10% 缓冲 · ${cap + 10}%` }, { value: String(cap + 20), label: `上限 +20% 缓冲 · ${cap + 20}%` }]} onChange={(text) => {
            const minimums = { ...loadout.goals.minimums };
            if (!text) delete minimums[key];
            else { const value = Number(text); if (!Number.isFinite(value) || value < -200 || value > 1000) return; minimums[key] = value; }
            save({ ...loadout, goals: { ...loadout.goals, minimums } });
          }} />; })}</div>
          <p className="lo-footnote">已校准时按角色未封顶总抗性判断；未校准时仅按装备合计判断，需自行考虑剧情惩罚、天赋及抗性余量。</p>
        </details>
        <details className="lo-backup">
          <summary>导入 / 导出整套方案</summary>
          <p className="lo-footnote">方案只包含本页装备与目标。导入会替换本页整套记录，不会覆盖工艺台。</p>
          <textarea aria-label="全身装备方案 JSON" value={backupText} onChange={(event) => setBackupText(event.target.value)} rows={5} placeholder="导出后复制保存，或在此粘贴先前保存的 JSON" />
          <div className="lo-actions"><button type="button" className="wb-button" onClick={() => { setBackupText(serializeLoadout(loadout)); setNotice('方案已导出到下方文本框，可复制保存为 JSON。'); }}>导出 JSON</button><button type="button" className="wb-button" disabled={!backupText.trim()} onClick={importBackup}>载入整套方案</button></div>
        </details>
      </div>
      <div className="lo-detail-column">
        <section className="lo-detail-panel" aria-label={`${slotLabel(selected)}装备详情`}>
          <div className="lo-detail-heading"><h3>{slotLabel(selected)}</h3><select aria-label="选择装备栏位" value={selected} onChange={(event) => { if (isLoadoutSlot(event.target.value)) selectSlot(event.target.value); }}>{LOADOUT_SLOTS.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}</select></div>
          {selectedItem ? <>
            {active && <PobItemRepair key={`${selected}:${selectedItem.raw}`} raw={selectedItem.raw} auto
              context={{ state: loadout, slot: selected, raw: selectedItem.raw }} onRepair={(raw) => {
                if (!save(applyPobItemRepair(loadout, selected, selectedItem.raw, raw))) throw new Error('重新识别结果未能保存，请核对装备方案后重试。');
                setNotice(`已核对并修复${slotLabel(selected)}的 PoB 识别，基础属性已重新计入。`);
              }} />}
            <div className={`lo-item-title ${selectedItem.rarity}`}><strong title={selectedItem.name}>{equipmentDisplayName(selectedItem)}</strong><span>{localizeEquipmentName(selectedItem.baseName)}{selectedItem.itemLevel ? ` · 物品等级 ${selectedItem.itemLevel}` : ''}</span>{equipmentDisplayName(selectedItem) !== selectedItem.name && <small>原名：{selectedItem.name}</small>}{!selectedItem.identified && <b>未鉴定 · 词缀未知</b>}</div>
            <div className="lo-item-properties">{selectedItem.properties.map((property, index) => <p key={`${property.name}-${index}`}>{localizeEquipmentProperty(property.text)}</p>)}</div>
            {!!selectedItem.stateText?.length && <p className="lo-footnote">{selectedItem.stateText.join(' · ')}</p>}
            {hasSocketScaling(selectedItem) && selectedItem.sockets && selectedItem.sockets.filled === undefined && <label className="lo-input-label">确认此复制文本的实际镶嵌数<select aria-label="本栏装备实际镶嵌数量" value={knownFilledSockets(loadout, selectedItem) ?? ''} onChange={(event) => {
              const value = event.target.value;
              if (!value) { save({ ...loadout, socketEvidence: loadout.socketEvidence?.filter((entry) => entry.itemText.trim() !== selectedItem.raw.trim()) }); return; }
              const filled = Number(value);
              save({ ...loadout, socketEvidence: recordSocketEvidence(loadout, selectedItem, selectedItem, { beforeFilledSockets: filled, afterFilledSockets: filled }) });
            }}><option value="">尚未确认</option>{Array.from({ length: selectedItem.sockets.count + 1 }, (_, index) => <option key={index} value={index}>{index} / {selectedItem.sockets!.count}</option>)}</select><small>仅补齐当前复制文本的数量；更换镶嵌物后请重新复制装备，避免沿用旧防御面板。</small></label>}
            <ul className="lo-item-mods">{selectedItem.mods.map((mod, index) => <li key={`${mod.key}-${index}`}>{mod.label || mod.text || mod.raw}</li>)}</ul>
            {selectedItem.warnings.length > 0 && <ul className="lo-warnings">{selectedItem.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
            <AffixReferencePanel key={selectedItem.raw} equipment={selectedItem} onSearch={() => onPrice(selectedItem.raw, 'price', selected)} />
            <div className="lo-actions"><button className="wb-button primary" type="button" onClick={() => onPrice(selectedItem.raw, 'price', selected)}><Icon name="search" size={17} />估价这件装备</button><button className="wb-button" type="button" onClick={() => onPrice(selectedItem.raw, 'upgrade', selected)}><Icon name="arrow" size={17} />寻找这件的升级</button></div>
            <p className="lo-footnote">找升级沿用本栏装备和角色优先属性；候选可直接送回此栏比较。价格高低不代表战力提升。</p>
            <div className="lo-item-tools">{onCraft && selectedItem.rarity !== 'unique' && (selectedItem.slot === 'ring' || selectedItem.slot === 'amulet') && <button type="button" className="wb-text-button" disabled={selectedItem.sanctified || selectedItem.raw.includes('[PoB数值待游戏文本核对]')} title={selectedItem.sanctified ? '这件装备已圣化，当前制作规划器不支持继续修改。' : selectedItem.raw.includes('[PoB数值待游戏文本核对]') ? '请先用游戏复制文字核对 PoB 品质与范围词缀，再送入制作策略。' : '从本栏当前装备开始规划制作'} onClick={() => onCraft(selectedItem.raw)}>送入工艺台</button>}<button type="button" className="wb-text-button muted" onClick={() => { if (save(removeSlot(loadout, selected))) { setNotice(`已清空${slotLabel(selected)}。`); setError(''); } }}>移除此栏装备</button><details><summary>原始物品文字</summary><pre>{selectedItem.raw}</pre></details></div>
          </> : <p className="lo-empty">这个栏位尚未放入装备。先选好栏位，再粘贴一件完整物品；两枚戒指和两瓶药剂分别记录。</p>}
          <details className="wb-fold" open={!selectedItem}><summary><Icon name="paste" size={16} />{selectedItem ? '替换此栏装备' : '导入此栏装备'}</summary><label className="lo-input-label" htmlFor="lo-equipment-import">{selectedItem ? '替换此栏装备' : '导入此栏装备'}</label>
          <textarea id="lo-equipment-import" value={importText} onChange={(event) => setImportText(event.target.value)} rows={5} spellCheck={false} placeholder="在游戏内复制物品，粘贴完整文字（支持中 / 英文）" />
          <button type="button" className="wb-button" disabled={!importText.trim()} onClick={() => importToSlot(importText)}>放入{slotLabel(selected)}</button></details>
        </section>
        <BuildAdvicePanel state={loadout} selected={selected} onSearch={() => { if (selectedItem) onPrice(selectedItem.raw, 'upgrade', selected); }} onClear={() => {
          const goals = { ...loadout.goals }; delete goals.build;
          if (goals.mainSkill?.source === 'bd') delete goals.mainSkill;
          if (save({ ...loadout, goals })) setNotice('已清除 BD 方向，保留当前优先属性和抗性目标。');
        }} />
        <details ref={comparisonEntry} className="lo-detail-panel lo-comparison" open={Boolean(candidateText)}><summary><Icon name="equipment" size={17} />比较候选装备 · 替换{slotLabel(selected)}</summary><section aria-label="比较替换装备">
          <div className="lo-detail-heading"><div><span className="wb-eyebrow">候选对照 · 全身抗性约束</span><h3>这件候选，值得换吗？</h3></div><span className="lo-target-slot">替换{slotLabel(selected)}</span></div>
          <label className="lo-input-label" htmlFor="lo-candidate-import">粘贴候选装备</label>
          <textarea id="lo-candidate-import" value={candidateText} onChange={(event) => changeCandidate(event.target.value)} rows={5} spellCheck={false} placeholder="粘贴完整候选物品，自动定位对应栏位；戒指沿用当前选择的左右栏" />
          {candidateText.trim() && !candidate && <p className="lo-alert" role="alert">尚未读到完整候选装备，请检查类别、稀有度和物品名称。</p>}
          {candidate && <SocketComparisonControls before={selectedItem} after={candidate} beforeFilled={beforeFilled} afterFilled={afterFilled}
            onBefore={(filled) => setSocketCounts((old) => ({ ...old, before: selectedItem && filled !== undefined ? { raw: selectedItem.raw, filled } : undefined }))}
            onAfter={(filled) => setSocketCounts((old) => ({ ...old, after: filled !== undefined ? { raw: candidate.raw, filled } : undefined }))}
            onFull={() => setSocketCounts({ before: selectedItem?.sockets ? { raw: selectedItem.raw, filled: selectedItem.sockets.count } : undefined, after: candidate.sockets ? { raw: candidate.raw, filled: candidate.sockets.count } : undefined, scenario: true })} />}
          {candidate && comparison && <>
            {capturedRows && <p className="lo-footnote">沿用本次市场搜索的属性选择与权重。修改装备、主技能、BD 或抗性基准后，会重新生成比较依据。</p>}
            {incoming?.search && !capturedRows && <p className="lo-footnote">角色或目标已变化，原搜索依据已失效；当前按最新装备与技能方向重新比较。</p>}
            <section className="lo-replacement-advice" aria-label="换装结论摘要"><h4>{!comparison.canEquip ? '当前配置不能装备这件候选' : !selectedItem ? `请先导入当前${slotLabel(selected)}` : failedResistances && usesDamageGoal(loadout) ? `${failedResistances}未达上限，暂不推荐更换` : comparison.identical ? '相同装备，无需重复替换' : comparison.paperStatus === 'tradeoff' ? '这件有取舍，不是全面升级' : comparison.paperStatus === 'downgrade' ? '已确认属性下降，建议先保留现装' : comparison.paperStatus === 'upgrade' ? '已确认属性有提升，再核对技能收益与抗性' : comparison.paperStatus === 'equal' ? '已确认属性没有提升' : '有待确认数值，先核对插槽与物品面板'}</h4>
              <p className="lo-footnote">正在比较{slotLabel(selected)}：{selectedItem ? equipmentDisplayName(selectedItem) : '尚未导入'} → {equipmentDisplayName(candidate)}。</p>
              {selectedItem && <ul>{comparison.metrics.filter((metric) => !metric.key.endsWith('Resistance') && !metric.beforeUnknown && !metric.afterUnknown && metric.delta !== 0).map((metric) => <li key={metric.key} className={metric.delta > 0 ? 'positive' : 'negative'}>{metric.label}：{format(metric.before)} → {format(metric.after)}{metric.unit}（{deltaText(metric.delta, metric.unit)}）</li>)}</ul>}
              {!selectedItem ? <p className="lo-footnote">目前只有候选，没有本栏旧装备。请在上方导入当前{slotLabel(selected)}；不会拿其他栏位的装备作比较。</p> : <p className="lo-footnote">{comparison.damageGoal?.gate.status === 'unmet' ? '换装后抗性不达标，不符合你的配装目标。' : comparison.damageGoal?.gate.status === 'unknown' ? '以上是已确认差值；还需补齐四抗基准或镶嵌数量，才能判断是否满足配装目标。' : comparison.damageGoal?.gate.status === 'met' && comparison.damageGoal.damageScore === undefined ? '四抗检查通过，尚未确认伤害提升。按伤害优先目标，先保留现装，不仅凭防御或回复变化认定升级。' : '面板差值不代表主技能 DPS 变化；防御或回复提高不能直接当作伤害升级。'}</p>}
            </section>
            <div className={`lo-verdict ${comparison.damageGoal ? comparison.damageGoal.status === 'rejected' ? 'downgrade' : comparison.damageGoal.status === 'candidate' ? 'upgrade' : 'insufficient' : comparison.status}`}><strong>{comparison.identical ? comparison.title : comparison.damageGoal?.title ?? comparison.title}</strong><span>{comparison.damageGoal ? '四抗封顶 → 伤害优先' : comparison.priorityDirection}</span><p>{comparison.damageGoal ? `${comparison.damageGoal.basis}；最终技能伤害仍需 PoB2 重算。${comparison.damageGoal.gate.notes.join(' ')}` : comparison.reason}</p></div>
            {resistanceCheck && <ResistanceComparisonPanel gate={resistanceCheck} onConfirmCaps={() => save({ ...loadout, goals: { ...loadout.goals, resistanceCaps: { fireResistance: 75, coldResistance: 75, lightningResistance: 75, chaosResistance: 75 } } })} />}
            {comparison.damageGoal && !comparison.identical && <p className="lo-footnote">原始面板对照：<span>{comparison.title}</span>。生命、防御和溢出抗性变化仍列在下表，但不作为伤害目标的加分项。</p>}
            <div className="lo-comparison-names"><span title={selectedItem?.name}>当前：{selectedItem ? equipmentDisplayName(selectedItem) : '空栏位'}</span><span title={candidate.name}>候选：{equipmentDisplayName(candidate)}</span></div>
            {comparison.effects.length > 0 && <details className="lo-uncounted" open={comparison.effects.some((effect) => effect.changed)}><summary>技能与特殊词缀对照 · {comparison.effects.filter((effect) => !effect.changed).length} 项保留 · {comparison.effects.filter((effect) => effect.changed).length} 项变化</summary><ul>{comparison.effects.map((effect) => <li key={effect.key}><strong>{!effect.recognized ? '待识别' : effect.changed ? '发生变化' : '保持一致'}</strong><div className="lo-effects-columns"><div>当前：{effect.before.join('；') || '无此效果'}</div><div>候选：{effect.after.join('；') || '无此效果'}</div></div></li>)}</ul></details>}
            {comparison.warnings.length > 0 && <ul className="lo-warnings">{comparison.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
            <p className="lo-footnote">下表是单件装备贡献，抗性增减不等于角色有效抗性增减；换装结论以整套四抗检查为准。</p>
            <div className="lo-table-scroll"><table className="lo-deltas"><thead><tr><th>单件属性</th><th>当前单件</th><th>候选单件</th><th>贡献变化</th></tr></thead><tbody>{comparison.metrics.map((metric) => <tr key={metric.key}><th>{metric.label}{metric.priority && <small title="玩家优先属性">优先</small>}</th><td>{metric.beforeUnknown ? metric.key.endsWith('Dps') ? '缺少伤害面板' : '待确认镶嵌' : `${format(metric.before)}${metric.unit}`}</td><td>{metric.afterUnknown ? metric.key.endsWith('Dps') ? '缺少伤害面板' : '待确认镶嵌' : `${format(metric.after)}${metric.unit}`}</td><td className={!metric.beforeUnknown && !metric.afterUnknown && metric.delta > 0 ? 'positive' : !metric.beforeUnknown && !metric.afterUnknown && metric.delta < 0 ? 'negative' : ''}>{metric.beforeUnknown || metric.afterUnknown ? '—' : <>{deltaText(metric.delta, metric.unit)}{metric.delta !== 0 && !metric.key.endsWith('Resistance') && metric.relativeDelta !== undefined && <small>（{deltaText(metric.relativeDelta, '%')}）</small>}</>}</td></tr>)}</tbody></table></div>
            {comparison.targets.length > 0 && <div className="lo-target-results"><h4>替换后的全套抗性目标</h4>{comparison.targets.map((target) => <p key={target.key} className={target.met ? 'positive' : 'negative'}>{target.label} {format(target.before)} → {format(target.after)}% / 目标 {target.minimum}% · {target.met ? '达标' : '未达标'}</p>)}</div>}

            <p className="lo-footnote">武器 DPS 来自物品已显示的伤害范围 × 每秒攻击次数，不是技能或流派 DPS。百分比词缀、条件效果和未识别内容不作为零收益。估值不会参与升级判定。</p>
            <div className="lo-actions"><button type="button" className="wb-button primary" disabled={!comparison.canEquip || comparison.sameItemText} onClick={() => importToSlot(candidateText, true)}>{comparison.sameItemText ? '无需替换：相同装备文本' : `采用候选并替换${slotLabel(selected)}`}</button><button type="button" className="wb-button" onClick={() => onPrice(candidate.raw, 'price')}>估价候选</button></div>
          </>}
          {!candidateText && <p className="lo-footnote">对比会同时保留当前装备，只有点击「采用候选」才替换本栏记录。</p>}
        </section></details>
      </div>
    </div>
  </section>;
}
