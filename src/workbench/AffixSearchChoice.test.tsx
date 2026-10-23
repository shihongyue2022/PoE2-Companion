import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AffixSearchChoice, { affixSearchChoices } from './AffixSearchChoice';
import type { EquipmentTradeRow } from './genericEquipmentTrade';
import type { RollGuide } from './searchGuidance';
const row: EquipmentTradeRow = { key: 'life', label: '最大生命', ids: ['explicit.life'], actualValue: 80, enabled: true, min: '', max: '' };
const guide: RollGuide = { safe: true, lowerIsBetter: false, top: { min: 120, max: 150 }, note: '', tiers: [
  { tier: 1, min: 120, roll: { min: 120, max: 150 }, requiredLevel: 82 },
  { tier: 2, min: 90, roll: { min: 90, max: 119 }, requiredLevel: 73 },
  { tier: 3, min: 60, roll: { min: 60, max: 89 }, requiredLevel: 64 },
] };
it('applies a verified tier threshold with one selection and never requires roll entry', async () => {
  const choose = vi.fn(); render(<AffixSearchChoice row={row} guide={guide} onChoose={choose} />);
  await userEvent.setup().selectOptions(screen.getByLabelText('最大生命搜索档位'), 't2');
  expect(choose).toHaveBeenLastCalledWith({ min: '90', max: '' });
  await userEvent.setup().selectOptions(screen.getByLabelText('最大生命搜索档位'), 'max');
  expect(choose).toHaveBeenLastCalledWith({ min: '150', max: '' });
});
it('preserves signed upper bounds and offers no fictional tiers for quality or unknown ranges', () => {
  const reduced = affixSearchChoices({ ...row, actualValue: -25 }, { safe: true, lowerIsBetter: true, top: { min: -30, max: -20 }, note: '' });
  expect(reduced.find((choice) => choice.id === 'max')).toMatchObject({ min: '', max: '-30' });
  expect(affixSearchChoices(row, { ...guide, safe: false }).map((choice) => choice.id)).toEqual(['auto', 'current']);
  expect(affixSearchChoices(row).map((choice) => choice.id)).toEqual(['auto', 'current']);
  expect(affixSearchChoices(row, { ...guide, unique: true, tiers: undefined }).some((choice) => /^t\d/.test(choice.id))).toBe(false);
});
it('does not expose an editable tier for a locked resistance requirement', () => {
  const view = render(<AffixSearchChoice row={{ ...row, locked: true }} guide={guide} onChoose={vi.fn()} />);
  expect(view.container.querySelector('select')).toBeNull();
});
