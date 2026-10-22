import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EquipmentTradePanel from './EquipmentTradePanel';
import { damageRing, damageState } from './fixtures/damageGoal';

afterEach(() => vi.unstubAllGlobals());
it('ranks capped candidates ahead of higher damage uncapped items and locks pseudo floors without pricing life', async () => {
  const network = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, total: 3, fetched: 3, priced: 3,
    groups: [], warnings: [], sampledAt: new Date().toISOString(), cached: false, url: 'https://www.pathofexile.com/trade2/search/poe2/Test/result',
    listings: [
      { id: 'unsafe', name: 'Unsafe Loop', base: 'Gold Ring', price: { amount: 1, currency: 'divine' }, explicitMods: ['+5% to all Elemental Resistances', '+12% to Chaos Resistance', '50% increased Attack Speed'] },
      { id: 'tank', name: 'Tank Loop', base: 'Gold Ring', price: { amount: 1, currency: 'divine' }, explicitMods: ['+100% to all Elemental Resistances', '+50% to Chaos Resistance', '+300 to maximum Life', '10% increased Attack Speed'] },
      { id: 'useful', name: 'Useful Loop', base: 'Gold Ring', price: { amount: 10, currency: 'divine' }, explicitMods: ['+15% to all Elemental Resistances', '+12% to Chaos Resistance', '15% increased Attack Speed'] },
    ] })));
  vi.stubGlobal('fetch', network);
  const state = damageState(), user = userEvent.setup();
  render(<EquipmentTradePanel raw={damageRing} league="Test" onLeague={() => {}} intent="upgrade" loadoutContext={{ state, slot: 'ring1', raw: damageRing }} />);
  expect(screen.getByRole('region', { name: '四抗封顶伤害目标' })).toBeVisible();
  await user.click(screen.getByText(/^调整搜索条件/));
  const floor = screen.getByRole('checkbox', { name: '搜索属性：封顶所需火焰抗性合计' });
  expect(floor).toBeChecked(); expect(floor).toBeDisabled();
  expect(screen.getByRole('spinbutton', { name: '70最大生命权重' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '搜索市场综合候选' }));
  const first = await screen.findByText('#1 Useful Loop');
  expect(first).toBeVisible();
  expect(screen.getByText('#2 Tank Loop')).toBeVisible();
  const unsafe = screen.getByText('#3 Unsafe Loop').closest('article')!;
  expect(within(unsafe).getByText('抗性未达上限，不符合配装目标')).toBeVisible();
  const query = JSON.parse(network.mock.calls[0]![1]!.body as string).search;
  expect(query.query.stats.filter((group: { type: string }) => group.type === 'and').flatMap((group: { filters: { id: string }[] }) => group.filters).some((filter: { id: string }) => filter.id === 'pseudo.pseudo_total_chaos_resistance')).toBe(true);
  expect(JSON.stringify(query)).not.toMatch(/[\u3400-\u9fff]/u);
});
