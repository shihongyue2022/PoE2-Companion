import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SkillRecommendationPanel from './SkillRecommendationPanel';
import { damageState } from './fixtures/damageGoal';
import type { LoadoutState } from './loadout';
import { mainSkillChoices } from './skillRecommendation';
import { linkedGuideState } from './fixtures/skillAffixGuide';

it('persists explicit main-skill selection without changing gear, saved combat or resistance calibration', async () => {
  const state = damageState(), save = vi.fn<(state: LoadoutState) => boolean>(() => true), user = userEvent.setup();
  render(<SkillRecommendationPanel state={state} onSave={save} />);
  expect(screen.getByText('智能配装 · 闪电长矛')).toBeVisible();
  const select = screen.getByRole('combobox', { name: '智能配装主输出技能' });
  await user.selectOptions(select, 'pob:2:3');
  const updated = save.mock.calls[0]![0];
  expect(updated.goals.mainSkill).toMatchObject({ source: 'pob', setId: '2', group: 3, name: 'Lightning Spear' });
  expect(updated.slots).toEqual(state.slots);
  expect(updated.source).toEqual(state.source);
  expect(updated.character).toEqual(state.character);
  await user.selectOptions(select, '');
  expect(save.mock.calls[1]![0].goals.mainSkill).toBeUndefined();
});
it('selects a companion group through an official-art button and saves only the recommendation plan', async () => {
  const state = linkedGuideState(), save = vi.fn<(state: LoadoutState) => boolean>(() => true), user = userEvent.setup();
  render(<SkillRecommendationPanel state={state} onSave={save} />);
  await user.click(screen.getByText('联动技能组'));
  const button = screen.getByRole('button', { name: /联动：.*第 5 组/ });
  expect(button.querySelector('img')).toHaveAttribute('src', expect.stringMatching(/^\/images\/skills\/.*\.png$/));
  await user.click(button);
  const next = save.mock.calls[0]![0];
  expect(next.goals.mainSkill).toMatchObject({ name: 'Twister', links: [{ group: 5, name: 'Whirling Slash' }] });
  expect(next.slots).toEqual(state.slots); expect(next.source).toEqual(state.source);
});
it('keeps distinct active skills in the same group selectable and opens the chosen skill without changing the build', async () => {
  const state = damageState(), combat = state.source!.combat!;
  const group = combat.sets.find((entry) => entry.id === '2')!.groups[2]!, original = group.gems[0]!;
  group.gems.unshift({ ...original, id: 'Metadata/Items/Gems/SkillGemTwister', skillId: 'TwisterPlayer', name: 'Twister' });
  const choices = mainSkillChoices(state).filter((entry) => entry.selection.setId === '2' && entry.selection.group === 3);
  expect(choices).toHaveLength(2);
  expect(new Set(choices.map((entry) => entry.key)).size).toBe(2);
  state.goals.mainSkill = choices.find((entry) => entry.selection.name === 'Lightning Spear')!.selection;
  const save = vi.fn(), inspect = vi.fn(), user = userEvent.setup();
  render(<SkillRecommendationPanel state={state} onSave={save} onInspect={inspect} />);
  expect(screen.getByRole('combobox', { name: '智能配装主输出技能' })).toHaveValue(choices.find((entry) => entry.selection.name === 'Lightning Spear')!.key);
  await user.click(screen.getByRole('button', { name: '查看增伤词缀与部位' }));
  expect(inspect).toHaveBeenCalledWith(state.goals.mainSkill);
  expect(save).not.toHaveBeenCalled();
});
