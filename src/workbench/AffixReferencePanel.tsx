import { useEffect, useRef, useState } from 'react';
import { equipmentMetricDetails, type Equipment } from './genericEquipment';
import { cachedAffixReference, englishReferenceName, readAffixReference, referenceLabel, referenceStat, type AffixReferenceResult } from './affixReference';
import { equipmentPoe2dbLinks } from './poe2dbReference';

/** One shared entry for unresolved text, game facts, and optional search references. */
export default function AffixReferencePanel({ equipment, onReference, onSearch }: {
  equipment: Equipment; onReference?: (result: AffixReferenceResult) => void; onSearch?: () => void;
}) {
  const [result, setResult] = useState(() => cachedAffixReference(equipment));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null), callback = useRef(onReference);
  useEffect(() => { callback.current = onReference; });
  useEffect(() => () => controller.current?.abort(), []);
  const missing = equipment.mods.filter((mod) => !mod.recognized && !mod.searchable);
  const displayOnly = equipment.mods.filter((mod) => mod.recognized && !mod.searchable);
  const effects = equipmentMetricDetails(equipment).effects;
  async function lookup() {
    if (busy) return;
    const task = new AbortController(); controller.current?.abort(); controller.current = task;
    setBusy(true); setError('');
    try {
      const next = await readAffixReference(equipment, task.signal);
      if (task.signal.aborted) return;
      setResult(next); callback.current?.(next);
    } catch (reason) { if (!task.signal.aborted) setError(reason instanceof Error ? reason.message : '英文资料暂不可用。'); }
    finally { if (!task.signal.aborted) setBusy(false); }
  }
  return <details className="wb-fold wb-affix-reference" aria-label="统一词缀资料" onToggle={(event) => {
    if (event.currentTarget.open && !result && !busy && !error && englishReferenceName(equipment)) void lookup();
  }}>
    <summary>词缀资料 · 已识别 {equipment.mods.length - missing.length}/{equipment.mods.length}{missing.length ? ` · ${missing.length} 项待核对` : ''}</summary>
    {effects.length > 0 && <div><strong>{effects.length} 项已识别的条件与特殊效果</strong><ul>{effects.map((effect) => <li key={effect.key}><span>{effect.label}</span><p className="wb-fine">{effect.note}{effect.referenceUrl && <> <a href={effect.referenceUrl} target="_blank" rel="noreferrer">PoE2DB 核对 ↗</a></>}</p></li>)}</ul></div>}
    {missing.length > 0 && <div><strong>待核对的原文</strong>{missing.map((mod) => <p className="wb-fine" key={mod.key}>{mod.label}<br />{mod.warning}</p>)}</div>}
    {displayOnly.length > 0 && <div><strong>已识别但无独立交易条件（{displayOnly.length}）</strong>{displayOnly.map((mod) => <p className="wb-fine" key={mod.key}>{mod.label}<br />{mod.warning}{mod.referenceUrl && <> <a href={mod.referenceUrl} target="_blank" rel="noreferrer">查看资料 ↗</a></>}</p>)}</div>}
    <div className="wb-actions">{equipmentPoe2dbLinks(equipment).map((link) => <a className="wb-link" key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label} ↗</a>)}</div>
    <p className="wb-fine">检索使用原生英文名称和官方属性编号，简体中文仅供显示。资料用于核对缺项，不会覆盖装备的实际数值或自动添加随机传奇词缀。</p>
    <button type="button" className="wb-button" disabled={busy || !englishReferenceName(equipment)} onClick={() => { void lookup(); }}>{busy ? '正在读取英文词缀资料…' : result ? '重新核对英文词缀资料' : '补查英文词缀资料'}</button>
    {error && <p className="wb-inline-warning" role="status">{error}</p>}
    {result && <div><p className="wb-fine">已读取 {result.modifiers.length} 条英文资料 · {result.cached ? '缓存' : '本次查询'}。资料范围不是这件装备的实际掷值；可选条件只要求效果存在。</p><details><summary>查看资料中的 {result.modifiers.length} 条词缀</summary><ul>{result.modifiers.map((entry, index) => {
      const mod = referenceStat(entry);
      const ranges = entry.english.match(/\([+-]?\d+(?:\.\d+)?\s*[—–-]\s*[+-]?\d+(?:\.\d+)?\)/g);
      return <li key={index}><span title={entry.english}>{referenceLabel(entry)}</span>{ranges && !mod.recognized && <small> · 资料范围 {ranges.join(' / ')}</small>}<small> · {mod.searchable ? '可作为可选检索条件' : '尚无已核对的官方交易编号'}</small></li>;
    })}</ul></details>{onReference && <p className="wb-fine">装备缺少的可检索效果已加入“调整搜索条件”，默认不勾选。请核对实际机制后选择。</p>}{onSearch && <button type="button" className="wb-text-button" onClick={onSearch}>用这些资料设置查价条件 →</button>}</div>}
  </details>;
}
