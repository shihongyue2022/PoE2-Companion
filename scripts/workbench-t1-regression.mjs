import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const base = process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173';
const ring = (await readFile('src/workbench/fixtures/breachRing.ts', 'utf8')).match(/`([\s\S]*)`;/)[1];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [], requests = [];
page.on('pageerror', (error) => errors.push(error.message));
let matches = false;
await mkdir('artifacts/workbench', { recursive: true });
try {
  // Market responses below are explicit synthetic tests of both zero and nonzero results.
  await page.route('**/api/workbench/estimate', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true, total: matches ? 8 : 0, fetched: matches ? 8 : 0, priced: matches ? 8 : 0,
      url: 'https://www.pathofexile.com/trade2', groups: matches ? [{ currency: 'divine', count: 8, p25: 10, p75: 20, median: 15, min: 8, max: 25 }] : [],
      warnings: ['测试模拟的 T1 市场响应'], sampledAt: new Date().toISOString(), duplicateSellers: 0, cached: false } });
  });
  await page.goto(base);
  await page.getByRole('button', { name: '粘贴游戏物品' }).click();
  await page.getByRole('textbox', { name: '游戏物品文本' }).fill(ring);
  await page.getByRole('button', { name: /识别并导入/ }).click();
  await page.getByRole('navigation', { name: '工作区域' }).getByRole('button', { name: '官方查价', exact: true }).click();
  const stored = await page.evaluate(() => localStorage.getItem('poe2-workbench-v1'));
  await page.getByRole('button', { name: '同类全词缀 T1', exact: true }).click();
  const panel = page.getByRole('region', { name: '全物品查价', exact: true });
  await expect(panel.getByText('全部词缀同时满足 T1 参考门槛')).toBeVisible();
  await expect(panel.getByText(/已核对 6 条 T1 数值条件/)).toBeVisible();
  const link = panel.getByRole('link', { name: '打开同类全 T1 搜索', exact: true });
  const original = await link.getAttribute('href');
  const query = JSON.parse(new URL(original).searchParams.get('q'));
  await writeFile('artifacts/workbench/all-affix-t1-query.json', JSON.stringify({ league: 'Forbidden Rites', search: query }, null, 2));
  assert.equal(query.query.type, undefined);
  assert.equal(query.query.filters.type_filters.filters.category.option, 'accessory.ring');
  assert.equal(JSON.stringify(query).includes('ilvl'), false);
  assert.equal(query.query.stats.filter((group) => group.type === 'count').length, 6);
  await panel.getByRole('button', { name: '查询全 T1 市场', exact: true }).click();
  await expect(panel.getByText(/当前联盟未找到同时满足全部 T1 参考门槛的挂牌/)).toBeVisible();
  assert.equal(await link.getAttribute('href'), original);
  assert.equal(requests.length, 1);
  console.log('PASS legacy ring pricing opens six-direction T1 search without replacing crafting state');
  console.log('PASS no listings is explicit and does not relax any of the original constraints');

  const cold = panel.getByRole('spinbutton', { name: '+33%冰冷抗性下限', exact: true });
  await cold.fill('20');
  await expect(panel.getByText('已调整为自定义条件，不再要求全词缀 T1')).toBeVisible();
  await expect(panel.getByRole('button', { name: '查询全 T1 市场', exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: '重新应用全部 T1 门槛', exact: true }).click();
  await expect(cold).toHaveValue('41');
  matches = true;
  await panel.getByRole('button', { name: '查询全 T1 市场', exact: true }).click();
  await expect(panel.getByText(/匹配 8 件/)).toBeVisible();
  assert.equal(await page.evaluate(() => localStorage.getItem('poe2-workbench-v1')), stored);
  await panel.screenshot({ path: 'artifacts/workbench/all-affix-t1.png' });
  console.log('PASS edited weaker bounds become custom; restoring T1 works, nonzero mocked listings display');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
  assert.deepEqual(errors, []);
  console.log('PASS all-T1 view works at 390px with no browser errors (market responses mocked)');
} finally { await browser.close(); }
