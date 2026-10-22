import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EquipmentTradePanel from './EquipmentTradePanel';
import { BOOTS_SAMPLE } from './fixtures/fullGear';
import { BREACH_RING_SAMPLE } from './fixtures/breachRing';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch';
import { loadGearTrade } from '../lib/gearTrade';
import { LEGACY_ORDAINED_RAW, ORDAINED_POB_ITEM, ordainedPobXml } from './fixtures/ordainedPob';
import { emptyLoadout } from './loadout';

const t1Data = loadShippedPatch('data/patches/0.5.0');
const t1Trade = await loadGearTrade();

afterEach(() => vi.unstubAllGlobals());
describe('comprehensive upgrade market search', () => {
  it.each(['upgrade', 'price'] as const)('automatically repairs and searches the reported PoB weapon from the %s entry', async (entry) => {
    const network = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, builds: [{ id: 'a'.repeat(64), name: 'Original.xml' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, xml: ordainedPobXml() })))
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, total: 0, fetched: 0, priced: 0, groups: [], warnings: [], sampledAt: new Date().toISOString(), cached: false, url: 'https://www.pathofexile.com/trade2' })));
    vi.stubGlobal('fetch', network);
    const onRepairItem = vi.fn();
    const state = { ...emptyLoadout(), slots: { mainHand: LEGACY_ORDAINED_RAW }, source: { kind: 'pob' as const, fileName: 'Original.xml', setId: '1', setTitle: 'Current', secondWeapons: false, importedAt: '2026-10-22T00:00:00Z', equipmentSignature: '' } };
    render(<EquipmentTradePanel raw={LEGACY_ORDAINED_RAW} league="Test" onLeague={() => {}} intent={entry} onRepairItem={onRepairItem}
      loadoutContext={{ state, slot: 'mainHand', raw: LEGACY_ORDAINED_RAW }} />);
    if (entry === 'price') {
      expect(network).not.toHaveBeenCalled();
      await userEvent.setup().click(screen.getByRole('button', { name: /综合找升级/ }));
    }
    expect(screen.queryByRole('button', { name: '搜索市场综合候选' })).toBeNull();
    expect(screen.getByText(/9 条词缀带有旧 PoB 待核对标记/)).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: '搜索市场综合候选' })).toBeVisible());
    expect(onRepairItem).toHaveBeenCalledTimes(1);
    expect(onRepairItem.mock.calls[0]![0]).toBe(LEGACY_ORDAINED_RAW);
    expect(onRepairItem.mock.calls[0]![1]).not.toContain('PoB数值待');
    const url = new URL(screen.getByRole('link', { name: '打开升级候选搜索' }).getAttribute('href')!);
    const query = JSON.parse(url.searchParams.get('q')!);
    expect(query.sort).toEqual({ 'statgroup.0': 'desc' }); expect(query.query.stats[0].filters.length).toBeGreaterThan(1);
    expect(query.query.name).toBe('The Ordained'); expect(query.query.filters.misc_filters.filters.corrupted).toBeUndefined();
    expect(query.query.stats.find((group: { type: string }) => group.type === 'and').filters).toContainEqual({ id: 'skill.righteous_descent', disabled: false });
    expect(query.query.stats[0].filters.some((filter: { id: string }) => filter.id.startsWith('skill.'))).toBe(false);
    expect(screen.getByText('已识别但无独立交易条件（1）')).toBeInTheDocument();
    expect(screen.queryByText(/未单独筛选的文字/)).toBeNull();
    expect(screen.getByRole('link', { name: '这件传奇的词缀与机制 ↗', hidden: true })).toHaveAttribute('href', 'https://poe2db.tw/us/The_Ordained');
    await waitFor(() => expect(network).toHaveBeenCalledTimes(3), { timeout: 2000 });
    expect(JSON.parse(network.mock.calls[2]![1]!.body as string).search).toEqual(query);
    await userEvent.setup().click(screen.getByRole('checkbox', { name: '限定同名传奇' }));
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(network).toHaveBeenCalledTimes(3); // Editing filters must not auto-send repeated market requests.

  });
  it('shows a changed-source error without replacing the existing item or enabling unsafe scoring', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, builds: [{ id: 'b'.repeat(64), name: 'Original.xml' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, xml: ordainedPobXml(ORDAINED_POB_ITEM.replace('220%', '240%')) }))));
    const onRepairItem = vi.fn();
    const state = { ...emptyLoadout(), slots: { mainHand: LEGACY_ORDAINED_RAW }, source: { kind: 'pob' as const, fileName: 'Original.xml', setId: '1', setTitle: 'Current', secondWeapons: false, importedAt: '2026-10-22T00:00:00Z', equipmentSignature: '' } };
    render(<EquipmentTradePanel raw={LEGACY_ORDAINED_RAW} league="Test" onLeague={() => {}} intent="upgrade" onRepairItem={onRepairItem}
      loadoutContext={{ state, slot: 'mainHand', raw: LEGACY_ORDAINED_RAW }} />);
    const repair = screen.getByRole('region', { name: '修复 PoB 装备识别' });
    expect(await within(repair).findByRole('alert')).toHaveTextContent('装备与当前记录不同');
    expect(onRepairItem).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '搜索市场综合候选' })).toBeNull();
  });
  it('queries all six T1 affix directions and keeps the strict query when the market has no listings', async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, total: 0, fetched: 0,
      priced: 0, groups: [], warnings: [], sampledAt: new Date().toISOString(), cached: false, url: 'https://www.pathofexile.com/trade2' })));
    vi.stubGlobal('fetch', network);
    const user = userEvent.setup();
    render(<EquipmentTradePanel raw={BREACH_RING_SAMPLE} league="Test" onLeague={() => {}} t1Data={t1Data} t1Trade={t1Trade} />);
    await user.click(screen.getByRole('button', { name: /同类全词缀 T1/ }));
    expect(screen.getByText('全部词缀同时满足 T1 参考门槛')).toBeVisible();
    expect(screen.getByText(/已核对 6 条 T1 数值条件/)).toBeVisible();
    const before = screen.getByRole('link', { name: '打开同类全 T1 搜索' }).getAttribute('href');
    await user.click(screen.getByRole('button', { name: '查询全 T1 市场' }));
    expect(await screen.findByText(/当前联盟未找到同时满足全部 T1 参考门槛的挂牌/)).toBeVisible();
    expect(screen.getByRole('link', { name: '打开同类全 T1 搜索' }).getAttribute('href')).toBe(before);
    expect(network).toHaveBeenCalledTimes(1);
    const request = JSON.parse(network.mock.calls[0]![1]!.body as string);
    const filters = request.search.query.stats.flatMap((group: { filters: unknown[] }) => group.filters);
    expect(filters.some((filter: { value?: { min: number } }) => filter.value?.min === 165)).toBe(true);
    expect(request.search.query.type).toBeUndefined();
    expect(request.search.sort).toEqual({ price: 'asc' });
  });
  it('blocks incomplete T1 queries and labels edited weaker conditions as custom', async () => {
    const user = userEvent.setup();
    const view = render(<EquipmentTradePanel raw={BOOTS_SAMPLE + '\nUnknown actual affix'} league="Test" onLeague={() => {}} intent="t1" t1Data={t1Data} t1Trade={t1Trade} />);
    expect(screen.getByRole('alert')).toHaveTextContent('完整的全词缀 T1 条件');
    expect(screen.queryByRole('button', { name: '查询全 T1 市场' })).toBeNull();
    view.unmount();
    render(<EquipmentTradePanel raw={BOOTS_SAMPLE} league="Test" onLeague={() => {}} intent="t1" t1Data={t1Data} t1Trade={t1Trade} />);
    const input = screen.getByRole('spinbutton', { name: /冰冷抗性下限/ });
    await user.clear(input); await user.type(input, '20');
    expect(screen.getByText('已调整为自定义条件，不再要求全词缀 T1')).toBeVisible();
    expect(screen.queryByRole('button', { name: '查询全 T1 市场' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '重新应用全部 T1 门槛' }));
    expect(screen.getByRole('spinbutton', { name: /冰冷抗性下限/ })).toHaveValue(41);
    expect(screen.getByRole('button', { name: '查询全 T1 市场' })).toBeVisible();
  });
  it('keeps the full T1 link and shows anonymous-query restrictions without reporting no listings', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: false,
      error: { kind: 'login', message: '请登录官网后打开完整搜索链接，此限制不代表市场没有挂单。' } }))));
    const user = userEvent.setup();
    render(<EquipmentTradePanel raw={BREACH_RING_SAMPLE} league="Test" onLeague={() => {}} intent="t1" t1Data={t1Data} t1Trade={t1Trade} />);
    const before = screen.getByRole('link', { name: '打开同类全 T1 搜索' }).getAttribute('href');
    await user.click(screen.getByRole('button', { name: '查询全 T1 市场' }));
    expect(await screen.findByText(/请登录官网后打开完整搜索链接/)).toBeVisible();
    expect(screen.queryByText(/当前联盟未找到同时满足/)).toBeNull();
    expect(screen.getByRole('link', { name: '打开同类全 T1 搜索' }).getAttribute('href')).toBe(before);
  });
  it('shows editable weights, passes official weighted sorting and ranks useful tradeoffs', async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, total: 2,
      fetched: 2, priced: 2, groups: [], warnings: [], sampledAt: new Date().toISOString(), cached: false,
      url: 'https://www.pathofexile.com/trade2/search/poe2/Test/result', listings: [
        { id: 'cheap', name: 'Cheap Boots', base: 'Adherent Leggings', price: { amount: 1, currency: 'divine' }, explicitMods: ['+20 to maximum Life', '+10% to Cold Resistance', '10% increased Movement Speed'] },
        { id: 'better', name: 'Balanced Boots', base: 'Adherent Leggings', price: { amount: 20, currency: 'divine' }, explicitMods: ['+70 to maximum Life', '+60% to Cold Resistance', '45% increased Movement Speed'] },
      ] })));
    vi.stubGlobal('fetch', network);
    const user = userEvent.setup();
    render(<EquipmentTradePanel raw={BOOTS_SAMPLE} league="Test" onLeague={() => {}} intent="upgrade" />);
    expect(screen.queryByText(/提高下限10%/)).toBeNull();
    const weight = screen.getAllByRole('spinbutton', { name: /权重$/ });
    expect(weight.length).toBeGreaterThanOrEqual(3);
    await user.type(screen.getByRole('spinbutton', { name: '升级预算上限' }), '25');
    await user.click(screen.getByRole('button', { name: '搜索市场综合候选' }));
    await waitFor(() => expect(screen.getByText(/#1 Balanced Boots/)).toBeVisible());
    expect(screen.getByText('有取舍，含下降属性', { exact: false })).toBeVisible();
    const request = JSON.parse(network.mock.calls[0]![1]!.body as string);
    expect(request.search.sort).toEqual({ 'statgroup.0': 'desc' });
    expect(request.search.query.filters.trade_filters.filters.price).toEqual({ max: 25, option: 'divine' });
    expect(screen.queryByText('相似物品挂牌参考')).toBeNull();
  });
});
