import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoadoutPanel from './LoadoutPanel';
import PobImportPanel from './PobImportPanel';
import { emptyLoadout, LOADOUT_STORAGE_KEY, serializeLoadout } from './loadout';
import { applyPobLoadout } from './loadoutIntegration';
import { parsePobXml, pobImportSource, previewPob } from './pobImport';
import { dualWeaponsXml, secondWeapon, firstWeapon } from './fixtures/dualWeapons';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());
describe('weapon group controls', () => {
  it('switches both hands, clears the old candidate and sends the selected group weapon into pricing', async () => {
    const document = parsePobXml(dualWeaponsXml), preview = previewPob(document, '1', false);
    const state = applyPobLoadout(emptyLoadout(), preview.slots, pobImportSource(document, '1', false, preview.slots));
    localStorage.setItem(LOADOUT_STORAGE_KEY, serializeLoadout(state));
    const user = userEvent.setup(), onPrice = vi.fn(); render(<LoadoutPanel active={false} onPrice={onPrice} />);
    fireEvent.change(screen.getByLabelText('粘贴候选装备'), { target: { value: firstWeapon } });
    const controls = screen.getByRole('group', { name: '当前武器组' });
    await user.click(within(controls).getByRole('button', { name: /武器组 II/ }));
    expect(screen.getByRole('button', { name: '主手：Second Weapon' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '副手：Second Shield' })).toBeInTheDocument();
    expect(screen.getByLabelText('粘贴候选装备')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: '估价这件装备' }));
    expect(onPrice).toHaveBeenCalledWith(secondWeapon, 'price', 'mainHand');
    await user.click(within(controls).getByRole('button', { name: /^武器组 I\s/ }));
    expect(screen.getByRole('button', { name: '主手：First Weapon' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '副手：未装备' })).toBeInTheDocument();
  });
  it('previews both weapon pairs and imports both after one confirmation', async () => {
    const onImport = vi.fn(), user = userEvent.setup(); render(<PobImportPanel onImport={onImport} />);
    fireEvent.change(screen.getByLabelText('PoB2 分享代码或 XML'), { target: { value: dualWeaponsXml } });
    await user.click(screen.getByRole('button', { name: '预览 PoB2 装备' }));
    expect(screen.getByLabelText('两套武器预览')).toHaveTextContent('武器组 I · 启用');
    expect(screen.getByLabelText('两套武器预览')).toHaveTextContent('武器组 II · 备用');
    await user.click(screen.getByRole('button', { name: /确认替换整套装备/ }));
    expect(onImport.mock.calls[0]![1].weaponSets.second.offHand).toContain('Second Shield');
  });
});
