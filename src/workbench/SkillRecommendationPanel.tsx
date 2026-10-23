import { mainSkillChoices, skillPlan, type MainSkillSelection } from './skillRecommendation';
import type { LoadoutState } from './loadout';
import SkillGemButton from './SkillGemButton';
import SkillLinkPicker from './SkillLinkPicker';
import { IconButton } from './WorkbenchIcon';
import './characterAnalysis.css';

export default function SkillRecommendationPanel({ state, onSave, onInspect }: { state: LoadoutState; onSave: (state: LoadoutState) => boolean; onInspect?: (selection: MainSkillSelection, focusSupport?: { name: string; label: string }) => void }) {
  const plan = skillPlan(state), choices = mainSkillChoices(state);
  const selected = state.goals.mainSkill;
  const selectedKey = selected ? choices.find((choice) => choice.selection.source === selected.source && (selected.source === 'bd' || choice.selection.setId === selected.setId && choice.selection.group === selected.group && choice.selection.id === selected.id && choice.selection.name === selected.name))?.key ?? 'stale' : '';
  const inspection = selected ?? (plan?.key === 'bd' ? { source: 'bd' as const } : choices.find((choice) => choice.key.startsWith(plan?.key ?? 'missing') && choice.selection.name === plan?.name)?.selection);
  return <section className="lo-summary" aria-label="主输出与智能配装">
    <h3>智能配装 · {plan?.label ?? '先确认主输出技能'}</h3>
    <div className="sg-main-line">{plan && <SkillGemButton name={plan.name} label={plan.label} ariaLabel="查阅当前主技能" onClick={() => { if (inspection) onInspect?.(inspection); }} />}<label className="sg-main-select"><span className="sg-sr-only">主要输出技能</span><select aria-label="智能配装主输出技能" value={selectedKey} onChange={(event) => {
      const selection = choices.find((choice) => choice.key === event.target.value)?.selection;
      onSave({ ...state, goals: { ...state.goals, mainSkill: selection } });
    }}><option value="">自动：已采用 BD → PoB2 主技能</option>{choices.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
      {selectedKey && !choices.some((choice) => choice.key === selectedKey) && <option value={selectedKey}>原技能已变化，请重新选择</option>}
    </select></label>
    {onInspect && inspection && <IconButton icon="search" label="查看增伤词缀与部位" onClick={() => onInspect(inspection)} />}</div>
    {plan ? <><div className="sg-support-strip" role="group" aria-label="主输出辅助">{plan.supports.map((support) => <SkillGemButton key={support.name} name={support.name} label={support.label} support onClick={() => { if (inspection) onInspect?.(inspection, support); }} />)}</div>
      {inspection && <SkillLinkPicker state={state} selection={inspection} name={plan.name} onChange={(selection) => onSave({ ...state, goals: { ...state.goals, mainSkill: selection } })} />}
      <p className="lo-footnote">选主输出 → 确认联动 → 点击放大镜找增伤装备。四抗按整套约束。</p>
      <details><summary>为什么推荐这些属性</summary><p className="lo-footnote">辅助：{plan.supports.map((support) => support.label).join('、') || '没有已确认的辅助记录'}。</p>{plan.priorities.map((priority) => <p key={priority.family} className="lo-footnote">{priority.reason}</p>)}
        {plan.notes.map((note) => <p key={note} className="lo-footnote">{note}</p>)}
        <p className="lo-footnote">潜在词缀来自当前底座规则词池。按 T1 量尺比较属性方向，仍需 PoB2 重算实际技能 DPS、转伤、触发、异常及条件覆盖率。</p>
      </details>{plan.warnings.map((warning) => <p key={warning} className="lo-alert">{warning}</p>)}</> : <p className="lo-footnote">请补读 PoB2 技能或采用本机 BD，确认主输出后自动生成配装方向。停用和另一套武器的技能不会被静默选中。</p>}
  </section>;
}
