import { expect, it } from 'vitest';
import { applyDefaultWorkflow, readWorkflow, workflowDamageState, workflowPreferences } from './workflowPreferences';
import { threeSkillRoutineState } from './fixtures/skillAffixGuide';
import { deserializeLoadout, serializeLoadout } from './loadout';
import { focusRoutineSkill } from './skillRoutine';
import { skillPlan } from './skillRecommendation';

it('applies the accepted defaults, preserves supports and gear, and separates damage role from inspection focus', () => {
  const original = threeSkillRoutineState(), state = applyDefaultWorkflow(original);
  expect(workflowPreferences(state)).toMatchObject({ encounter: 'boss-sustained', replacement: 'pair', currency: 'divine' });
  expect(state.goals.skillBar!.map((entry) => entry.name)).toEqual(['Twister', 'Explosive Spear', 'Whirling Slash']);
  expect(state.slots).toEqual(original.slots); expect(state.source).toEqual(original.source);
  const focus = focusRoutineSkill(state, state.goals.skillBar![1]!);
  expect(focus.goals.mainSkill!.name).toBe('Explosive Spear');
  expect(workflowDamageState(focus).goals.mainSkill!.name).toBe('Twister');
  expect(focus.goals.mainSkill!.name).toBe('Explosive Spear');
  expect(deserializeLoadout(serializeLoadout(state)).state!.goals.workflow).toEqual(state.goals.workflow);
});
it('accepts a true zero budget and validates optional states without storing invented coverage multipliers', () => {
  const state = applyDefaultWorkflow(threeSkillRoutineState());
  expect(readWorkflow({ ...state.goals.workflow, budget: 0, conditions: { ignitedGround: 'sometimes' } })).toMatchObject({ budget: 0, conditions: { ignitedGround: 'sometimes' } });
  expect(readWorkflow({ ...state.goals.workflow, budget: NaN })).toBeUndefined();
  expect(readWorkflow({ ...state.goals.workflow, conditions: { ignitedGround: 2.5 } })!.conditions).toEqual({});
});
it('does not crash or borrow another skill when the primary rotation skill has become inactive', () => {
  const state = applyDefaultWorkflow(threeSkillRoutineState());
  const primary = state.goals.skillBar![0]!;
  state.source!.combat!.sets.find((set) => set.id === primary.setId)!.groups.find((group) => group.index === primary.group)!.enabled = false;
  expect(() => workflowDamageState(state)).not.toThrow();
  expect(skillPlan(workflowDamageState(state))).toBeUndefined();
});
