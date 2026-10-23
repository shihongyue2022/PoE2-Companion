import { useMemo, useState } from 'react';
import type { PatchData } from '../../packages/engine/src/types';
import type { GearTrade } from '../lib/gearTrade';
import type { LoadoutState } from './loadout';
import { localizeEquipmentName } from './genericEquipment';
import { skillPlan, type MainSkillSelection } from './skillRecommendation';
import { skillAffixDirections, skillFamilyLabel, skillGuideFacts, skillRuneLabel, skillRuneUrl, SKILL_GUIDE_CHECKED, SKILL_GUIDE_SOURCES, type SkillAffixSearch } from './skillAffixGuide';
import { englishPoe2dbUrl } from './poe2dbReference';
import SkillGemButton, { SkillGemArt } from './SkillGemButton';
import SkillLinkPicker from './SkillLinkPicker';
import { IconButton } from './WorkbenchIcon';

export interface SkillInspection { selection: MainSkillSelection; focusSupport?: { name: string; label: string } }
export default function SkillAffixGuidePanel({ state, inspection, data, trade, onSave, onSearch, onClose }: {
  state: LoadoutState; inspection: SkillInspection; data?: PatchData; trade?: GearTrade | null;
  onSave: (state: LoadoutState) => boolean; onSearch?: (request: SkillAffixSearch) => void; onClose: () => void;
}) {
  const [selection, setSelection] = useState(inspection.selection);
  const [focusSupport, setFocusSupport] = useState(inspection.focusSupport);
  const preview = useMemo(() => ({ ...state, goals: { ...state.goals, mainSkill: selection } }), [state, selection]);
  const plan = skillPlan(preview), current = skillPlan(state);
  const directions = useMemo(() => skillAffixDirections(preview, data, trade), [preview, data, trade]);
  const [family, setFamily] = useState('all'), [expanded, setExpanded] = useState(false), [places, setPlaces] = useState<Record<string, string>>({}), [tiers, setTiers] = useState<Record<string, string>>({});
  const families = [...new Set(directions.map((entry) => entry.family))];
  const facts = plan ? skillGuideFacts(plan.name, plan.supports) : [];
  const focusedFacts = focusSupport ? facts.filter((entry) => entry.label.startsWith(focusSupport.label)) : facts.filter((entry) => /单体命中限制|投速参与增伤/.test(entry.label));
  const keyFacts = focusedFacts.length ? focusedFacts : facts.slice(0, 2), otherFacts = facts.filter((entry) => !keyFacts.includes(entry));
  const isMain = current?.key === plan?.key && current?.name === plan?.name && !!plan;
  const unchanged = isMain && JSON.stringify(state.goals.mainSkill?.links ?? []) === JSON.stringify(selection.links ?? []);
  const filtered = family === 'all' ? directions : directions.filter((entry) => entry.family === family);
  const visible = expanded ? filtered : filtered.slice(0, 8);
  return <section className="ca-skill-guide" aria-label="技能增伤与装备检索">
    <div className="wb-section-head"><h4 className="sg-guide-title">{plan && <SkillGemArt name={plan.name} />}{plan?.label ?? inspection.selection.name ?? '技能'} · 增伤与装备</h4><IconButton icon="close" label="收起增伤与装备" onClick={onClose} /></div>
    {!plan ? <p className="lo-alert">此技能未启用、属于另一武器组或资料未匹配。请先核对技能配置，再生成装备检索。</p> : <>
      <div className="lo-actions"><button type="button" className="wb-button" disabled={unchanged} onClick={() => onSave(preview)}>{unchanged ? '当前主输出' : isMain ? '保存联动方案' : '设为主要输出技能'}</button><a className="wb-link" href={englishPoe2dbUrl(plan.name)} target="_blank" rel="noreferrer">技能原文 ↗</a>{focusSupport && <a className="wb-link" href={englishPoe2dbUrl(focusSupport.name)} target="_blank" rel="noreferrer">{focusSupport.label}原文 ↗</a>}</div>
      <div className="sg-support-strip" role="group" aria-label="查阅辅助机制">{plan.supports.map((support) => <SkillGemButton key={support.name} name={support.name} label={support.label} support selected={focusSupport?.name === support.name}
        onClick={() => setFocusSupport(support)} />)}</div>
      <SkillLinkPicker state={state} selection={selection} name={plan.name} onChange={setSelection} />
      <p className="lo-footnote">选词缀 → 部位／档位 → 放大镜检索。方向按机制匹配排序，实际 DPS 需 PoB 重算。</p>
      {focusSupport && !plan.supports.some((entry) => entry.name === focusSupport.name) && <p className="lo-alert">此辅助在当前配置中未启用，不用于本次增伤推荐；可查阅原文后再决定是否启用。</p>}
      {keyFacts.length > 0 && <div className="ca-skill-facts">{keyFacts.map((fact) => <p key={fact.label} className="lo-footnote"><b>{fact.label}</b>：{fact.detail} <a className="wb-link" href={fact.url} target="_blank" rel="noreferrer">依据 ↗</a></p>)}{otherFacts.length > 0 && <details><summary>其余技能与辅助机制 · {otherFacts.length} 项</summary>{otherFacts.map((fact) => <p key={fact.label} className="lo-footnote"><b>{fact.label}</b>：{fact.detail} <a className="wb-link" href={fact.url} target="_blank" rel="noreferrer">依据 ↗</a></p>)}</details>}</div>}
      {plan.warnings.map((warning) => <p className="lo-alert" key={warning}>{warning}</p>)}
      <div className="ca-skill-filter"><label>增伤方向<select aria-label="筛选技能增伤方向" value={family} onChange={(event) => setFamily(event.target.value)}><option value="all">全部方向 · {directions.length} 条</option>{families.map((key) => <option key={key} value={key}>{skillFamilyLabel(key)}</option>)}</select></label><small className="lo-footnote">前后缀／需解锁词池 · 规则 {data?.patch ?? '加载中'}</small></div>
      {!data || !trade ? <p role="status" className="lo-footnote">正在加载装备词池与官方交易映射。</p> : !directions.length ? <p className="lo-footnote">当前技能／底座暂无可核验的普通增伤词缀，保留原文核对入口，不编造属性或阶层。</p> : <div className="ca-affix-directions">{visible.map((direction) => {
        const location = direction.locations.find((entry) => `${entry.slot}:${entry.baseId}` === places[direction.ref]) ?? direction.locations[0]!;
        const choices = location.row.targetTiers!.filter((entry) => entry.tier <= 3).sort((a, b) => b.tier - a.tier);
        const preset = choices.some((entry) => `tier:${entry.tier}` === tiers[direction.ref]) ? tiers[direction.ref]! : `tier:${choices[0]!.tier}`;
        return <article key={direction.ref} className="ca-affix-direction"><div><strong>{direction.label}</strong><span className="wb-tag">{skillFamilyLabel(direction.family)}</span></div>
          <details><summary className="lo-footnote">机制与可用部位</summary><p className="lo-footnote">{direction.reason}</p>
          <p className="lo-footnote">可出现：{[...new Set(direction.locations.map((entry) => entry.slotLabel))].join('、')}。</p>
          </details>
          <div className="ca-affix-controls"><select aria-label={`检索部位：${direction.label}`} value={`${location.slot}:${location.baseId}`} onChange={(event) => setPlaces((old) => ({ ...old, [direction.ref]: event.target.value }))}>{direction.locations.map((entry) => <option key={`${entry.slot}:${entry.baseId}`} value={`${entry.slot}:${entry.baseId}`}>{entry.slotLabel} · {localizeEquipmentName(entry.baseName)} · {entry.row.affixType === 'prefix' ? '前缀' : '后缀'}</option>)}</select>
            <select aria-label={`检索档位：${direction.label}`} value={preset} onChange={(event) => setTiers((old) => ({ ...old, [direction.ref]: event.target.value }))}>{choices.map((entry) => <option key={entry.tier} value={`tier:${entry.tier}`}>T{entry.tier} · ≥{entry.min} · 需物等 {entry.requiredLevel}</option>)}</select>
            <IconButton icon="search" label={isMain ? '检索这条词缀' : '以此为主输出并检索'} disabled={!onSearch} onClick={() => { if (onSave(preview)) onSearch?.({ selection, slot: location.slot, baseId: location.baseId, ref: direction.ref, preset, requiredRune: location.row.requiredRune }); }} /></div>
          {location.row.requiredRune && <p className="lo-notice">词池前提：需{skillRuneLabel(location.row.requiredRune)}解锁。此项是符文开放的装备前后缀，不是镶嵌符文就直接获得这条数值。 <a className="wb-link" href={skillRuneUrl(location.row.requiredRune)} target="_blank" rel="noreferrer">词池依据 ↗</a></p>}
          <small className="lo-footnote">本部位 T1 roll：{location.row.targetRange!.min}–{location.row.targetRange!.max}；检索普通词缀，原传奇独有机制需另行核对。</small>
        </article>;
      })}{filtered.length > 8 && <button type="button" className="wb-text-button" onClick={() => setExpanded((old) => !old)}>{expanded ? '收起更多词缀' : `展开其余 ${filtered.length - 8} 条词缀`}</button>}</div>}
      <details><summary>数据来源与适用边界</summary><p className="lo-footnote">技能、辅助与机制核对：{SKILL_GUIDE_CHECKED}。技能资料、版本变更和普通词池各自保留来源；词池版本不代表已自动更新到当前游戏。当前伤害快照仍属于原 PoB 保存的技能，点击其他技能不会借用那份 DPS。</p><div className="lo-actions"><a className="wb-link" href={SKILL_GUIDE_SOURCES.modifiers} target="_blank" rel="noreferrer">英文词缀资料 ↗</a><a className="wb-link" href={SKILL_GUIDE_SOURCES.official} target="_blank" rel="noreferrer">GGG 技能更新说明 ↗</a><a className="wb-link" href={SKILL_GUIDE_SOURCES.pob} target="_blank" rel="noreferrer">PoB2 技能数据 ↗</a><a className="wb-link" href="/images/skills/manifest.json" target="_blank" rel="noreferrer">GGG 图标来源 ↗</a></div><p className="lo-footnote">抗性仍是整套约束；这里只选增伤方向，不自动换装，不推算未配置的地面、盛怒、敌人抗性或覆盖率。</p></details>
    </>}
  </section>;
}
