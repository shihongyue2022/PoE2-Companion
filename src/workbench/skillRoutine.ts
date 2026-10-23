import { activeGems, gemInfo } from './pobCombat';
import { mainSkillChoices, readMainSkillSelection, type MainSkillSelection } from './skillRecommendation';
import type { LoadoutState } from './loadout';
import { activeSecondWeapons } from './weaponSets';

export const SKILL_ROUTINE_LIMIT = 12;
export const skillSelectionKey = (entry: MainSkillSelection) => JSON.stringify([entry.source, entry.setId, entry.group, entry.id, entry.name]);
const identity = (entry: MainSkillSelection): MainSkillSelection => ({ source: entry.source, setId: entry.setId, group: entry.group, id: entry.id, name: entry.name });

export function readSkillRoutine(value: unknown): MainSkillSelection[] | undefined {
  if (!Array.isArray(value) || value.length > SKILL_ROUTINE_LIMIT) return undefined;
  const result: MainSkillSelection[] = [];
  for (const input of value as unknown[]) {
    const entry = readMainSkillSelection(input);
    if (!entry || entry.source !== 'pob') return undefined;
    if (result.some((other) => skillSelectionKey(other) === skillSelectionKey(entry))) continue;
    if (result[0] && result[0].setId !== entry.setId) return undefined;
    result.push(identity(entry));
  }
  return result;
}

/** All enabled active skills, including utility skills; supports stay in their original socket group. */
export function routineSkillChoices(state: LoadoutState) {
  return (state.source?.combat?.sets ?? []).flatMap((set) => set.groups.flatMap((group) => {
    const gems = activeGems(group, activeSecondWeapons(state));
    return gems.filter((gem) => !gemInfo(gem).support && gemInfo(gem).known).map((gem) => {
      const info = gemInfo(gem), selection: MainSkillSelection = { source: 'pob', setId: set.id, group: group.index, id: gem.id || gem.skillId, name: gem.name };
      return { key: skillSelectionKey(selection), selection, name: info.name, label: info.label, level: gem.level, quality: gem.quality, tags: info.tags,
        supports: gems.filter((entry) => gemInfo(entry).support).map((entry) => ({ ...gemInfo(entry), level: entry.level, quality: entry.quality })) };
    });
  }));
}

/** A preset is offered only when all three exact native identities exist in the current set. */
export function twisterRoutinePreset(state: LoadoutState, setId: string): MainSkillSelection[] | undefined {
  const choices = routineSkillChoices(state).filter((entry) => entry.selection.setId === setId);
  const found = ['Twister', 'Explosive Spear', 'Whirling Slash'].map((name) => choices.find((entry) => entry.name === name)?.selection);
  return found.every((entry) => !!entry) ? found : undefined;
}

export function setSkillRoutine(state: LoadoutState, input: MainSkillSelection[], focus?: MainSkillSelection): LoadoutState {
  const skills = readSkillRoutine(input);
  if (!skills) throw new Error('技能组最多 12 项，且必须属于同一个 PoB 技能方案。');
  const choices = routineSkillChoices(state), keys = new Set(choices.map((entry) => entry.key));
  const offensive = new Set(mainSkillChoices(state).map((entry) => skillSelectionKey(entry.selection)));
  const preferred = focus ?? state.goals.mainSkill;
  if (focus && (!skills.some((entry) => skillSelectionKey(entry) === skillSelectionKey(focus)) || !keys.has(skillSelectionKey(focus)) || !offensive.has(skillSelectionKey(focus)))) throw new Error('此技能无法作为当前装备检索的输出重点。');
  const primary = skills.find((entry) => preferred && skillSelectionKey(entry) === skillSelectionKey(preferred) && keys.has(skillSelectionKey(entry)) && offensive.has(skillSelectionKey(entry)))
    ?? skills.find((entry) => keys.has(skillSelectionKey(entry)) && offensive.has(skillSelectionKey(entry)));
  const mainSkill = primary ? { ...identity(primary), links: skills.filter((entry) => entry.group !== primary.group && keys.has(skillSelectionKey(entry)))
    .map((entry) => ({ group: entry.group!, id: entry.id!, name: entry.name! })) } : undefined;
  return { ...state, goals: { ...state.goals, skillBar: skills, mainSkill } };
}

export function focusRoutineSkill(state: LoadoutState, selection: MainSkillSelection): LoadoutState {
  if (state.goals.skillBar === undefined) return { ...state, goals: { ...state.goals, mainSkill: selection } };
  const skills = [...state.goals.skillBar];
  if (!skills.some((entry) => skillSelectionKey(entry) === skillSelectionKey(selection))) skills.push(identity(selection));
  return setSkillRoutine(state, skills, selection);
}
