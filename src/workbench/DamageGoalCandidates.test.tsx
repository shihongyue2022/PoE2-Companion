import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EquipmentTradePanel from './EquipmentTradePanel';
import { damageRing, damageState } from './fixtures/damageGoal';

afterEach(() => vi.unstubAllGlobals());
it.each(['loadout', 'single'])('evaluates the whole loadout while searching in %s mode', async (mode) => {
  const network = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, total: 3, fetched: 3, priced: 3,
    groups: [], warnings: [], sampledAt: new Date().toISOString(), cached: false, url: 'https://www.pathofexile.com/trade2/search/poe2/Test/result',
    listings: [
      { id: 'unsafe', name: 'Unsafe Loop', base: 'Gold Ring', price: { amount: 1, currency: 'divine' }, explicitMods: ['+5% to all Elemental Resistances', '+12% to Chaos Resistance', '+70 to maximum Life', '50% increased Attack Speed'] },
      { id: 'tank', name: 'Tank Loop', base: 'Gold Ring', price: { amount: 2, currency: 'divine' }, explicitMods: ['+100% to all Elemental Resistances', '+50% to Chaos Resistance', '+300 to maximum Life', '10% increased Attack Speed'] },
      { id: 'useful', name: 'Useful Loop', base: 'Gold Ring', price: { amount: 10, currency: 'divine' }, explicitMods: ['+15% to all Elemental Resistances', '+12% to Chaos Resistance', '+70 to maximum Life', '15% increased Attack Speed'] },
    ] })));
  vi.stubGlobal('fetch', network);
  const state = damageState(), user = userEvent.setup(), compare = vi.fn();
  render(<EquipmentTradePanel raw={damageRing} league="Test" onLeague={() => {}} intent="upgrade" onCompare={compare} loadoutContext={{ state, slot: 'ring1', raw: damageRing }} />);
  expect(screen.getByRole('region', { name: '整套抗性约束' })).toHaveTextContent('火焰抗性：当前 75% / 目标 75% · 溢出 15%');
  expect(screen.getByRole('combobox', { name: '配装方式' })).toHaveValue('loadout');
  if (mode === 'single') await user.selectOptions(screen.getByRole('combobox', { name: '配装方式' }), 'single');
  const core = screen.getByRole('combobox', { name: '核心属性 1' });
  expect(within(core).getByRole('option', { selected: true })).toHaveTextContent('当前 70');
  await user.click(screen.getByRole('button', { name: '检索提升候选' }));
  await screen.findByText(`符合要求的挂牌 ${mode === 'single' ? 2 : 1}–10 神圣石`);
  expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(mode === 'single' ? 2 : 3);
  if (mode === 'single') {
    expect(screen.getByText(/已排除 1 件核心值不符、抗性未达标/)).toBeVisible();
    expect(within(screen.getByRole('table')).queryByText(/Unsafe/)).not.toBeInTheDocument();
  } else {
    const pending = screen.getByText('需补抗 · 待组合').closest('tr')!;
    expect(pending).toHaveTextContent('火焰抗性 65% / 目标 75%，缺 10%');
    expect(pending).toHaveTextContent('冰冷抗性 65% / 目标 75%，缺 10%');
    expect(pending).toHaveTextContent('闪电抗性 65% / 目标 75%，缺 10%');
    expect(pending).not.toHaveTextContent('混沌抗性');
  }
  await user.click(screen.getAllByRole('button', { name: '比较这件' })[0]!);
  expect(compare).toHaveBeenCalledTimes(1);
  expect(compare.mock.calls[0]![0].raw).toContain(mode === 'single' ? '+100% to all Elemental Resistances' : '+5% to all Elemental Resistances');
  expect(state.slots.ring1).toBe(damageRing);
  const query = JSON.parse(network.mock.calls[0]![1]!.body as string).search;
  expect(query.query.stats.flatMap((group: { filters: { id: string }[] }) => group.filters).some((filter: { id: string }) => filter.id === 'pseudo.pseudo_total_chaos_resistance')).toBe(mode === 'single');
  expect(JSON.stringify(query)).not.toMatch(/[\u3400-\u9fff]/u);
});
