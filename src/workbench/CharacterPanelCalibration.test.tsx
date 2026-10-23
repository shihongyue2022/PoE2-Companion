import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CharacterPanelCalibration from './CharacterPanelCalibration';
import { damageRing, damageState } from './fixtures/damageGoal';
it('prefills current verified totals, chooses caps by tier, and keeps raw correction folded', async () => {
  const state = damageState(), save = vi.fn();
  render(<CharacterPanelCalibration state={state} totals={{}} onSave={save} />);
  const user = userEvent.setup(); await user.click(screen.getByText('游戏角色面板基准', { exact: false }));
  expect(screen.getByLabelText('角色面板火焰抗性')).toHaveValue(state.character!.values.fireResistance);
  expect(screen.getByText('更正面板数值／导入记录（高级）').closest('details')!.open).toBe(false);
  await user.selectOptions(screen.getByLabelText('角色火焰抗性上限档位'), '80');
  await user.click(screen.getByRole('button', { name: '保存当前游戏面板基准' }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ caps: expect.objectContaining({ fireResistance: 80 }), values: expect.objectContaining({ fireResistance: state.character!.values.fireResistance }) }));
});
it('does not prefill stale life or invent a zero for missing character stats after a gear change', () => {
  const state = damageState(); state.character!.values.life = 1530; state.slots.ring1 = damageRing.replace('+70', '+90');
  render(<CharacterPanelCalibration state={state} totals={{ life: 90 }} onSave={vi.fn()} />);
  expect(screen.getByLabelText('角色面板最大生命')).toHaveValue(null);
  expect(screen.getByLabelText('角色面板混沌抗性')).not.toHaveValue(null);
});
