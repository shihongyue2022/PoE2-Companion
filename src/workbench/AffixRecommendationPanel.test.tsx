import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EquipmentTradePanel from './EquipmentTradePanel';
import { damageState } from './fixtures/damageGoal';
import { equipmentSignature } from './characterPanel';

const raw = 'Rarity: Rare\nSynthetic Belt\nRawhide Belt\n--------\nItem Level: 84\n--------\n+60 to maximum Life';
const context = (text = raw) => {
  const state = damageState(); state.slots = { belt: text };
  state.character!.equipmentSignature = state.source!.equipmentSignature = equipmentSignature(state.slots);
  state.character!.values = { fireResistance: 150, coldResistance: 150, lightningResistance: 150, chaosResistance: 57 };
  return { state, slot: 'belt' as const, raw: text };
};
afterEach(() => vi.unstubAllGlobals());
describe('whole-loadout resistance planning in compact core search', () => {
  it('leaves room for another slot to fill chaos and only adds an item floor in single-slot mode', async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, total: 0, fetched: 0, priced: 0, groups: [], listings: [], sampledAt: new Date().toISOString(), warnings: [], cached: false, url: 'https://www.pathofexile.com/trade2' })));
    vi.stubGlobal('fetch', network);
    render(<EquipmentTradePanel raw={raw} league="Test" onLeague={() => {}} intent="upgrade" loadoutContext={context()} />);
    expect(screen.getByRole('region', { name: '整套抗性约束' })).toHaveTextContent('混沌抗性：当前 57% / 目标 75%');
    expect(screen.queryByRole('spinbutton', { name: /权重/ })).not.toBeInTheDocument();
    for (const mode of ['loadout', 'single']) {
      await userEvent.selectOptions(screen.getByRole('combobox', { name: '配装方式' }), mode);
      for (const name of ['官网核对联合条件 ↗', '官网按核心属性降序 ↗']) {
        const query = JSON.parse(new URL(screen.getByRole('link', { name }).getAttribute('href')!).searchParams.get('q')!);
        const filters = query.query.stats.flatMap((group: { filters: unknown[] }) => group.filters);
        if (mode === 'single') expect(filters).toContainEqual({ id: 'pseudo.pseudo_total_chaos_resistance', value: { min: 18 }, disabled: false });
        else expect(JSON.stringify(filters)).not.toContain('pseudo_total_chaos_resistance');
        expect(JSON.stringify(query)).not.toMatch(/[\u3400-\u9fff]/u);
      }
    }
    await userEvent.click(screen.getByRole('button', { name: '检索提升候选' }));
    expect(network).toHaveBeenCalledTimes(1);
  });
  it('keeps same-unique identity without requiring chaos to appear on that unique belt', () => {
    const unique = 'Rarity: Unique\nMidnight Braid\nRawhide Belt\n--------\n+41 to maximum Mana\n50% of Damage taken Recouped as Mana';
    render(<EquipmentTradePanel raw={unique} league="Test" onLeague={() => {}} intent="upgrade" loadoutContext={context(unique)} />);
    const query = JSON.parse(new URL(screen.getByRole('link', { name: '官网核对联合条件 ↗' }).getAttribute('href')!).searchParams.get('q')!);
    expect(query.query.name).toBe('Midnight Braid');
    expect(JSON.stringify(query)).not.toContain('pseudo_total_chaos_resistance');
    expect(screen.queryByRole('checkbox', { name: '搜索属性：#%混沌抗性' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '整套抗性约束' })).toHaveTextContent('混沌抗性：当前 57% / 目标 75%');
  });
});
