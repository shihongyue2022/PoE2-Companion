import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch';
import { loadGearTrade } from '../lib/gearTrade';
import EquipmentTradePanel from './EquipmentTradePanel';
import { damageState } from './fixtures/damageGoal';
import { equipmentSignature } from './characterPanel';

const data = loadShippedPatch('data/patches/0.5.0'), trade = await loadGearTrade();
const raw = 'Rarity: Rare\nSynthetic Belt\nRawhide Belt\n--------\nItem Level: 84\n--------\n+60 to maximum Life';
const context = (text = raw) => {
  const state = damageState(); state.slots = { belt: text };
  state.character!.equipmentSignature = state.source!.equipmentSignature = equipmentSignature(state.slots);
  state.character!.values = { fireResistance: 150, coldResistance: 150, lightningResistance: 150, chaosResistance: 57 };
  return { state, slot: 'belt' as const, raw: text };
};
afterEach(() => vi.unstubAllGlobals());
describe('recommended missing affixes in the real search editor', () => {
  it('exposes a missing chaos suffix, tier selector and a price query while preserving total chaos floor', async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, total: 5, fetched: 5, priced: 5, groups: [{ currency: 'divine', count: 5, min: 10, median: 12, max: 15, p25: 11, p75: 14 }], listings: [], sampledAt: new Date().toISOString(), warnings: [], cached: false, url: 'https://www.pathofexile.com/trade2' })));
    vi.stubGlobal('fetch', network);
    const user = userEvent.setup();
    render(<EquipmentTradePanel raw={raw} league="Test" onLeague={() => {}} intent="upgrade" loadoutContext={context()} t1Data={data} t1Trade={trade} />);
    expect(screen.getByRole('region', { name: '角色缺口推荐检索' })).toHaveTextContent('混沌抗性 · 候选本栏合计 ≥ 18%');
    const checkbox = screen.getByRole('checkbox', { name: '搜索属性：#%混沌抗性' });
    await user.click(checkbox);
    const presenceQuery = JSON.parse(new URL(screen.getByRole('link', { name: '打开升级候选搜索' }).getAttribute('href')!).searchParams.get('q')!);
    expect(presenceQuery.query.stats.flatMap((group: { filters: { id: string }[] }) => group.filters).some((filter: { id: string }) => filter.id.startsWith('explicit.'))).toBe(true);
    await user.selectOptions(screen.getByRole('combobox', { name: '#%混沌抗性搜索档位' }), 't1');
    const query = JSON.parse(new URL(screen.getByRole('link', { name: '打开升级候选搜索' }).getAttribute('href')!).searchParams.get('q')!);
    expect(query.query.stats.flatMap((group: { filters: unknown[] }) => group.filters)).toContainEqual({ id: 'pseudo.pseudo_total_chaos_resistance', value: { min: 18 }, disabled: false });
    expect(screen.getByRole('region', { name: '后缀搜索属性' })).toHaveTextContent('T1 阶层范围 24–27');
    const price = screen.getByLabelText('词缀价格影响');
    await user.selectOptions(within(price).getByRole('combobox'), 'need:chaosResistance');
    await user.click(within(price).getByRole('button', { name: '查询T1 起步价格' }));
    expect(await within(price).findByText(/神圣石 · 低价 10/)).toBeInTheDocument();
    const requests = network.mock.calls.map((call) => JSON.parse(call[1]!.body as string).search);
    expect(requests.some((request) => request.sort.price === 'asc' && request.query.stats.flatMap((group: { filters: unknown[] }) => group.filters).some((filter: { value?: { min: number } }) => filter.value?.min === 24))).toBe(true);
  });
  it('requires explicit rare-alternative selection before adding ordinary chaos to the unique belt search', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: { kind: 'network', message: '测试未连接市场' } }))));
    const unique = 'Rarity: Unique\nMidnight Braid\nRawhide Belt\n--------\n+41 to maximum Mana\n50% of Damage taken Recouped as Mana';
    const user = userEvent.setup();
    render(<EquipmentTradePanel raw={unique} league="Test" onLeague={() => {}} intent="upgrade" loadoutContext={context(unique)} t1Data={data} t1Trade={trade} />);
    expect(screen.queryByRole('checkbox', { name: '搜索属性：#%混沌抗性' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '检索同部位稀有替代' }));
    expect(screen.getByRole('checkbox', { name: '搜索属性：#%混沌抗性' })).toBeInTheDocument();
    let query = JSON.parse(new URL(screen.getByRole('link', { name: '打开升级候选搜索' }).getAttribute('href')!).searchParams.get('q')!);
    expect(query.query.name).toBeUndefined();
    expect(query.query.filters.type_filters.filters.rarity.option).toBe('nonunique');
    expect(screen.getByRole('region', { name: '传奇与稀有补抗替代' })).toHaveTextContent('须核对');
    await user.click(screen.getByRole('button', { name: '返回同名传奇检索' }));
    query = JSON.parse(new URL(screen.getByRole('link', { name: '打开升级候选搜索' }).getAttribute('href')!).searchParams.get('q')!);
    expect(query.query.name).toBe('Midnight Braid');
    expect(screen.queryByRole('checkbox', { name: '搜索属性：#%混沌抗性' })).toBeNull();
  });
});
