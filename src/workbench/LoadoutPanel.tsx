import { useMemo, useState } from 'react';
import { equipmentMetricDetails, localizeEquipmentName, localizeEquipmentProperty, parseEquipment, type Equipment } from './genericEquipment';
import {
  compareCandidate, deserializeLoadout, emptyLoadout, equipRaw, isLoadoutSlot, LOADOUT_SLOTS,
  LOADOUT_STORAGE_KEY, loadoutTotals, loadoutWarnings, METRICS, removeSlot, RESISTANCE_KEYS,
  serializeLoadout, slotLabel, type LoadoutSlot, type LoadoutState, type MetricKey,
} from './loadout';
import './loadout.css';
import CharacterPanelCalibration from './CharacterPanelCalibration';
import PobImportPanel from './PobImportPanel';
import { validCharacterPanel } from './characterPanel';

export interface LoadoutPanelProps {
  onPrice: (raw: string, intent?: 'price' | 'upgrade') => void;
  onCraft?: (raw: string) => void;
  league?: string;
}

function readSaved(): LoadoutState {
  try { return deserializeLoadout(localStorage.getItem(LOADOUT_STORAGE_KEY) ?? '').state ?? emptyLoadout(); }
  catch { return emptyLoadout(); }
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

export default function LoadoutPanel({ onPrice, onCraft, league }: LoadoutPanelProps) {
  const [loadout, setLoadout] = useState<LoadoutState>(readSaved);
  const [selected, setSelected] = useState<LoadoutSlot>('mainHand');
  const [importText, setImportText] = useState('');
  const [candidateText, setCandidateText] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [backupText, setBackupText] = useState('');
  const selectedItem = useMemo(() => parseEquipment(loadout.slots[selected] ?? ''), [loadout.slots, selected]);
  const candidate = useMemo(() => parseEquipment(candidateText), [candidateText]);
  const comparison = useMemo(() => candidate ? compareCandidate(loadout, selected, candidate) : null, [candidate, loadout, selected]);
  const totals = useMemo(() => loadoutTotals(loadout), [loadout]);
  const warnings = useMemo(() => loadoutWarnings(loadout), [loadout]);
  const selectedDetails = useMemo(() => selectedItem ? equipmentMetricDetails(selectedItem) : null, [selectedItem]);
  const equippedCount = Object.keys(loadout.slots).length;

  function save(next: LoadoutState) {
    setLoadout(next);
    try { localStorage.setItem(LOADOUT_STORAGE_KEY, serializeLoadout(next)); setStorageError(''); }
    catch { setStorageError('浏览器未能保存此方案；关闭页面前请导出 JSON。'); }
  }
  function selectSlot(slot: LoadoutSlot) {
    setSelected(slot); setImportText(''); setCandidateText(''); setError(''); setNotice('');
  }
  function importToSlot(raw: string, fromCandidate = false) {
    const result = equipRaw(loadout, selected, raw);
    if (!result.ok) { setError(result.error); setNotice(''); return; }
    save(result.state); setError(''); setNotice(`已将「${result.item.name}」放入${slotLabel(selected)}。`);
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
    save(result.state); setError(''); setCandidateText(''); setImportText('');
    setNotice('已载入全身装备方案。工艺台装备不受影响。');
  }
  function renderSlot(slot: typeof LOADOUT_SLOTS[number]) {
    const item = parseEquipment(loadout.slots[slot.id] ?? '');
    return <button type="button" key={slot.id} className={`lo-slot lo-slot-${slot.id}${selected === slot.id ? ' selected' : ''}${item ? ` equipped ${item.rarity}` : ''}`}
      aria-pressed={selected === slot.id} aria-label={`${slot.label}：${item?.name ?? '未装备'}`} onClick={() => selectSlot(slot.id)}>
      <span className="lo-slot-label">{slot.label}</span>
      <span className="lo-slot-art"><EquipmentArt item={item} kind={slot.kind} /></span>
      <strong>{item?.name ?? '点击导入'}</strong>
      {item && <small>{!item.identified ? '未鉴定' : localizeEquipmentName(item.baseName)}</small>}
    </button>;
  }

  return <section className="wb-loadout" aria-label="角色全身装备">
    <div className="lo-heading">
      <div><span className="wb-eyebrow">CHARACTER EQUIPMENT</span><h2>我的全身装备</h2><p>按游戏栏位保存整套装备，选一件估价，再把候选放在旁边比较。</p></div>
      <div className="lo-save-status"><span>{league ?? '当前联盟'} · {equippedCount} 件</span><small>独立保存在此浏览器</small></div>
    </div>
    {(storageError || error) && <p className="lo-alert" role="alert">{error || storageError}</p>}
    {notice && <p className="lo-notice" role="status">{notice}</p>}
    <div className="lo-layout">
      <div className="lo-inventory-column">
        <div className="lo-character" aria-label="装备栏位">
          <svg className="lo-silhouette" viewBox="0 0 200 440" fill="none" aria-hidden="true"><path d="M80 48c0-35 40-35 40 0l-8 24 20 12 25 82 17 93-16 8-25-84-10-23 9 92-10 75 8 102h-25l-5-102-5 102H70l8-102-10-75 9-92-10 23-25 84-16-8 17-93 25-82 20-12z" /><path d="m70 94 30 42 30-42M76 160l24 22 24-22M72 243h56M100 136v107M78 280l22-27 22 27" /></svg>
          {LOADOUT_SLOTS.filter((slot) => !slot.id.startsWith('flask') && !slot.id.startsWith('charm')).map(renderSlot)}
          <div className="lo-board-note">点击栏位<br />粘贴游戏物品文字</div>
        </div>
        <div className="lo-consumables" aria-label="药剂与护符栏位">{LOADOUT_SLOTS.filter((slot) => slot.id.startsWith('flask') || slot.id.startsWith('charm')).map(renderSlot)}</div>
        <p className="lo-footnote">药剂与护符为记录栏，效果不加入常驻属性。可用护符栏位、唯一装备限制、属性需求和特殊天赋请在游戏内核对。</p>
        {warnings.length > 0 && <ul className="lo-warnings">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
        <div className="lo-summary">
          <h3>装备贡献合计（非角色面板）</h3>
          <p className="lo-footnote">下列生命、护盾、护甲等属于装备贡献；角色最终面板请在下方录入，不能直接按同一数值比较。</p>
          <div className="lo-total-grid">{METRICS.filter((metric) => !metric.key.endsWith('Dps') && ((totals[metric.key] ?? 0) !== 0 || RESISTANCE_KEYS.some((key) => key === metric.key) || metric.key === 'life')).map((metric) => <div key={metric.key}><span>{metric.label}</span><strong>{format(totals[metric.key] ?? 0)}{metric.unit}</strong></div>)}</div>
          <p className="lo-footnote">只合计可直接读取的数值，不含天赋、技能、剧情抗性惩罚、条件效果和百分比生命/防御缩放；这不是角色面板。武器 DPS 分件比较。</p>
        </div>
        <CharacterPanelCalibration key={loadout.character?.recordedAt ?? 'unrecorded'} state={loadout} totals={totals} onSave={(character) => {
          save({ ...loadout, character }); setNotice(character ? '游戏面板已记录。换装时比较有效抗性，生命与防御仍只列出装备差值。' : '已清除游戏面板基准。');
        }} />
        <details className="lo-goals">
          <summary>设置升级目标 <span>{loadout.goals.priorities.length} 项优先属性</span></summary>
          <p className="lo-footnote">优先属性单独标出，不将生命、抗性或武器 DPS 换算成一个虚构的战力分数。</p>
          <div className="lo-priorities">{METRICS.map((metric) => <label key={metric.key}><input type="checkbox" checked={loadout.goals.priorities.includes(metric.key)} onChange={(event) => setPriority(metric.key, event.target.checked)} />{metric.label}</label>)}</div>
          <h4>{validCharacterPanel(loadout) ? '角色未封顶总抗性下限' : '装备合计抗性下限'}</h4>
          <div className="lo-minimums">{RESISTANCE_KEYS.map((key) => <label key={key}>{METRICS.find((metric) => metric.key === key)!.label}<input aria-label={`${METRICS.find((metric) => metric.key === key)!.label}装备目标`} type="number" min={-200} max={1000} placeholder="不限制" value={loadout.goals.minimums[key] ?? ''} onChange={(event) => {
            const minimums = { ...loadout.goals.minimums };
            if (!event.target.value) delete minimums[key];
            else { const value = Number(event.target.value); if (!Number.isFinite(value) || value < -200 || value > 1000) return; minimums[key] = value; }
            save({ ...loadout, goals: { ...loadout.goals, minimums } });
          }} /></label>)}</div>
          <p className="lo-footnote">已校准时按角色未封顶总抗性判断；未校准时仅按装备合计判断，需自行考虑剧情惩罚、天赋及抗性余量。</p>
        </details>
        <PobImportPanel onImport={(slots) => {
          save({ ...loadout, slots, character: undefined }); setError(''); setCandidateText(''); setImportText('');
          setNotice('已导入所选 PoB2 装备组，原角色面板基准已清除。请核对预览中的未解析效果。');
        }} />
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
            <div className={`lo-item-title ${selectedItem.rarity}`}><strong>{selectedItem.name}</strong><span>{localizeEquipmentName(selectedItem.baseName)}{selectedItem.itemLevel ? ` · 物品等级 ${selectedItem.itemLevel}` : ''}</span>{!selectedItem.identified && <b>未鉴定 · 词缀未知</b>}</div>
            <div className="lo-item-properties">{selectedItem.properties.map((property, index) => <p key={`${property.name}-${index}`}>{localizeEquipmentProperty(property.text)}</p>)}</div>
            <ul className="lo-item-mods">{selectedItem.mods.map((mod, index) => <li key={`${mod.key}-${index}`}>{mod.label || mod.text || mod.raw}</li>)}</ul>
            {selectedItem.warnings.length > 0 && <ul className="lo-warnings">{selectedItem.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
            {selectedDetails && selectedDetails.uncounted.length > 0 && <details className="lo-uncounted"><summary>{selectedDetails.uncounted.length} 条词缀未计入简化加总</summary><ul>{selectedDetails.uncounted.map((line, index) => <li key={index}>{line}</li>)}</ul></details>}
            <div className="lo-actions"><button className="wb-button primary" type="button" onClick={() => onPrice(selectedItem.raw, 'price')}>估价这件装备</button><button className="wb-button" type="button" onClick={() => onPrice(selectedItem.raw, 'upgrade')}>寻找这件的升级</button></div>
            <p className="lo-footnote">找升级会打开此装备的官方交易查询；将市场候选复制到下面，与当前栏位比较。价格高低不代表战力提升。</p>
            <div className="lo-item-tools">{onCraft && selectedItem.rarity !== 'unique' && (selectedItem.slot === 'ring' || selectedItem.slot === 'amulet') && <button type="button" className="wb-text-button" onClick={() => onCraft(selectedItem.raw)}>送入工艺台</button>}<button type="button" className="wb-text-button muted" onClick={() => { save(removeSlot(loadout, selected)); setNotice(`已清空${slotLabel(selected)}。`); setError(''); }}>移除此栏装备</button><details><summary>原始物品文字</summary><pre>{selectedItem.raw}</pre></details></div>
          </> : <p className="lo-empty">这个栏位尚未放入装备。先选好栏位，再粘贴一件完整物品；两枚戒指和两瓶药剂分别记录。</p>}
          <label className="lo-input-label" htmlFor="lo-equipment-import">{selectedItem ? '替换此栏装备' : '导入此栏装备'}</label>
          <textarea id="lo-equipment-import" value={importText} onChange={(event) => setImportText(event.target.value)} rows={5} spellCheck={false} placeholder="在游戏内复制物品，粘贴完整文字（支持中 / 英文）" />
          <button type="button" className="wb-button" disabled={!importText.trim()} onClick={() => importToSlot(importText)}>放入{slotLabel(selected)}</button>
        </section>
        <section className="lo-detail-panel lo-comparison" aria-label="比较替换装备">
          <div className="lo-detail-heading"><div><span className="wb-eyebrow">COMPARE REPLACEMENT</span><h3>这件候选，值得换吗？</h3></div><span className="lo-target-slot">替换{slotLabel(selected)}</span></div>
          <label className="lo-input-label" htmlFor="lo-candidate-import">粘贴候选装备</label>
          <textarea id="lo-candidate-import" value={candidateText} onChange={(event) => setCandidateText(event.target.value)} rows={5} spellCheck={false} placeholder="从游戏或交易页面复制同栏位的候选物品" />
          {candidateText.trim() && !candidate && <p className="lo-alert" role="alert">尚未读到完整候选装备，请检查类别、稀有度和物品名称。</p>}
          {candidate && comparison && <>
            <div className={`lo-verdict ${comparison.status}`}><strong>{comparison.title}</strong><span>{comparison.priorityDirection}</span><p>{comparison.reason}</p></div>
            <div className="lo-comparison-names"><span>当前：{selectedItem?.name ?? '空栏位'}</span><span>候选：{candidate.name}</span></div>
            {comparison.warnings.length > 0 && <ul className="lo-warnings">{comparison.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
            <div className="lo-table-scroll"><table className="lo-deltas"><thead><tr><th>纸面属性</th><th>当前</th><th>候选</th><th>变化</th></tr></thead><tbody>{comparison.metrics.map((metric) => <tr key={metric.key}><th>{metric.label}{metric.priority && <small title="玩家优先属性">优先</small>}</th><td>{format(metric.before)}{metric.unit}</td><td>{format(metric.after)}{metric.unit}</td><td className={metric.delta > 0 ? 'positive' : metric.delta < 0 ? 'negative' : ''}>{deltaText(metric.delta, metric.unit)}</td></tr>)}</tbody></table></div>
            {comparison.characterResistances.length > 0 && <div className="lo-target-results"><h4>角色有效抗性与溢出（局部估算）</h4>{comparison.characterResistances.map((resistance) => <p key={resistance.key}>
              {METRICS.find((metric) => metric.key === resistance.key)!.label}：有效 {format(resistance.effectiveBefore)}% → {format(resistance.effectiveAfter)}%；总值 {format(resistance.before)}% → {format(resistance.after)}%；溢出 {format(resistance.overflowBefore)}% → {format(resistance.overflowAfter)}%
            </p>)}</div>}
            {comparison.targets.length > 0 && <div className="lo-target-results"><h4>替换后的全套抗性目标</h4>{comparison.targets.map((target) => <p key={target.key} className={target.met ? 'positive' : 'negative'}>{target.label} {format(target.before)} → {format(target.after)}% / 目标 {target.minimum}% · {target.met ? '达标' : '未达标'}</p>)}</div>}
            {(comparison.uncountedBefore.length > 0 || comparison.uncountedAfter.length > 0) && <details className="lo-uncounted"><summary>无法加总的效果 · 请逐条核对</summary><div className="lo-effects-columns"><div><h4>当前装备</h4><ul>{comparison.uncountedBefore.length ? comparison.uncountedBefore.map((line, index) => <li key={index}>{line}</li>) : <li>无额外已读取词缀</li>}</ul></div><div><h4>候选装备</h4><ul>{comparison.uncountedAfter.length ? comparison.uncountedAfter.map((line, index) => <li key={index}>{line}</li>) : <li>无额外已读取词缀</li>}</ul></div></div></details>}
            <p className="lo-footnote">武器 DPS 来自物品已显示的伤害范围 × 每秒攻击次数，不是技能或流派 DPS。百分比词缀、条件效果和未识别内容不作为零收益。估值不会参与升级判定。</p>
            <div className="lo-actions"><button type="button" className="wb-button primary" disabled={!comparison.canEquip} onClick={() => importToSlot(candidateText, true)}>采用候选并替换{slotLabel(selected)}</button><button type="button" className="wb-button" onClick={() => onPrice(candidate.raw, 'price')}>估价候选</button></div>
          </>}
          {!candidateText && <p className="lo-footnote">对比会同时保留当前装备，只有点击「采用候选」才替换本栏记录。</p>}
        </section>
      </div>
    </div>
  </section>;
}
