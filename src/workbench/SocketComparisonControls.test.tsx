import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoadoutPanel from './LoadoutPanel';
import { emptyLoadout, LOADOUT_STORAGE_KEY } from './loadout';
import { MORIOR_INVICTUS_SAMPLE, MORIOR_INVICTUS_CANDIDATE } from './fixtures/moriorInvictus';
import { REPLACEMENT_BEFORE } from './fixtures/weaponReplacement';

describe('socket-aware replacement UI', () => {
  beforeEach(() => localStorage.clear());
  it('lets an older saved item confirm actual occupancy without replacing its text', async () => {
    localStorage.setItem(LOADOUT_STORAGE_KEY, JSON.stringify({ ...emptyLoadout(), slots: { body: MORIOR_INVICTUS_SAMPLE } }));
    const user = userEvent.setup();
    render(<LoadoutPanel onPrice={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '胸甲：不敗亡者' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '本栏装备实际镶嵌数量' }), '5');
    const saved = JSON.parse(localStorage.getItem(LOADOUT_STORAGE_KEY)!);
    expect(saved.slots.body).toBe(MORIOR_INVICTUS_SAMPLE);
    expect(saved.socketEvidence).toEqual([{ itemText: MORIOR_INVICTUS_SAMPLE, filled: 5 }]);
  });
  it('corrects a stale incoming market slot before rendering a body comparison', () => {
    localStorage.setItem(LOADOUT_STORAGE_KEY, JSON.stringify({ ...emptyLoadout(), slots: { mainHand: REPLACEMENT_BEFORE, body: MORIOR_INVICTUS_SAMPLE } }));
    render(<LoadoutPanel onPrice={vi.fn()} candidate={{ id: 'stale-target', raw: MORIOR_INVICTUS_CANDIDATE, slot: 'mainHand' }} />);
    expect(screen.getByRole('combobox', { name: '选择装备栏位' })).toHaveValue('body');
    expect(within(screen.getByRole('region', { name: '比较替换装备' })).getByText('当前：不败亡者')).toBeVisible();
  });
  it('routes a pasted body candidate away from the spear and shows the actual defensive/regeneration tradeoff', async () => {
    const state = { ...emptyLoadout(), slots: { mainHand: REPLACEMENT_BEFORE, body: MORIOR_INVICTUS_SAMPLE } };
    const stored = JSON.stringify(state); localStorage.setItem(LOADOUT_STORAGE_KEY, stored);
    const user = userEvent.setup();
    render(<LoadoutPanel onPrice={vi.fn()} />);
    await user.click(screen.getByText('比较候选装备 · 替换主手'));
    fireEvent.change(screen.getByLabelText('粘贴候选装备'), { target: { value: MORIOR_INVICTUS_CANDIDATE } });
    expect(screen.getByRole('combobox', { name: '选择装备栏位' })).toHaveValue('body');
    const comparison = within(screen.getByRole('region', { name: '比较替换装备' }));
    expect(comparison.getByText('当前：不败亡者')).toBeVisible();
    expect(comparison.queryByText('当前：神授命使')).toBeNull();
    await user.click(comparison.getByRole('button', { name: '按两件全部镶嵌比较' }));
    const advice = within(comparison.getByRole('region', { name: '换装结论摘要' }));
    expect(advice.getByText('这件有取舍，不是全面升级')).toBeVisible();
    expect(advice.getByText('护甲：1,532 → 1,366（-166）')).toBeVisible();
    expect(advice.getByText('每秒生命回复（固定值）：41 → 59（+18）')).toBeVisible();
    expect(comparison.getByRole('row', { name: /全域能量护盾增加/ })).toHaveTextContent('60%60%0%');
    expect(comparison.getByRole('row', { name: /火焰抗性/ })).toHaveTextContent('50%45%-5%');
    expect(localStorage.getItem(LOADOUT_STORAGE_KEY)).toBe(stored);
  });
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
