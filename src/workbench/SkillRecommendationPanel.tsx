import { useState, type DragEvent, type ReactNode } from 'react';
import { skillPlan, type MainSkillSelection } from './skillRecommendation';
import type { LoadoutState } from './loadout';
import SkillGemButton, { SkillGemArt } from './SkillGemButton';
import { IconButton } from './WorkbenchIcon';
import { gemInfo, mainGem } from './pobCombat';
import { routineSkillChoices, setSkillRoutine, skillSelectionKey, twisterRoutinePreset, SKILL_ROUTINE_LIMIT } from './skillRoutine';
import type { SkillInspection } from './SkillAffixGuidePanel';
import './characterAnalysis.css';
import WorkflowPreferencesPanel from './WorkflowPreferencesPanel';
import { applyDefaultWorkflow, workflowRole } from './workflowPreferences';

const DRAG_TYPE = 'application/x-poe2-routine-skill';
export default function SkillRecommendationPanel({ state, onSave, onInspect, inspection, onCloseInspection, children }: {
  state: LoadoutState; onSave: (state: LoadoutState) => boolean;
  onInspect?: (selection: MainSkillSelection, focusSupport?: { name: string; label: string }) => void;
  inspection?: SkillInspection; onCloseInspection?: () => void; children?: ReactNode;
}) {
  const [editing, setEditing] = useState(false), [filter, setFilter] = useState(''), [notice, setNotice] = useState('');
  const [viewSet, setViewSet] = useState('');
  const skills = state.goals.skillBar ?? [], choices = routineSkillChoices(state), plan = skillPlan(state);
  const setId = skills[0]?.setId ?? (viewSet || state.source?.combat?.activeSet || '');
  const savedGem = state.source?.combat && mainGem(state.source.combat);
  const preset = twisterRoutinePreset(state, setId);
  // Repeated imports may contain equivalent socket groups. Preserve distinct supports.
  const distinct = new Map<string, typeof choices[number]>();
  for (const entry of choices.filter((choice) => choice.selection.setId === setId)) {
    const signature = JSON.stringify([entry.name, entry.selection.id, entry.level, entry.quality, entry.supports.map((support) => [support.name, support.level, support.quality])]);
    if (!distinct.has(signature) || skills.some((skill) => skillSelectionKey(skill) === entry.key)) distinct.set(signature, entry);
  }
  const library = [...distinct.values()].filter((entry) => `${entry.name} ${entry.label}`.toLowerCase().includes(filter.toLowerCase()));
  function persist(next: MainSkillSelection[], focus?: MainSkillSelection) {
    try { if (onSave(setSkillRoutine(state, next, focus))) { setNotice(''); if (inspection && !next.some((entry) => skillSelectionKey(entry) === skillSelectionKey(inspection.selection))) onCloseInspection?.(); } }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : '技能组保存失败'); }
  }
  function insert(key: string, index: number) {
    const entry = choices.find((choice) => choice.key === key);
    if (!entry) { setNotice('此技能已停用或不属于当前武器组，请刷新角色资料。'); return; }
    if (skills[0] && skills[0].setId !== entry.selection.setId) { setNotice('同一技能组需要使用同一个 PoB 技能方案。'); return; }
    const previous = skills.findIndex((skill) => skillSelectionKey(skill) === key);
    if (previous < 0 && skills.length >= SKILL_ROUTINE_LIMIT) { setNotice('技能组最多 12 项。'); return; }
    const next = skills.filter((skill) => skillSelectionKey(skill) !== key);
    next.splice(Math.max(0, Math.min(next.length, index - (previous >= 0 && previous < index ? 1 : 0))), 0, entry.selection);
    persist(next);
  }
  function drop(event: DragEvent, index: number) { event.preventDefault(); event.stopPropagation(); insert(event.dataTransfer.getData(DRAG_TYPE), index); }
  function start(event: DragEvent, selection: MainSkillSelection) { event.dataTransfer.setData(DRAG_TYPE, skillSelectionKey(selection)); event.dataTransfer.effectAllowed = 'move'; }
  function inspect(selection: MainSkillSelection) {
    if (inspection && skillSelectionKey(inspection.selection) === skillSelectionKey(selection)) onCloseInspection?.();
    else onInspect?.(selection);
  }
  return <section className="lo-summary sr-panel" aria-label="主输出与智能配装">
    <div className="sr-heading"><h3>输出技能组</h3><small>{skills.length ? `${skills.length} 个技能` : '拖入实际使用的技能'}</small>
      {!state.goals.workflow && <button type="button" className="wb-text-button" onClick={() => onSave(applyDefaultWorkflow(state))}>按默认开始</button>}
      <div className="sr-heading-actions"><IconButton icon="plus" label={editing ? '收起技能库' : '编辑技能组'} aria-expanded={editing} onClick={() => setEditing(!editing)} />
        <IconButton icon="search" label="查看增伤词缀与部位" disabled={!state.goals.mainSkill || !skills.length || !plan} onClick={() => { if (state.goals.mainSkill) onInspect?.(state.goals.mainSkill); }} /></div></div>
    <div className="sr-bar" role="group" aria-label="实际使用的技能组" onDragOver={(event) => { if (event.dataTransfer.types.includes(DRAG_TYPE)) event.preventDefault(); }} onDrop={(event) => drop(event, skills.length)}>
      {skills.map((selection, index) => {
        const key = skillSelectionKey(selection), choice = choices.find((entry) => entry.key === key);
        const focused = !!state.goals.mainSkill && skillSelectionKey(state.goals.mainSkill) === key;
        return <div key={key} className={`sr-slot${focused ? ' focus' : ''}`} draggable={!!choice} onDragStart={(event) => start(event, selection)}
          onDragOver={(event) => { if (event.dataTransfer.types.includes(DRAG_TYPE)) event.preventDefault(); }} onDrop={(event) => drop(event, index)}>
          <span className="sr-order" aria-hidden="true">{index + 1}</span>
          <SkillGemButton name={choice?.name ?? selection.name ?? ''} label={choice?.label ?? selection.name ?? '已失效技能'} inactive={!choice}
            selected={!!inspection && skillSelectionKey(inspection.selection) === key} ariaLabel={`展开技能：${choice?.label ?? selection.name}`} onClick={() => inspect(selection)} />
          <small className="sr-focus">{focused ? '检索重点 · ' : ''}{workflowRole(state, key)}</small>
          {editing && <div className="sr-slot-actions"><button type="button" title="前移" aria-label={`前移${choice?.label ?? selection.name}`} disabled={index === 0} onClick={() => { const next = [...skills]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; persist(next); }}>←</button>
            <button type="button" title="后移" aria-label={`后移${choice?.label ?? selection.name}`} disabled={index === skills.length - 1} onClick={() => { const next = [...skills]; [next[index], next[index + 1]] = [next[index + 1]!, next[index]!]; persist(next); }}>→</button>
            <button type="button" title="移出技能组" aria-label={`移出${choice?.label ?? selection.name}`} onClick={() => persist(skills.filter((_, at) => at !== index))}>×</button></div>}
        </div>;
      })}
      <button type="button" className="sr-add" aria-label="添加技能到技能组" onClick={() => setEditing(true)}>＋</button>
      {!skills.length && <small className="lo-footnote">点 ＋ 打开技能库，再拖入图标；也可点击添加。</small>}
    </div>
    {editing && <div className="sr-library" onDragOver={(event) => { if (event.dataTransfer.types.includes(DRAG_TYPE)) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const key = event.dataTransfer.getData(DRAG_TYPE); if (skills.some((entry) => skillSelectionKey(entry) === key)) persist(skills.filter((entry) => skillSelectionKey(entry) !== key)); }}><div className="sr-library-tools"><input aria-label="筛选技能库" placeholder="搜索技能" value={filter} onChange={(event) => setFilter(event.target.value)} />
      {(state.source?.combat?.sets.length ?? 0) > 1 && <select aria-label="技能库来源方案" disabled={!!skills.length} value={setId} onChange={(event) => setViewSet(event.target.value)}>{state.source?.combat?.sets.map((set, index) => <option key={set.id} value={set.id}>PoB 方案 {index + 1}</option>)}</select>}
      {preset && <button type="button" className="sr-preset" title="旋风、爆炸长矛、回旋斩" aria-label="采用旋风三技能组合" onClick={() => persist(preset, preset[0])}>{preset.map((entry) => <SkillGemArt key={skillSelectionKey(entry)} name={entry.name!} />)}<span>采用组合</span></button>}</div>
      <small className="lo-footnote">拖到上方加入组合，拖回技能库移出；手机可点击添加、用箭头排序。</small><div className="sr-library-grid" role="group" aria-label="可拖入的技能库">{library.map((choice) => {
        const included = skills.some((entry) => choice.key === skillSelectionKey(entry));
        return <div key={choice.key} draggable onDragStart={(event) => start(event, choice.selection)}><SkillGemButton name={choice.name} label={choice.label} detail={`Lv.${choice.level} · ${choice.supports.length} 辅助`} selected={included}
          ariaLabel={`添加技能：${choice.label} · 第 ${choice.selection.group} 组`} onClick={() => { if (!included) insert(choice.key, skills.length); }} /></div>;
      })}</div>{!library.length && <p className="lo-footnote">没有可用技能；请更新 PoB 装备与技能并保存后重新读取。</p>}
    </div>}
    {notice && <p className="lo-footnote" role="alert">{notice}</p>}
    {children}
    <WorkflowPreferencesPanel state={state} onSave={onSave} />
    <details className="sr-source"><summary>来源与校验{plan?.warnings.length ? ` · ${plan.warnings.length} 项提示` : ''}</summary>
      <p className="lo-footnote">PoB 保存的主技能：{savedGem ? gemInfo(savedGem).label : '未读取'}。这是一份计算快照，不代表实际使用的输出循环；请在上方定义。</p>
      {state.goals.build && <p className="lo-footnote">参考 BD：{state.goals.build.main.label}。</p>}
      <p className="lo-footnote">每个技能保留自己的辅助；跨技能联动按触发条件核对。整套四抗约束不变，最终组合 DPS 仍需 PoB 重算。</p>
      {plan?.warnings.map((warning) => <p key={warning} className="lo-footnote">{warning}</p>)}
    </details>
  </section>;
}
