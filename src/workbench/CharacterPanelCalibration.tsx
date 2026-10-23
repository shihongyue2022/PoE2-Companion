import { useState, type ChangeEvent } from 'react';
import { METRICS, RESISTANCE_KEYS, type LoadoutState, type MetricKey, type ResistanceKey } from './loadout';
import { equipmentSignature, validCharacterPanel, type CharacterPanelSnapshot } from './characterPanel';
import { resistanceBaseline } from './resistanceModel';
import PresetNumberInput, { budgetPresets } from './PresetNumberInput';
import { activeWeaponSet } from './weaponSets';
import { sourceIsCurrent } from './loadoutIntegration';

interface Props { state: LoadoutState; totals: Record<string, number>; onSave: (snapshot: CharacterPanelSnapshot | undefined) => void }
const fields = METRICS.filter((field) => !['physicalDps', 'elementalDps', 'totalDps'].includes(field.key));
export default function CharacterPanelCalibration({ state, totals, onSave }: Props) {
  const measured = validCharacterPanel(state) ? state.character : undefined;
  const reference = measured ?? (sourceIsCurrent(state) ? state.source?.reference : undefined);
  const baseline = resistanceBaseline(state);
  const [values, setValues] = useState<Partial<Record<MetricKey, string>>>(() => Object.fromEntries(Object.entries({ ...reference?.values, ...baseline.values }).map(([key, value]) => [key, String(value)])));
  const [caps, setCaps] = useState<Partial<Record<ResistanceKey, string>>>(() => Object.fromEntries(Object.entries({ ...reference?.caps, ...baseline.caps, ...state.goals.resistanceCaps }).map(([key, value]) => [key, String(value)])));
  const [itemValues, setItemValues] = useState(measured?.itemValues);
  const [error, setError] = useState('');
  function save() {
    const parsed: CharacterPanelSnapshot['values'] = {}, parsedCaps: CharacterPanelSnapshot['caps'] = {};
    for (const field of fields) {
      const text = values[field.key]?.trim();
      if (!text) continue;
      const value = Number(text);
      if (!Number.isFinite(value) || value < -200 || value > 1e9) { setError(`${field.label}数值无效。`); return; }
      parsed[field.key] = value;
    }
    if (!Object.keys(parsed).length) { setError('请先录入至少一项游戏面板值。'); return; }
    for (const key of RESISTANCE_KEYS) {
      const value = caps[key]?.trim() ? Number(caps[key]) : 75;
      if (!Number.isFinite(value) || value < 0 || value > 100) { setError('抗性上限需在 0～100 之间。'); return; }
      parsedCaps[key] = value;
    }
    onSave({ values: parsed, caps: parsedCaps, itemValues, weaponSet: activeWeaponSet(state), equipmentSignature: equipmentSignature(state.slots), recordedAt: new Date().toISOString() });
    setError('');
  }
  async function importRecord(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 32_768) throw new Error('面板记录文件过大。');
      const value = JSON.parse(await file.text()) as { values?: Record<string, unknown>; caps?: Record<string, unknown>; itemValues?: Record<string, unknown> };
      if (!value.values || typeof value.values !== 'object') throw new Error('文件需包含 values 面板数值。');
      const read = (source: Record<string, unknown>) => Object.fromEntries(Object.entries(source).filter(([, number]) => typeof number === 'number' && Number.isFinite(number)).map(([key, number]) => [key, String(number)]));
      setValues(read(value.values)); setCaps(read(value.caps ?? {}));
      setItemValues(value.itemValues ? Object.fromEntries(Object.entries(value.itemValues).filter(([, number]) => typeof number === 'number' && Number.isFinite(number))) : undefined);
      setError('记录已填入；请确认对应当前游戏装备，再保存基准。');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '无法读取面板记录。'); }
    event.target.value = '';
  }
  return <details className="lo-goals lo-calibration">
    <summary>游戏角色面板基准 <span>{state.character ? validCharacterPanel(state) ? '已录入 · 对应当前装备' : '原面板快照 · 四抗见整套检查' : '尚未录入'}</span></summary>
    <p className="lo-footnote">装备合计与游戏最终面板是两种口径。天赋、等级、属性、技能和条件效果尚未完整计算；这里记录实际面板，不按简单倍率假装复现游戏。</p>
    <p className="lo-footnote">已自动带入对应当前装备的 PoB2／游戏基准，以及可计算的累计抗性。先核对下方摘要、选择抗性上限；只有数值不符时才展开更正。保存表示你确认它们对应当前游戏状态。</p>
    <div className="lo-auto-panel-values">{fields.filter((field) => values[field.key] !== undefined).map((field) => <span key={field.key}>{field.label}：<strong>{values[field.key]}{field.unit}</strong>{RESISTANCE_KEYS.some((key) => key === field.key) && '（未封顶总值）'}</span>)}</div>
    {!Object.keys(values).length && <p className="lo-footnote">尚无可带入的角色总值，请先更新 PoB2；无需逐项填写。游戏面板无法由装备合计直接代替。</p>}
    <h4>抗性上限档位</h4><div className="lo-minimums">{RESISTANCE_KEYS.map((key) => <PresetNumberInput key={key} label={`角色${METRICS.find((field) => field.key === key)!.label}上限`} caption={`${METRICS.find((field) => field.key === key)!.label}上限`} value={caps[key] ?? ''} min={0} max={100} automaticLabel="标准 75%（确认后使用）" unit="%" presets={budgetPresets([0, ...Array.from({ length: 16 }, (_, i) => 75 + i), 100])} onChange={(value) => setCaps({ ...caps, [key]: value })} />)}</div>
    <details><summary>更正面板数值／导入记录（高级）</summary>
    <p className="lo-footnote">抗性使用括号中的未封顶总值，例如 75%（189%）取 189；护甲和闪避取数值，不取减伤率或闪避概率。生命、防御和技能伤害不会根据换装比例猜算。</p>
    {state.source?.reference && sourceIsCurrent(state) && <button type="button" className="wb-button" onClick={() => {
      const reference = state.source!.reference!;
      setValues((old) => ({ ...old, ...Object.fromEntries(Object.entries(reference.values).map(([key, value]) => [key, String(value)])) }));
      setCaps((old) => ({ ...old, ...Object.fromEntries(Object.entries(reference.caps).map(([key, value]) => [key, String(value)])) }));
      setError('已带入 PoB2 中可核对的角色总值。缺项请先更新并重新读取 PoB2；上限按档位确认，数值不符时再展开高级更正。');
    }}>填入可核对的 PoB2 面板值</button>}
    <label className="wb-form-label">导入面板记录 JSON<input aria-label="导入角色面板记录" type="file" accept=".json,application/json" onChange={(event) => { void importRecord(event); }} /></label>
    <div className="lo-minimums">{fields.map((field) => <label key={field.key}>{field.label}{RESISTANCE_KEYS.some((key) => key === field.key) ? '未封顶总值' : '游戏面板值'}
      <input aria-label={`角色面板${field.label}`} type="number" step="any" value={values[field.key] ?? ''} placeholder="未录入" onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} /></label>)}</div>
    </details>
    {error && <p className="lo-footnote" role="status">{error}</p>}
    <div className="lo-actions"><button className="wb-button" onClick={save}>保存当前游戏面板基准</button><button className="wb-button" disabled={!state.character} onClick={() => onSave(undefined)}>清除面板基准</button></div>
    {state.character && <div className="lo-table-scroll"><table className="lo-deltas"><thead><tr><th>属性</th><th>装备合计</th><th>游戏物品值</th><th>已录入角色值</th></tr></thead><tbody>
      {fields.filter((field) => state.character!.values[field.key] !== undefined).map((field) => <tr key={field.key}><th>{field.label}</th><td>{totals[field.key] ?? 0}</td><td>{state.character!.itemValues?.[field.key] ?? '—'}</td><td>{state.character!.values[field.key]}</td></tr>)}
    </tbody></table></div>}
  </details>;
}
