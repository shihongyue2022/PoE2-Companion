import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }), requests = [], errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/api/workbench/estimate', async (route) => {
  requests.push(route.request().postDataJSON());
  await route.fulfill({ json: { ok: true, total: 0, fetched: 0, priced: 0, groups: [], warnings: [], sampledAt: new Date().toISOString(), cached: false,
    url: 'https://www.pathofexile.com/trade2/search/poe2/Test/fixture', listings: [] } });
});
try {
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173/?companion=1');
  await expect(page.getByRole('region', { name: '角色全身装备' })).toBeVisible();
  const before = await page.evaluate(async () => {
    const { BOOTS_SAMPLE } = await import('/src/workbench/fixtures/fullGear.ts');
    const { emptyLoadout } = await import('/src/workbench/loadout.ts');
    const state = emptyLoadout(); state.slots.boots = BOOTS_SAMPLE; state.goals.objective = 'balanced';
    localStorage.setItem('poe2-workbench-loadout-v1', JSON.stringify(state));
    return state;
  });
  await page.reload();
  const loadout = page.getByRole('region', { name: '角色全身装备' });
  await loadout.getByRole('button', { name: '鞋靴：Dusk Trail' }).click();
  await loadout.getByRole('button', { name: '寻找这件的升级' }).click();
  const trade = page.getByRole('region', { name: '全物品查价' });
  const guidance = trade.getByRole('region', { name: '自动设置搜索条件' });
  await expect(guidance.getByRole('button', { name: /已核对项达 T1/ })).toBeEnabled();
  await expect(trade.getByText(/官方匹配 0 件/)).toBeVisible();
  await guidance.getByRole('button', { name: /已核对项达 T1/ }).click();
  const query = async () => JSON.parse(new URL(await trade.getByRole('link', { name: '打开升级候选搜索' }).getAttribute('href')).searchParams.get('q'));
  assert((await query()).query.stats.flatMap((group) => group.filters).some((filter) => filter.value?.min === 120));
  await trade.locator('.wb-search-conditions > summary').click();
  await expect(trade.getByText(/当前阶层范围 90–100.*100%/)).toBeVisible();
  await expect(trade.getByText(/T1 阶层范围 120–/)).toBeVisible();
  const numeric = trade.getByRole('spinbutton', { name: /100最大生命下限/ });
  await expect(numeric).not.toBeVisible();
  await guidance.getByRole('button', { name: /接近满 roll/ }).click();
  assert((await query()).query.stats.flatMap((group) => group.filters).some((filter) => filter.value?.min > 120));
  await guidance.getByRole('button', { name: /保留当前数值/ }).click();
  assert((await query()).query.stats.flatMap((group) => group.filters).some((filter) => filter.value?.min === 100));
  await guidance.getByRole('button', { name: /系统推荐/ }).click();
  assert((await query()).query.stats.flatMap((group) => group.filters).every((filter) => filter.value?.min === undefined));
  assert.equal(requests.length, 1); // Changing ambition does not spam official requests.
  await guidance.getByRole('button', { name: /接近满 roll/ }).click();
  await mkdir('artifacts/workbench', { recursive: true });
  await trade.screenshot({ path: 'artifacts/workbench/search-guidance-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await trade.screenshot({ path: 'artifacts/workbench/search-guidance-mobile.png' });
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')));
  assert.deepEqual(after.slots, before.slots); assert.deepEqual(errors, []);
  console.log('PASS actual shipped base-pool ranges, current-tier vs T1 distinction, one-click current/T1/near-perfect/auto thresholds');
  console.log('PASS manual numbers folded, no hidden numeric upper cap, no search spam or worn gear edits, desktop/mobile');
} finally { await browser.close(); }
