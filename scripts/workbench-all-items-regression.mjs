import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
const base = process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173';
const fixture = await readFile('src/workbench/fixtures/tradeItems.ts', 'utf8');
const sample = (name) => fixture.match(new RegExp('export const ' + name + ' = `([\\s\\S]*?)`;'))[1];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const page = await context.newPage(); const errors = []; const requests = [];
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('artifacts/workbench', { recursive: true });
try {
  // Explicitly mocked market prices: tests query wiring, never represents a real item quote.
  await page.route('**/api/workbench/estimate', async (route) => {
    const request = route.request().postDataJSON(); requests.push(request);
    await route.fulfill({ json: { ok: true, url: 'https://www.pathofexile.com/trade2', total: 10, fetched: 10, priced: 10, duplicateSellers: 0,
      sampledAt: new Date().toISOString(), cached: false, warnings: ['浏览器测试的模拟报价'],
      groups: [{ currency: 'exalted', count: 10, p25: 10, p75: 20, median: 15, min: 5, max: 25 }] } });
  });
  await page.goto(base);
  async function paste(raw) {
    await page.getByRole('button', { name: '粘贴游戏物品' }).click();
    await page.getByRole('textbox', { name: '游戏物品文本' }).fill(raw);
    await page.getByRole('button', { name: /识别并导入/ }).click();
  }
  const panel = page.getByRole('region', { name: '全物品查价', exact: true });
  await paste(sample('WAYSTONE_SAMPLE'));
  await expect(panel.getByRole('spinbutton', { name: '地图阶级下限', exact: true })).toHaveValue('15');
  await expect(panel.getByRole('spinbutton', { name: '地图阶级上限', exact: true })).toHaveValue('15');
  await expect(panel.getByRole('button', { name: /综合找升级/ })).toHaveCount(0);
  await panel.getByRole('button', { name: '获取挂牌估价', exact: true }).click();
  await expect(panel.getByText('浏览器测试的模拟报价')).toBeVisible();
  assert.deepEqual(requests.at(-1).search.query.filters.map_filters.filters.map_tier, { min: 15, max: 15 });
  assert.equal(requests.at(-1).search.query.filters.type_filters.filters.rarity.option, 'rare');
  await panel.screenshot({ path: 'artifacts/workbench/waystone-pricing.png' });
  console.log('PASS T15 Traditional waystone routes to pricing with exact tier, rarity and corruption');

  await paste(sample('CURRENCY_SAMPLE'));
  await expect(panel.getByText('神圣石', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '获取挂牌估价', exact: true }).click();
  await expect(panel.getByText('浏览器测试的模拟报价')).toBeVisible();
  assert.equal(requests.at(-1).search.query.type, 'Divine Orb');
  assert.equal(requests.at(-1).search.query.filters.type_filters.filters.rarity, undefined);
  assert.equal(requests.at(-1).search.query.filters.misc_filters.filters.stack_size, undefined);
  console.log('PASS stackable currency without item level uses exact official type; stack count is not a filter');

  await paste(sample('GEM_SAMPLE'));
  await expect(panel.getByRole('spinbutton', { name: '宝石等级下限', exact: true })).toHaveValue('19');
  await expect(panel.getByRole('spinbutton', { name: '品质下限', exact: true })).toHaveValue('20');
  await panel.getByRole('button', { name: '获取挂牌估价', exact: true }).click();
  await expect(panel.getByText('浏览器测试的模拟报价')).toBeVisible();
  assert.deepEqual(requests.at(-1).search.query.filters.misc_filters.filters.gem_level, { min: 19, max: 19 });
  assert.deepEqual(requests.at(-1).search.query.filters.type_filters.filters.quality, { min: 20, max: 20 });
  console.log('PASS gem level and quality are separate official filters');

  await paste('物品種類: 輔助寶石\n稀有度: 寶石\n目眩\n--------\n等級: 1');
  await expect(panel.getByRole('button', { name: '获取挂牌估价', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: '选择准确的官方物品', exact: true }).selectOption('Dazzle');
  await expect(panel.getByRole('button', { name: '获取挂牌估价', exact: true })).toBeVisible();
  const link = await panel.getByRole('link', { name: '打开官方交易搜索', exact: true }).getAttribute('href');
  assert.equal(JSON.parse(new URL(link).searchParams.get('q')).query.type, 'Dazzle');
  console.log('PASS duplicate Chinese gem names block estimation until the exact official type is selected');

  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
  assert.deepEqual(errors, []);
  console.log('PASS all-item pricing fits mobile and has no uncaught errors (quotes explicitly mocked)');
} finally { await browser.close(); }
