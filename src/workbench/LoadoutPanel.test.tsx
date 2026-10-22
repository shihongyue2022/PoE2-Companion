import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoadoutPanel from './LoadoutPanel';
import { LOADOUT_STORAGE_KEY } from './loadout';

const ring = (name: string, life: number) => `Item Class: Rings
Rarity: Rare
${name}
Gold Ring
--------
Item Level: 82
--------
+${life} to maximum Life
+25% to Fire Resistance`;

describe('loadout player actions', () => {
  beforeEach(() => { localStorage.clear(); });

  it('records two rings independently, restores them, and prices only the selected item without changing the craft session', async () => {
    const user = userEvent.setup();
    const onPrice = vi.fn();
    const craftSession = '{"craft":"keep this item"}';
    localStorage.setItem('poe2-workbench-v1', craftSession);
    const view = render(<LoadoutPanel onPrice={onPrice} league="Forbidden Rites" />);
    await user.click(screen.getByRole('button', { name: '左戒指：未装备' }));
    fireEvent.change(screen.getByLabelText('导入此栏装备'), { target: { value: ring('Cinder Band', 70) } });
    await user.click(screen.getByRole('button', { name: '放入左戒指' }));
    await user.click(screen.getByRole('button', { name: '右戒指：未装备' }));
    fireEvent.change(screen.getByLabelText('导入此栏装备'), { target: { value: ring('Dusk Loop', 90) } });
    await user.click(screen.getByRole('button', { name: '放入右戒指' }));
    expect(screen.getByRole('button', { name: '左戒指：Cinder Band' })).toBeVisible();
    expect(screen.getByRole('button', { name: '右戒指：Dusk Loop' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '估价这件装备' }));
    expect(onPrice).toHaveBeenLastCalledWith(ring('Dusk Loop', 90), 'price');
    await user.click(screen.getByRole('button', { name: '寻找这件的升级' }));
    expect(onPrice).toHaveBeenLastCalledWith(ring('Dusk Loop', 90), 'upgrade');
    expect(localStorage.getItem('poe2-workbench-v1')).toBe(craftSession);
    expect(localStorage.getItem(LOADOUT_STORAGE_KEY)).toContain('Cinder Band');
    view.unmount();
    render(<LoadoutPanel onPrice={onPrice} />);
    expect(screen.getByRole('button', { name: '左戒指：Cinder Band' })).toBeVisible();
    expect(screen.getByRole('button', { name: '右戒指：Dusk Loop' })).toBeVisible();
  });

  it('previews a candidate and shows the delta before explicitly replacing the current slot', async () => {
    const user = userEvent.setup();
    render(<LoadoutPanel onPrice={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '左戒指：未装备' }));
    fireEvent.change(screen.getByLabelText('导入此栏装备'), { target: { value: ring('Cinder Band', 70) } });
    await user.click(screen.getByRole('button', { name: '放入左戒指' }));
    fireEvent.change(screen.getByLabelText('粘贴候选装备'), { target: { value: ring('Dusk Loop', 90) } });
    const comparison = screen.getByRole('region', { name: '比较替换装备' });
    expect(within(comparison).getByText('已比较属性提升')).toBeVisible();
    expect(within(comparison).getByText('+20')).toBeVisible();
    expect(screen.getByRole('button', { name: '左戒指：Cinder Band' })).toBeVisible();
    expect(localStorage.getItem(LOADOUT_STORAGE_KEY)).not.toContain('Dusk Loop');
    await user.click(screen.getByRole('button', { name: '采用候选并替换左戒指' }));
    expect(screen.getByRole('button', { name: '左戒指：Dusk Loop' })).toBeVisible();
    expect(localStorage.getItem(LOADOUT_STORAGE_KEY)).toContain('Dusk Loop');
  });

  it('keeps a mismatched item out of the selected slot and blocks adopting it as a candidate', async () => {
    const user = userEvent.setup();
    render(<LoadoutPanel onPrice={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '胸甲：未装备' }));
    fireEvent.change(screen.getByLabelText('导入此栏装备'), { target: { value: ring('Cinder Band', 70) } });
    await user.click(screen.getByRole('button', { name: '放入胸甲' }));
    expect(screen.getByRole('alert')).toHaveTextContent('不能放入胸甲');
    expect(screen.getByRole('button', { name: '胸甲：未装备' })).toBeVisible();
    fireEvent.change(screen.getByLabelText('粘贴候选装备'), { target: { value: ring('Dusk Loop', 90) } });
    expect(screen.getByRole('button', { name: '采用候选并替换胸甲' })).toBeDisabled();
    expect(screen.getByText('信息不足，暂不能判定升级')).toBeVisible();
  });
});
