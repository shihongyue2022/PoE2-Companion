import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SkillRecommendationPanel from './SkillRecommendationPanel';
import { damageState } from './fixtures/damageGoal';
import type { LoadoutState } from './loadout';

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
