import { useState, type ChangeEvent } from 'react';
import { METRICS, RESISTANCE_KEYS, type LoadoutState, type MetricKey, type ResistanceKey } from './loadout';
import { equipmentSignature, validCharacterPanel, type CharacterPanelSnapshot } from './characterPanel';

interface Props { state: LoadoutState; totals: Record<string, number>; onSave: (snapshot: CharacterPanelSnapshot | undefined) => void }
const fields = METRICS.filter((field) => !['physicalDps', 'elementalDps', 'totalDps'].includes(field.key));
export default function CharacterPanelCalibration({ state, totals, onSave }: Props) {
  const [values, setValues] = useState<Partial<Record<MetricKey, string>>>(() => Object.fromEntries(Object.entries(state.character?.values ?? {}).map(([key, value]) => [key, String(value)])));
  const [caps, setCaps] = useState<Partial<Record<ResistanceKey, string>>>(() => Object.fromEntries(Object.entries(state.character?.caps ?? {}).map(([key, value]) => [key, String(value)])));
  const [itemValues, setItemValues] = useState(state.character?.itemValues);
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
    onSave({ values: parsed, caps: parsedCaps, itemValues, equipmentSignature: equipmentSignature(state.slots), recordedAt: new Date().toISOString() });
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
    <summary>游戏角色面板基准 <span>{state.character ? validCharacterPanel(state) ? '已录入 · 对应当前装备' : '装备已变化 · 需要核对' : '尚未录入'}</span></summary>
    <p className="lo-footnote">装备合计与游戏最终面板是两种口径。天赋、等级、属性、技能和条件效果尚未完整计算；这里记录实际面板，不按简单倍率假装复现游戏。</p>
    <p className="lo-footnote">抗性请填括号中的未封顶总值，例如 75%（189%）填写 189；护甲和闪避填写数值，不填减伤率或闪避概率。基准仅适用于同一套装备和相同游戏状态，天赋或技能变化后也需重新录入。</p>
    <label className="wb-form-label">导入面板记录 JSON<input aria-label="导入角色面板记录" type="file" accept=".json,application/json" onChange={(event) => { void importRecord(event); }} /></label>
    <div className="lo-minimums">{fields.map((field) => <label key={field.key}>{field.label}{RESISTANCE_KEYS.some((key) => key === field.key) ? '未封顶总值' : '游戏面板值'}
      <input aria-label={`角色面板${field.label}`} type="number" step="any" value={values[field.key] ?? ''} placeholder="未录入" onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} /></label>)}</div>
    <h4>游戏中的抗性上限</h4><div className="lo-minimums">{RESISTANCE_KEYS.map((key) => <label key={key}>{METRICS.find((field) => field.key === key)!.label}上限
      <input aria-label={`角色${key}上限`} type="number" value={caps[key] ?? '75'} onChange={(event) => setCaps({ ...caps, [key]: event.target.value })} /></label>)}</div>
    {error && <p className="lo-footnote" role="status">{error}</p>}
    <div className="lo-actions"><button className="wb-button" onClick={save}>保存当前游戏面板基准</button><button className="wb-button" disabled={!state.character} onClick={() => onSave(undefined)}>清除面板基准</button></div>
    {state.character && <div className="lo-table-scroll"><table className="lo-deltas"><thead><tr><th>属性</th><th>装备合计</th><th>游戏物品值</th><th>已录入角色值</th></tr></thead><tbody>
      {fields.filter((field) => state.character!.values[field.key] !== undefined).map((field) => <tr key={field.key}><th>{field.label}</th><td>{totals[field.key] ?? 0}</td><td>{state.character!.itemValues?.[field.key] ?? '—'}</td><td>{state.character!.values[field.key]}</td></tr>)}
    </tbody></table></div>}
  </details>;
}
