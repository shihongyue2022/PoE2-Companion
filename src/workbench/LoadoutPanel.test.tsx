import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoadoutPanel from './LoadoutPanel';
import { emptyLoadout, LOADOUT_STORAGE_KEY, serializeLoadout } from './loadout';
import { TAMING_LEGACY_RAW, tamingPobXml } from './fixtures/tamingPob';
import { equipmentMetricDetails, parseEquipment } from './genericEquipment';

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
  afterEach(() => { vi.unstubAllGlobals(); });

  it('repairs the selected legacy ring on the equipment page and sends corrected data into pricing', async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, builds: [{ id: 'e'.repeat(64), name: 'Original.xml' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, xml: tamingPobXml() })));
    vi.stubGlobal('fetch', network);
    const before = { ...emptyLoadout(), slots: { ring1: ring('Keep Left', 70), ring2: TAMING_LEGACY_RAW },
      source: { kind: 'pob' as const, fileName: 'Original.xml', setId: '1', setTitle: 'Current', secondWeapons: false, importedAt: '2026-10-22T00:00:00Z', equipmentSignature: '' } };
    localStorage.setItem(LOADOUT_STORAGE_KEY, serializeLoadout(before));
    const user = userEvent.setup(), onPrice = vi.fn();
    const view = render(<LoadoutPanel active={false} onPrice={onPrice} />);
    await user.click(screen.getByRole('button', { name: '右戒指：The Taming' }));
    expect(network).not.toHaveBeenCalled();
    view.rerender(<LoadoutPanel active onPrice={onPrice} />);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(LOADOUT_STORAGE_KEY)!).slots.ring2).not.toContain('PoB数值待'));
    const state = JSON.parse(localStorage.getItem(LOADOUT_STORAGE_KEY)!);
    expect(state.slots.ring1).toBe(before.slots.ring1); expect(state.goals).toEqual(before.goals);
    const details = within(screen.getByRole('region', { name: '右戒指装备详情' }));
    expect(details.getByText('3 项已识别的条件与特殊效果')).toBeInTheDocument();
    expect(details.queryByText(/条词缀仍需核对/)).toBeNull();
    expect(screen.getByRole('region', { name: '右戒指装备详情' }).querySelector('.lo-item-mods')?.textContent).not.toContain('as being boosted');
    expect(equipmentMetricDetails(parseEquipment(state.slots.ring2)!).values).toMatchObject({ dexterity: 14, fireResistance: 38, coldResistance: 38, lightningResistance: 38 });
    await user.click(details.getByRole('button', { name: '估价这件装备' }));
    expect(onPrice).toHaveBeenLastCalledWith(state.slots.ring2, 'price', 'ring2');
    expect(network).toHaveBeenCalledTimes(2);
  });

  it('records a game baseline and distinguishes overcapped resistance from equipment-only changes', async () => {
    const user = userEvent.setup();
    render(<LoadoutPanel onPrice={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '左戒指：未装备' }));
    fireEvent.change(screen.getByLabelText('导入此栏装备'), { target: { value: ring('Cinder Band', 70) } });
    await user.click(screen.getByRole('button', { name: '放入左戒指' }));
    await user.click(screen.getByText('游戏角色面板基准', { exact: false }));
    fireEvent.change(screen.getByLabelText('角色面板最大生命'), { target: { value: '1530' } });
    fireEvent.change(screen.getByLabelText('角色面板能量护盾'), { target: { value: '4898' } });
    fireEvent.change(screen.getByLabelText('角色面板火焰抗性'), { target: { value: '189' } });
    await user.click(screen.getByRole('button', { name: '保存当前游戏面板基准' }));
    fireEvent.change(screen.getByLabelText('粘贴候选装备'), { target: { value: ring('Lower Fire', 70).replace('+25%', '+5%') } });
    expect(screen.getByText('已比较属性持平')).toBeVisible();
    const resistance = within(screen.getByRole('article', { name: '火焰抗性' }));
    expect(resistance.getByText('有效：75% → 75% · 上限 75%')).toBeVisible();
    expect(resistance.getByText('总值：189% → 169%')).toBeVisible();
    const state = JSON.parse(localStorage.getItem(LOADOUT_STORAGE_KEY)!);
    expect(state.character.values).toMatchObject({ life: 1530, energyShield: 4898, fireResistance: 189 });
  });

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
    expect(onPrice).toHaveBeenLastCalledWith(ring('Dusk Loop', 90), 'price', 'ring2');
    await user.click(screen.getByRole('button', { name: '寻找这件的升级' }));
    expect(onPrice).toHaveBeenLastCalledWith(ring('Dusk Loop', 90), 'upgrade', 'ring2');
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

  it('blocks a mismatched direct import but auto-routes a complete candidate to its matching slot', async () => {
    const user = userEvent.setup();
    render(<LoadoutPanel onPrice={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '胸甲：未装备' }));
    fireEvent.change(screen.getByLabelText('导入此栏装备'), { target: { value: ring('Cinder Band', 70) } });
    await user.click(screen.getByRole('button', { name: '放入胸甲' }));
    expect(screen.getByRole('alert')).toHaveTextContent('不能放入胸甲');
    expect(screen.getByRole('button', { name: '胸甲：未装备' })).toBeVisible();
    fireEvent.change(screen.getByLabelText('粘贴候选装备'), { target: { value: ring('Dusk Loop', 90) } });
    expect(screen.getByRole('button', { name: '采用候选并替换左戒指' })).toBeEnabled();
    expect(screen.getByText('请先导入当前左戒指')).toBeVisible();
    expect(screen.getByRole('combobox', { name: '选择装备栏位' })).toHaveValue('ring1');
    expect(localStorage.getItem(LOADOUT_STORAGE_KEY)).toBeNull();
  });
});
