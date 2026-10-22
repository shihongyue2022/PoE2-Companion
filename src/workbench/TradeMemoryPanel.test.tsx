import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TradeMemoryPanel from './TradeMemoryPanel';
import { PriceEstimate } from './PriceEstimate';
import { rememberTrade, readTradeMemory, TRADE_MEMORY_KEY } from './tradeMemory';
import { buildEquipmentTrade, equipmentTradeRows } from './genericEquipmentTrade';
import { parseEquipment } from './genericEquipment';
import { BOOTS_SAMPLE } from './fixtures/fullGear';

const equipment = parseEquipment(BOOTS_SAMPLE)!;
const query = buildEquipmentTrade({ equipment, league: 'Test', rows: equipmentTradeRows(equipment, 'strict') }).query;
const input = { query, league: 'Test', raw: BOOTS_SAMPLE, title: '收藏靴子' };
afterEach(() => vi.unstubAllGlobals());

describe('search history and bookmarks', () => {
  it('saves full query without market requests and restores it from storage after remount', async () => {
    const user = userEvent.setup(), network = vi.fn(); vi.stubGlobal('fetch', network);
    const view = render(<><TradeMemoryPanel league="Test" onOpenItem={() => {}} /><PriceEstimate query={query} league="Test" url="https://www.pathofexile.com/trade2" itemRaw={BOOTS_SAMPLE} /></>);
    await user.click(screen.getByText('收藏当前搜索条件'));
    await user.clear(screen.getByRole('textbox', { name: '收藏搜索名称' }));
    await user.type(screen.getByRole('textbox', { name: '收藏搜索名称' }), '全抗靴子');
    await user.type(screen.getByRole('textbox', { name: '收藏搜索分组' }), '冰法升级');
    await user.click(screen.getByRole('button', { name: '保存搜索' }));
    expect(network).not.toHaveBeenCalled();
    view.unmount();
    render(<TradeMemoryPanel league="Test" onOpenItem={() => {}} />);
    await user.click(screen.getByText(/查价历史与收藏/));
    await user.click(screen.getByRole('button', { name: '搜索收藏' }));
    expect(screen.getByText('★ 全抗靴子')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '打开原条件' }));
    expect(screen.getByRole('region', { name: '已保存的搜索条件' })).toBeVisible();
    expect(readTradeMemory()[0]!.query).toEqual(query);
    expect(network).not.toHaveBeenCalled();
    expect(JSON.parse(new URL(screen.getByRole('link', { name: '官网搜索' }).getAttribute('href')!).searchParams.get('q')!)).toEqual(query);
  });
  it('records login errors as failed history and re-queries unchanged original conditions only on request', async () => {
    const user = userEvent.setup();
    const network = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: { kind: 'login', message: '官方要求登录，不能判断有无挂单。' } })));
    vi.stubGlobal('fetch', network);
    render(<><TradeMemoryPanel league="Test" onOpenItem={() => {}} /><PriceEstimate query={query} league="Test" url="https://www.pathofexile.com/trade2" itemRaw={BOOTS_SAMPLE} /></>);
    await user.click(screen.getByRole('button', { name: '获取挂牌估价' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('官方要求登录');
    expect(readTradeMemory()[0]?.observation?.failed).toBe(true);
    await user.click(screen.getByText(/查价历史与收藏/));
    expect(screen.getByText(/上次查询未成功：官方要求登录/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: '打开原条件' }));
    expect(network).toHaveBeenCalledTimes(1);
    await user.click(within(screen.getByRole('region', { name: '已保存的搜索条件' })).getByRole('button', { name: '获取挂牌估价' }));
    expect(network).toHaveBeenCalledTimes(2);
    expect(JSON.parse(network.mock.calls[1]![1]!.body as string)).toEqual({ league: 'Test', search: query });
  });
  it('keeps other leagues separate, filters folders and synchronizes changes from another tab', async () => {
    rememberTrade(input, { save: true, folder: '升级' });
    rememberTrade({ ...input, league: 'Old', title: '旧赛季' }, { save: true, folder: '底材' });
    const user = userEvent.setup(); render(<TradeMemoryPanel league="Test" onOpenItem={() => {}} />);
    await user.click(screen.getByText(/查价历史与收藏/));
    await user.click(screen.getByRole('button', { name: '搜索收藏' }));
    expect(screen.getByText('★ 收藏靴子')).toBeVisible(); expect(screen.queryByText('★ 旧赛季')).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: '显示其他赛季' }));
    expect(screen.getByText('★ 旧赛季')).toBeVisible();
    await user.selectOptions(screen.getByRole('combobox', { name: '筛选收藏分组' }), '底材');
    expect(screen.queryByText('★ 收藏靴子')).toBeNull();
    act(() => { localStorage.removeItem(TRADE_MEMORY_KEY); window.dispatchEvent(new StorageEvent('storage', { key: TRADE_MEMORY_KEY })); });
    expect(screen.queryByText('★ 旧赛季')).toBeNull();
  });
});
