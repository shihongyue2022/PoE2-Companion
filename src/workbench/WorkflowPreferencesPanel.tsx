import type { LoadoutState } from './loadout';
import { LOADOUT_SLOTS } from './loadout';
import { applyDefaultWorkflow, protectedUnique, workflowPreferences, type WorkflowPreferences } from './workflowPreferences';
import { parseEquipment } from './genericEquipment';
import PresetNumberInput, { budgetPresets } from './PresetNumberInput';

export default function WorkflowPreferencesPanel({ state, onSave }: { state: LoadoutState; onSave: (state: LoadoutState) => boolean }) {
  const preferences = workflowPreferences(state);
  const update = (value: Partial<WorkflowPreferences>) => onSave({ ...state, goals: { ...state.goals, workflow: { ...preferences, ...value } } });
  return <details className="sr-source wf-preferences"><summary>配装规则 · {preferences.encounter === 'boss-sustained' ? 'Boss 持续' : preferences.encounter === 'boss-burst' ? 'Boss 爆发' : '清图'} · {preferences.replacement === 'pair' ? '联动两件' : preferences.replacement === 'single' ? '只换一件' : '整套规划'} · {preferences.budget ?? '不限'}{preferences.budget ? preferences.currency === 'divine' ? ' 神圣' : ' 崇高' : ''}</summary>
    <div className="wf-settings"><label>输出场景<select aria-label="输出场景" value={preferences.encounter} onChange={(event) => update({ encounter: event.target.value as WorkflowPreferences['encounter'] })}><option value="boss-sustained">Boss 持续输出</option><option value="boss-burst">Boss 爆发</option><option value="mapping">清图</option></select></label>
      <label>换装范围<select aria-label="默认换装范围" value={preferences.replacement} onChange={(event) => update({ replacement: event.target.value as WorkflowPreferences['replacement'] })}><option value="single">只换一件</option><option value="pair">联动换两件</option><option value="loadout">整套规划</option></select></label>
      <PresetNumberInput label="总购买预算" value={preferences.budget === undefined ? '' : String(preferences.budget)} onChange={(value) => update({ budget: value === '' ? undefined : Number(value) })} min={0} automaticLabel="不限预算" presets={budgetPresets([5, 10, 25, 50, 100, 500])} />
      <label>预算通货<select aria-label="总预算通货" value={preferences.currency} onChange={(event) => update({ currency: event.target.value as WorkflowPreferences['currency'] })}><option value="divine">神圣石</option><option value="exalted">崇高石</option></select></label>
    </div>
    <p className="lo-footnote">四抗约束最终整套；旧装备卖出前不抵扣购买成本。辅助保留导入配置。场景与覆盖状态会记录为验证条件，尚未接入完整 PoB 计算，不据此虚增伤害。</p>
    <div className="wf-settings">{(['whirlwind', 'ignitedGround'] as const).map((key) => <label key={key}>{key === 'whirlwind' ? '旋风效果' : '燃烧地面'}<select aria-label={key === 'whirlwind' ? '旋风效果覆盖' : '燃烧地面覆盖'} value={preferences.conditions[key] ?? ''} onChange={(event) => update({ conditions: { ...preferences.conditions, [key]: event.target.value || undefined } })}><option value="">待确认</option><option value="always">常驻</option><option value="sometimes">偶尔</option><option value="off">不用</option></select></label>)}</div>
    <details><summary>传奇机制保护</summary><p className="lo-footnote">默认保留已穿传奇的身份与独有机制，允许同名传奇更好 roll。需要换成其他装备时，在这里解除对应部位保护。</p>
      {LOADOUT_SLOTS.filter((slot) => parseEquipment(state.slots[slot.id] ?? '')?.rarity === 'unique').map((slot) => <label className="wb-check" key={slot.id}><input type="checkbox" checked={!!protectedUnique(state, slot.id)} onChange={(event) => update({ unlockedSlots: event.target.checked ? preferences.unlockedSlots.filter((entry) => entry !== slot.id) : [...preferences.unlockedSlots, slot.id] })} />{slot.label} · 保留同名传奇</label>)}</details>
    <button type="button" className="wb-text-button" onClick={() => onSave(applyDefaultWorkflow(state))}>应用默认流程与三技能组合</button>
  </details>;
}
