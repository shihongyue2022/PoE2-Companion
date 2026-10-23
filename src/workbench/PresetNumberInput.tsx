import { useState } from 'react';
import './presetControls.css';

export interface NumberPreset { value: string; label: string }
/** Store the actual value, so changing display tiers never changes query semantics. */
export default function PresetNumberInput({ label, caption, value, onChange, presets, automaticLabel = '自动／不限制', unit = '', min, max, disabled }: {
  label: string; value: string; onChange: (value: string) => void; presets: readonly NumberPreset[];
  caption?: string; automaticLabel?: string; unit?: string; min?: number; max?: number; disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const selected = value === '' ? '' : presets.some((entry) => entry.value === value) ? value : 'custom';
  return <div className="wb-number-preset"><div className="wb-preset-label"><span>{caption ?? label}</span><select aria-label={`${label}档位`} value={editing ? 'custom' : selected} disabled={disabled} onChange={(event) => {
    if (event.target.value === 'custom') setEditing(true);
    else { setEditing(false); onChange(event.target.value); }
  }}><option value="">{automaticLabel}</option>{presets.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}{unit && ` ${unit}`}</option>)}<option value="custom">{selected === 'custom' ? `当前值：${value}${unit}` : '自定义精确数值'}</option></select></div>
    <details open={editing} onToggle={(event) => setEditing(event.currentTarget.open)}><summary>精确数值（高级）</summary><input aria-label={label} type="number" min={min} max={max} step="any" value={value} disabled={disabled} placeholder={automaticLabel} onChange={(event) => onChange(event.target.value)} /></details>
  </div>;
}
export const budgetPresets = (values: readonly number[]) => values.map((value) => ({ value: String(value), label: String(value) }));
