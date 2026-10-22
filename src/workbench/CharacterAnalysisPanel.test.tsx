import { expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CharacterAnalysisPanel from './CharacterAnalysisPanel';
import { emptyLoadout } from './loadout';
import { combatXml } from './fixtures/pobCombat';
import { parsePobXml, pobImportSource, previewPob } from './pobImport';

it('shows localized gem links and damage breakdown, keeps saved zero FullDPS distinct and navigates slot contributions', async () => {
  const parsed = parsePobXml(combatXml), preview = previewPob(parsed, '1', false);
  const state = { ...emptyLoadout(), slots: preview.slots, source: pobImportSource(parsed, '1', false, preview.slots) };
  const select = vi.fn(), user = userEvent.setup();
  const view = render(<CharacterAnalysisPanel state={state} onSave={() => true} onSelectSlot={select} />);
  await user.click(screen.getByText('技能与构成 · 闪电长矛'));
  const gems = screen.getByRole('region', { name: '主技能与辅助宝石' });
  expect(within(gems).getByText('闪电长矛')).toBeVisible();
  expect(within(gems).getByText('元素武装 II')).toBeVisible();
  expect(within(gems).getByText('技能 · 等级 18 · 品质 20%')).toBeVisible();
  const damage = screen.getByRole('region', { name: '技能伤害构成' });
  expect(within(damage).getByText('174.46')).toBeVisible();
  expect(within(damage).getByText(/不表示角色伤害为零/)).toBeVisible();
  expect(within(damage).getByText(/不重复相加/)).toBeVisible();
  await user.selectOptions(screen.getByRole('combobox', { name: '装备贡献属性' }), 'life');
  await user.click(screen.getByRole('button', { name: '左戒指 70' }));
  expect(select).toHaveBeenCalledWith('ring1');
  view.rerender(<CharacterAnalysisPanel state={{ ...state, slots: {} }} onSave={() => true} onSelectSlot={select} />);
  expect(screen.getByText(/装备或武器组与伤害快照不同/)).toBeVisible();
  expect(screen.getByText(/保存时伤害（快照待更新）/)).toBeVisible();
});
