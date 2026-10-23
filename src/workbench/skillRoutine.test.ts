import { expect, it } from 'vitest';
import { deserializeLoadout, serializeLoadout } from './loadout';
import { threeSkillRoutineState } from './fixtures/skillAffixGuide';
import { focusRoutineSkill, readSkillRoutine, routineSkillChoices, setSkillRoutine, twisterRoutinePreset } from './skillRoutine';
import { skillPlan } from './skillRecommendation';
import { damageGoalRows } from './damageGoal';
import { parseEquipment } from './genericEquipment';
import { equipmentTradeRows } from './genericEquipmentTrade';

it('keeps the real three-skill routine separate from PoB saved main and each skill own supports', () => {
  const original = threeSkillRoutineState(), preset = twisterRoutinePreset(original, '2')!;
  expect(skillPlan(original)!.name).toBe('Lightning Spear');
  const state = setSkillRoutine(original, preset, preset[0]);
  expect(state.goals.skillBar!.map((entry) => entry.name)).toEqual(['Twister', 'Explosive Spear', 'Whirling Slash']);
  expect(state.source).toEqual(original.source); expect(state.slots).toEqual(original.slots); expect(state.character).toEqual(original.character);
  expect(skillPlan(state)!.name).toBe('Twister');
  expect(skillPlan(state)!.supports.some((entry) => entry.name === 'Projectile Acceleration III')).toBe(true);
  expect(skillPlan(state)!.notes.join(' ')).toContain('狂怒球');
  const explosive = focusRoutineSkill(state, preset[1]!);
  expect(explosive.goals.skillBar).toEqual(preset);
  expect(skillPlan(explosive)!.supports.map((entry) => entry.name)).toEqual(['Fire Penetration II']);
  expect(skillPlan(explosive)!.priorities.some((entry) => entry.family === 'projectileSpeed')).toBe(false);
  const restored = deserializeLoadout(serializeLoadout(explosive)).state!;
  expect(restored.goals).toEqual(explosive.goals);
});
it('keeps focus on reorder and falls back within the chosen routine on removal, never to saved Lightning Spear', () => {
  const original = threeSkillRoutineState(), preset = twisterRoutinePreset(original, '2')!;
  const state = setSkillRoutine(original, preset, preset[0]);
  const reordered = setSkillRoutine(state, [...preset].reverse());
  expect(reordered.goals.mainSkill!.name).toBe('Twister');
  const removed = setSkillRoutine(reordered, reordered.goals.skillBar!.filter((entry) => entry.name !== 'Twister'));
  expect(removed.goals.mainSkill!.name).toBe('Whirling Slash');
  const empty = setSkillRoutine(removed, []);
  expect(skillPlan(empty)).toBeUndefined();
  expect(deserializeLoadout(serializeLoadout(empty)).state!.goals.skillBar).toEqual([]);
  const weapon = parseEquipment(empty.slots.mainHand!)!;
  expect(damageGoalRows(equipmentTradeRows(weapon, 'upgrade'), weapon, empty).every((row) => row.weight === '0')).toBe(true);
});
it('validates native identities and current weapon availability and rejects mixed or malformed routines', () => {
  const state = threeSkillRoutineState(), preset = twisterRoutinePreset(state, '2')!;
  expect(readSkillRoutine([preset[0], { ...preset[1], setId: 'other' }])).toBeUndefined();
  expect(readSkillRoutine([{ ...preset[0], group: 999 }])).toBeUndefined();
  const disabled = state.source!.combat!.sets.find((set) => set.id === '2')!.groups.find((group) => group.index === preset[0]!.group)!;
  disabled.enabled = false;
  expect(twisterRoutinePreset(state, '2')).toBeUndefined();
  expect(() => setSkillRoutine(state, preset, preset[0])).toThrow('无法作为');
  disabled.enabled = true; disabled.slot = 'Weapon 1 Swap';
  expect(routineSkillChoices(state).some((entry) => entry.name === 'Twister' && entry.selection.setId === '2')).toBe(false);
});
