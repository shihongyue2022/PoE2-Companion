import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchGuidancePanel, { RollRangeHint } from './SearchGuidancePanel';

// The detailed tier editor remains available to explicit T1 tools; normal
// equipment searches now use the compact core builder instead.
it('keeps the detailed tier control callbacks and roll hints usable independently of the compact search page', async () => {
  const choose = vi.fn();
  render(<><SearchGuidancePanel ambition="auto" onChoose={choose} guideCount={1} note="" busy={false} unique={false} />
    <RollRangeHint guide={{ safe: true, lowerIsBetter: false, current: { min: 90, max: 100 }, currentPercent: 100, top: { min: 120, max: 150 }, tierFloor: { min: 120 }, note: '' }} /></>);
  await userEvent.click(screen.getByRole('button', { name: /已核对项达 T1/ }));
  expect(choose).toHaveBeenLastCalledWith('t1');
  await userEvent.click(screen.getByRole('button', { name: /保留当前数值/ }));
  expect(choose).toHaveBeenLastCalledWith('current');
  expect(screen.getByText(/当前阶层范围 90–100.*100%/)).toBeVisible();
  expect(screen.getByText(/T1 阶层范围 120–150/)).toBeVisible();
});
it('does not label a unique item as T1 and only requests its range when explicitly invoked', async () => {
  const lookup = vi.fn(), choose = vi.fn();
  render(<SearchGuidancePanel ambition="auto" onChoose={choose} guideCount={0} note="" busy={false} unique onLookup={lookup} />);
  expect(screen.getByRole('button', { name: /已核对项达 T1/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: /接近满 roll/ })).toBeDisabled();
  expect(lookup).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '核对传奇英文 roll 范围' }));
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(choose).not.toHaveBeenCalled();
});
