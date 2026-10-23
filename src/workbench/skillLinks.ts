import { activeGems, gemInfo } from './pobCombat';
import type { LoadoutState } from './loadout';
import type { MainSkillSelection } from './skillRecommendation';
import { activeSecondWeapons } from './weaponSets';

export interface SkillLink { group: number; id: string; name: string }
export interface SkillLinkChoice extends SkillLink { label: string; supports: { name: string; label: string }[]; tags: string[] }
export const skillLinkKey = (link: SkillLink) => JSON.stringify([link.group, link.id, link.name]);
/** A companion is an enabled active gem in the same skill set and weapon context. */
export function skillLinkChoices(state: LoadoutState, selection: MainSkillSelection): SkillLinkChoice[] {
  if (selection.source !== 'pob') return [];
  const set = state.source?.combat?.sets.find((entry) => entry.id === selection.setId);
  return (set?.groups ?? []).filter((group) => group.index !== selection.group).flatMap((group) => {
    const gems = activeGems(group, activeSecondWeapons(state));
    return gems.filter((gem) => !gemInfo(gem).support && gemInfo(gem).known).map((gem) => {
      const info = gemInfo(gem);
      return { group: group.index, id: gem.id || gem.skillId, name: gem.name, label: info.label, tags: info.tags,
        supports: gems.filter((entry) => gemInfo(entry).support).map((entry) => ({ name: gemInfo(entry).name, label: gemInfo(entry).label })) };
    });
  });
}
export function selectedSkillLinks(state: LoadoutState, selection: MainSkillSelection): SkillLinkChoice[] {
  const keys = new Set(selection.links?.map(skillLinkKey));
  return skillLinkChoices(state, selection).filter((entry) => keys.has(skillLinkKey(entry)));
}
export function skillLinkEffect(main: string, link: SkillLinkChoice): { detail: string; url?: string; verified: boolean } {
  if (main === 'Twister' && link.name === 'Explosive Spear') return {
    verified: true, detail: '爆炸长矛消耗狂怒球的强化爆炸可制造燃烧地面，供旋风经过时获得对应元素收益；未确认狂怒球来源与地面覆盖率时，不按常驻增伤计分。', url: 'https://poe2db.tw/us/Explosive_Spear',
  };
  if (main === 'Twister' && ['Whirling Slash', 'Whirlwind Lance'].includes(link.name)) return {
    verified: true, detail: '提供可被旋风消耗的旋风效果；按实际叠层与接触触发，元素旋风还涉及额外元素伤害。未假定满层或全程覆盖。', url: 'https://poe2db.tw/us/Twister',
  };
  if (link.tags.includes('melee') && link.supports.some((support) => support.name === 'Rage II')) return {
    verified: true, detail: '此组的盛怒 II 可通过近战命中获取盛怒；主输出是否受益还需核对自身机制与实战覆盖率。', url: 'https://poe2db.tw/us/Rage_II',
  };
  return { verified: false, detail: '已纳入联动方案；该组合的触发、增益和覆盖率尚待核对，暂不额外增加伤害权重。' };
}
