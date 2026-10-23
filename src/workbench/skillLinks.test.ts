import { expect, it } from 'vitest';
import { twisterGuideState } from './fixtures/skillAffixGuide';
import { mainSkillChoices, skillPlan } from './skillRecommendation';
import { deserializeLoadout, serializeLoadout } from './loadout';
import { selectedSkillLinks, skillLinkChoices, skillLinkEffect } from './skillLinks';

function linkedState() {
  const state = twisterGuideState(), set = state.source!.combat!.sets.find((entry) => entry.id === '2')!;
  const original = set.groups[2]!.gems[0]!;
  set.groups.push({ ...set.groups[2]!, index: 5, gems: [{ ...original, id: 'Metadata/Items/Gems/SkillGemWhirlingSlash', skillId: 'WhirlingSlashPlayer', name: 'Whirling Slash' },
    { ...original, id: 'Metadata/Items/Gems/SupportGemAccelerationThree', skillId: '', name: 'Projectile Acceleration III' }] });
  state.goals.mainSkill = mainSkillChoices(state).find((entry) => entry.selection.name === 'Twister' && entry.selection.setId === '2')!.selection;
  return state;
}
it('persists exact companion identity and describes conditional whirlwind interaction without borrowing its supports', () => {
  const state = linkedState(), selection = state.goals.mainSkill!, main = state.source!.combat!.sets.find((entry) => entry.id === '2')!.groups[2]!;
  main.gems = main.gems.filter((gem) => gem.name !== 'Projectile Acceleration III');
  const link = skillLinkChoices(state, selection).find((entry) => entry.name === 'Whirling Slash')!;
  selection.links = [{ group: link.group, id: link.id, name: link.name }];
  const restored = deserializeLoadout(serializeLoadout(state)).state!;
  expect(restored.goals.mainSkill).toEqual(selection);
  expect(skillLinkEffect('Twister', link)).toMatchObject({ verified: true });
  const plan = skillPlan(restored)!;
  expect(plan.notes.join(' ')).toContain('按实际叠层与接触触发');
  expect(plan.priorities.some((entry) => entry.family === 'projectileSpeed')).toBe(false);
  expect(plan.supports.some((entry) => entry.name === 'Projectile Acceleration III')).toBe(false);
});
it('excludes removed, disabled and other-weapon companions rather than treating them as active', () => {
  const state = linkedState(), selection = state.goals.mainSkill!;
  const link = skillLinkChoices(state, selection).find((entry) => entry.name === 'Whirling Slash')!;
  selection.links = [link];
  const group = state.source!.combat!.sets.find((entry) => entry.id === '2')!.groups.at(-1)!;
  group.enabled = false;
  expect(selectedSkillLinks(state, selection)).toEqual([]);
  expect(skillPlan(state)!.warnings.join(' ')).toContain('部分联动技能');
  group.enabled = true; group.slot = 'Weapon 1 Swap';
  expect(selectedSkillLinks(state, selection)).toEqual([]);
  group.slot = ''; group.gems = [];
  expect(selectedSkillLinks(state, selection)).toEqual([]);
});
it('does not persist malformed or self-linked groups and does not mix skill sets', () => {
  const state = linkedState(), selection = state.goals.mainSkill!;
  selection.links = [{ group: selection.group!, id: selection.id!, name: selection.name! }, { group: 999, id: '', name: '' }];
  expect(deserializeLoadout(serializeLoadout(state)).state!.goals.mainSkill!.links).toBeUndefined();
  expect(skillLinkChoices(state, { ...selection, setId: 'missing' })).toEqual([]);
});
