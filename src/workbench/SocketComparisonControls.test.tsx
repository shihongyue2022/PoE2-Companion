import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoadoutPanel from './LoadoutPanel';
import { emptyLoadout, LOADOUT_STORAGE_KEY } from './loadout';
import { MORIOR_INVICTUS_SAMPLE } from './fixtures/moriorInvictus';

describe('socket-aware replacement UI', () => {
  beforeEach(() => localStorage.clear());
  it('previews full sockets, confirms their count, compares percentages separately and keeps the saved gear unchanged', async () => {
    const state = { ...emptyLoadout(), slots: { body: MORIOR_INVICTUS_SAMPLE } };
    const stored = JSON.stringify(state); localStorage.setItem(LOADOUT_STORAGE_KEY, stored);
    const user = userEvent.setup();
    render(<LoadoutPanel onPrice={vi.fn()} candidate={{ id: 'morior', raw: MORIOR_INVICTUS_SAMPLE, slot: 'body' }} />);
    const comparison = screen.getByRole('region', { name: '比较替换装备' });
    expect(within(comparison).getByText('装备文本相同，未发现升级差异')).toBeVisible();
    expect(within(comparison).getByRole('button', { name: '无需替换：相同装备文本' })).toBeDisabled();
    expect(within(comparison).getAllByText('待确认镶嵌').length).toBeGreaterThan(0);
    await user.click(within(comparison).getByRole('button', { name: '按两件全部镶嵌比较' }));
    expect(within(comparison).getByRole('row', { name: /全域能量护盾增加/ })).toHaveTextContent('60%60%0%');
    expect(within(comparison).getByRole('row', { name: /每秒生命回复/ })).toHaveTextContent('41410');
    await user.selectOptions(within(comparison).getByLabelText('当前装备已镶嵌数量'), '4');
    expect(within(comparison).getByText('已比较属性提升')).toBeVisible();
    expect(within(comparison).getByRole('row', { name: /每秒生命回复/ })).toHaveTextContent('32.841+8.2');
    expect(within(comparison).getByRole('button', { name: '无需替换：相同装备文本' })).toBeDisabled();
    expect(localStorage.getItem(LOADOUT_STORAGE_KEY)).toBe(stored);
  });
});
