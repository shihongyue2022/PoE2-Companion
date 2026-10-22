import { mainSkillChoices, skillPlan } from './skillRecommendation';
import type { LoadoutState } from './loadout';

export default function SkillRecommendationPanel({ state, onSave }: { state: LoadoutState; onSave: (state: LoadoutState) => boolean }) {
  const plan = skillPlan(state), choices = mainSkillChoices(state);
  const selectedKey = state.goals.mainSkill ? state.goals.mainSkill.source === 'bd' ? 'bd' : `pob:${state.goals.mainSkill.setId}:${state.goals.mainSkill.group}` : '';
  return <section className="lo-summary" aria-label="主输出与智能配装">
    <h3>智能配装 · {plan?.label ?? '先确认主输出技能'}</h3>
    <label>主要输出技能<select aria-label="智能配装主输出技能" value={selectedKey} onChange={(event) => {
      const selection = choices.find((choice) => choice.key === event.target.value)?.selection;
      onSave({ ...state, goals: { ...state.goals, mainSkill: selection } });
    }}><option value="">自动：已采用 BD → PoB2 主技能</option>{choices.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
      {selectedKey && !choices.some((choice) => choice.key === selectedKey) && <option value={selectedKey}>原技能已变化，请重新选择</option>}
    </select></label>
    {plan ? <><p className="lo-footnote">依据：{plan.source}。四抗封顶后，按主输出、辅助组合和参考 BD 的发展方向找潜在升级，不限于旧装备已有词缀。</p>
      <details><summary>为什么推荐这些属性</summary><p className="lo-footnote">辅助：{plan.supports.map((support) => support.label).join('、') || '没有已确认的辅助记录'}。</p>{plan.priorities.map((priority) => <p key={priority.family} className="lo-footnote">{priority.reason}</p>)}
        {plan.notes.map((note) => <p key={note} className="lo-footnote">{note}</p>)}
        <p className="lo-footnote">潜在词缀来自当前底座规则词池。按 T1 量尺比较属性方向，仍需 PoB2 重算实际技能 DPS、转伤、触发、异常及条件覆盖率。</p>
      </details>{plan.warnings.map((warning) => <p key={warning} className="lo-alert">{warning}</p>)}</> : <p className="lo-footnote">请补读 PoB2 技能或采用本机 BD，确认主输出后自动生成配装方向。停用和另一套武器的技能不会被静默选中。</p>}
  </section>;
}
