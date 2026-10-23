import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoadoutSourcePanel, { LoadoutChangePreview } from './LoadoutSourcePanel';
import { applyPobLoadout } from './loadoutIntegration';
import { emptyLoadout } from './loadout';

const item = 'Rarity: Unique\nThe Ordained\nSolemn Spear\n--------\nPhysical Damage: 100-200\nAttacks per Second: 1.50\n--------\n220% increased Physical Damage';
describe('visible gear refresh details', () => {
  it('shows the actual roll and weapon DPS delta for a same-name item', () => {
    const before = { ...emptyLoadout(), slots: { mainHand: item } }, after = applyPobLoadout(before, { mainHand: item.replace('220%', '303%').replace('100-200', '150-250') });
    render(<LoadoutChangePreview before={before} after={after} />);
    expect(screen.getByRole('article', { name: '武器组 I · 主手更新详情' })).toHaveTextContent('增加220%物理伤害');
    expect(screen.getByRole('article', { name: '武器组 I · 主手更新详情' })).toHaveTextContent('增加303%物理伤害');
    expect(screen.getByText('武器物理 DPS')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /武器物理 DPS/ })).toHaveTextContent('+75');
    expect(screen.queryByText(/神授命使 → 神授命使/)).toBeNull();
  });
  it('keeps the prior update visible when the most recent import has no gear changes', () => {
    const before = { ...emptyLoadout(), slots: { mainHand: item } }, changed = item.replace('220%', '303%');
    const after = applyPobLoadout(applyPobLoadout(before, { mainHand: changed }), { mainHand: changed });
    render(<LoadoutSourcePanel state={after} />);
    expect(screen.getByRole('status')).toHaveTextContent('无实际装备变化；保留上次有变化的对照');
    expect(screen.getByText('增加220%物理伤害')).toBeInTheDocument();
    expect(screen.getByText('增加303%物理伤害')).toBeInTheDocument();
  });
});
