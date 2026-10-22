import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch';
import { loadGearTrade } from '../lib/gearTrade';
import EquipmentTradePanel from './EquipmentTradePanel';
import { BOOTS_SAMPLE } from './fixtures/fullGear';

afterEach(() => vi.unstubAllGlobals());

it('generates T1 and near-perfect thresholds, displays tier roll ranges and folds manual numbers', async () => {
  const data = loadShippedPatch('data/patches/0.5.0'), trade = await loadGearTrade(), user = userEvent.setup();
  render(<EquipmentTradePanel raw={BOOTS_SAMPLE} league="Test" onLeague={vi.fn()} intent="upgrade" t1Data={data} t1Trade={trade} />);
  expect(screen.getByRole('region', { name: '自动设置搜索条件' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: /已核对项达 T1/ }));
  let query = JSON.parse(new URL(screen.getByRole('link', { name: '打开升级候选搜索' }).getAttribute('href')!).searchParams.get('q')!);
  expect(query.query.stats.flatMap((group: { filters: { value?: { min?: number } }[] }) => group.filters).some((filter: { value?: { min?: number } }) => filter.value?.min === 120)).toBe(true);
  await user.click(screen.getByText(/^调整搜索条件/));
  expect(screen.getByText(/当前阶层范围 90–100.*100%/)).toBeVisible();
  const manual = screen.getAllByText('手动调整（高级）')[0]!.closest('details')!;
  expect(manual.open).toBe(false);
  await user.click(screen.getByRole('button', { name: /保留当前数值/ }));
  query = JSON.parse(new URL(screen.getByRole('link', { name: '打开升级候选搜索' }).getAttribute('href')!).searchParams.get('q')!);
  expect(query.query.stats.flatMap((group: { filters: { value?: { min?: number } }[] }) => group.filters).some((filter: { value?: { min?: number } }) => filter.value?.min === 100)).toBe(true);
  await user.click(screen.getByRole('button', { name: /系统推荐/ }));
  expect(within(screen.getByRole('region', { name: '自动设置搜索条件' })).getByText(/无需设置单项 roll 下限/)).toBeVisible();
});

it('looks up native English unique ranges and applies a near-perfect threshold without pretending uniques have T1', async () => {
  const network = vi.fn<typeof fetch>().mockImplementation((url) => Promise.resolve(new Response(JSON.stringify(typeof url === 'string' && url.endsWith('/affix-reference')
    ? { ok: true, name: 'Igniferis', url: 'https://poe2db.tw/us/Igniferis', checkedAt: new Date().toISOString(), cached: false, modifiers: [{ english: '+(10—20)% to Fire Resistance', origin: 'explicit' }] }
    : { ok: true, total: 0, fetched: 0, priced: 0, groups: [], warnings: [], sampledAt: new Date().toISOString(), cached: false, url: 'https://www.pathofexile.com/trade2' }))));
  vi.stubGlobal('fetch', network);
  const user = userEvent.setup();
  render(<EquipmentTradePanel raw={'Rarity: UNIQUE\nIgniferis\nCrimson Amulet\n--------\n+17% to Fire Resistance'} league="Test" onLeague={vi.fn()} intent="upgrade" />);
  const controls = screen.getByRole('region', { name: '自动设置搜索条件' });
  expect(within(controls).getByRole('button', { name: /已核对项达 T1/ })).toBeDisabled();
  await user.click(within(controls).getByRole('button', { name: '核对传奇英文 roll 范围' }));
  await user.click(screen.getByText(/^调整搜索条件/));
  expect(await screen.findByText(/传奇词缀范围 10–20.*70%/)).toBeVisible();
  await user.click(within(controls).getByRole('button', { name: /接近满 roll/ }));
  const query = JSON.parse(new URL(screen.getByRole('link', { name: '打开升级候选搜索' }).getAttribute('href')!).searchParams.get('q')!);
  expect(query.query.stats.some((group: { filters: { value?: { min?: number } }[] }) => group.filters.some((filter) => filter.value?.min === 19))).toBe(true);
  const lookup = network.mock.calls.find(([url]) => typeof url === 'string' && url.endsWith('/affix-reference'))!;
  expect(JSON.parse(lookup[1]!.body as string)).toEqual({ name: 'Igniferis' });
});
