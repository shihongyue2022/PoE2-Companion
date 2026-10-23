import type { LoadoutState } from './loadout';
import type { MainSkillSelection } from './skillRecommendation';
import { selectedSkillLinks, skillLinkChoices, skillLinkEffect, skillLinkKey } from './skillLinks';
import SkillGemButton from './SkillGemButton';

export default function SkillLinkPicker({ state, selection, name, onChange }: {
  state: LoadoutState; selection: MainSkillSelection; name: string; onChange: (selection: MainSkillSelection) => void;
}) {
  const choices = skillLinkChoices(state, selection), selected = selectedSkillLinks(state, selection);
  if (selection.source !== 'pob') return null;
  return <details className="sg-links"><summary>联动技能组 <span className="wb-tag">{selected.length} 已选</span></summary>
    <p className="lo-footnote">点选参与输出循环的技能。各组辅助只作用于本组；联动收益按下方条件核对。</p>
    {choices.length ? <div className="sg-picker" role="group" aria-label="选择联动技能组">{choices.map((choice) => {
      const checked = selected.some((entry) => skillLinkKey(entry) === skillLinkKey(choice));
      return <SkillGemButton key={skillLinkKey(choice)} name={choice.name} label={choice.label} detail={`第 ${choice.group} 组`} selected={checked}
        ariaLabel={`联动：${choice.label} · 第 ${choice.group} 组`} onClick={() => {
          const links = (selection.links ?? []).filter((link) => skillLinkKey(link) !== skillLinkKey(choice));
          if (!checked) links.push({ group: choice.group, id: choice.id, name: choice.name });
          onChange({ ...selection, links: links.length ? links : undefined });
        }} />;
    })}</div> : <p className="lo-footnote">当前武器组和技能方案中，没有其他已启用的技能组。</p>}
    {selected.map((link) => { const effect = skillLinkEffect(name, link); return <div className="sg-link-effect" key={skillLinkKey(link)}>
      <b>{link.label} → {name === 'Twister' ? '旋风' : '主输出'}</b><span>{effect.detail}</span>
      {!!link.supports.length && <small>本组辅助：{link.supports.map((entry) => entry.label).join('、')}</small>}
      {effect.url && <a className="wb-link" href={effect.url} target="_blank" rel="noreferrer">机制依据 ↗</a>}
    </div>; })}
  </details>;
}
