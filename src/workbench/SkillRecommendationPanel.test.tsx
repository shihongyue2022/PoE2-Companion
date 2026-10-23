import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SkillRecommendationPanel from './SkillRecommendationPanel';
import type { LoadoutState } from './loadout';
import { threeSkillRoutineState } from './fixtures/skillAffixGuide';
import { setSkillRoutine, twisterRoutinePreset } from './skillRoutine';

it('does not present saved Lightning Spear as the actual rotation and adopts the verified three-skill preset', async () => {
  const state = threeSkillRoutineState(), save = vi.fn<(state: LoadoutState) => boolean>(() => true), user = userEvent.setup();
  render(<SkillRecommendationPanel state={state} onSave={save} />);
  expect(within(screen.getByRole('group', { name: '实际使用的技能组' })).queryByRole('button', { name: /展开技能/ })).toBeNull();
  expect(screen.getByRole('button', { name: '查看增伤词缀与部位' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '编辑技能组' }));
  await user.click(screen.getByRole('button', { name: '采用旋风三技能组合' }));
  const next = save.mock.calls[0]![0];
  expect(next.goals.skillBar!.map((entry) => entry.name)).toEqual(['Twister', 'Explosive Spear', 'Whirling Slash']);
  expect(next.goals.mainSkill!.name).toBe('Twister');
  expect(next.source).toEqual(state.source); expect(next.slots).toEqual(state.slots);
});
it('opens skill detail without saving or switching equipment-search focus', async () => {
  const initial = threeSkillRoutineState(), preset = twisterRoutinePreset(initial, '2')!, state = setSkillRoutine(initial, preset, preset[0]);
  const save = vi.fn(), inspect = vi.fn(), user = userEvent.setup();
  render(<SkillRecommendationPanel state={state} onSave={save} onInspect={inspect} />);
  const bar = screen.getByRole('group', { name: '实际使用的技能组' });
  await user.click(within(bar).getByRole('button', { name: '展开技能：爆炸长矛' }));
  expect(inspect).toHaveBeenCalledWith(preset[1]); expect(save).not.toHaveBeenCalled();
  expect(state.goals.mainSkill!.name).toBe('Twister');
});
it('supports real drag data, click-to-add, keyboard-friendly reorder and removal without duplicating skills', async () => {
  const initial = threeSkillRoutineState(), save = vi.fn<(state: LoadoutState) => boolean>(() => true), user = userEvent.setup();
  function Harness() {
    const [state, update] = useState(initial);
    return <SkillRecommendationPanel state={state} onSave={(next) => { update(next); return save(next); }} />;
  }
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: '编辑技能组' }));
  const library = screen.getByRole('group', { name: '可拖入的技能库' }), bar = screen.getByRole('group', { name: '实际使用的技能组' });
  const data: Record<string, string> = {}, transfer = { types: ['application/x-poe2-routine-skill'], setData: (type: string, value: string) => { data[type] = value; }, getData: (type: string) => data[type] ?? '', effectAllowed: 'move' };
  fireEvent.dragStart(within(library).getByRole('button', { name: /添加技能：旋风 · 第 3 组/ }).parentElement!, { dataTransfer: transfer });
  fireEvent.drop(bar, { dataTransfer: transfer });
  await user.click(within(library).getByRole('button', { name: /添加技能：爆炸长矛/ }));
  await user.click(within(library).getByRole('button', { name: /添加技能：爆炸长矛/ }));
  expect(bar.querySelectorAll('.sr-slot')).toHaveLength(2);
  await user.click(screen.getByRole('button', { name: '后移旋风' }));
  expect(save.mock.calls.at(-1)![0].goals.skillBar!.map((entry) => entry.name)).toEqual(['Explosive Spear', 'Twister']);
  expect(save.mock.calls.at(-1)![0].goals.mainSkill!.name).toBe('Twister');
  await user.click(screen.getByRole('button', { name: '移出旋风' }));
  expect(save.mock.calls.at(-1)![0].goals.mainSkill!.name).toBe('Explosive Spear');
});
