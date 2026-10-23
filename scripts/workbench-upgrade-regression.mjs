import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const base = process.env.WORKBENCH_URL ?? 'http://127.0.0.1:4174';
const fixtures = await readFile('src/workbench/fixtures/fullGear.ts', 'utf8');
const boots = /BOOTS_SAMPLE = `([\s\S]*?)`;/.exec(fixtures)[1];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
const requests = [];
page.on('pageerror', (error) => errors.push(error.message));
const offers = [
  { id: 'cheap', name: 'Cheap Boots', base: 'Adherent Leggings', price: { amount: 1, currency: 'divine' }, explicitMods: ['+20 to maximum Life', '+10% to Cold Resistance', '10% increased Movement Speed'] },
  { id: 'balanced', name: 'Balanced Boots', base: 'Adherent Leggings', price: { amount: 20, currency: 'divine' }, explicitMods: ['+70 to maximum Life', '+60% to Cold Resistance', '45% increased Movement Speed'] },
  { id: 'life', name: 'Life Boots', base: 'Adherent Leggings', price: { amount: 20, currency: 'divine' }, explicitMods: ['+110 to maximum Life', '+35% to Cold Resistance', '30% increased Movement Speed'] },
];
await page.route('**/api/workbench/estimate', async (route) => {
  const body = route.request().postDataJSON(); requests.push(body);
  const floor = body.search.query.stats.filter((group) => group.type !== 'weight')
    .flatMap((group) => group.filters).find((filter) => filter.id.endsWith('.stat_3299347043'))?.value?.min;
  const listings = floor ? offers.filter((offer) => Number(/\d+/.exec(offer.explicitMods[0])[0]) >= floor) : offers;
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, total: listings.length,
    fetched: listings.length, priced: listings.length, groups: [], cached: false,
    sampledAt: new Date().toISOString(), url: 'https://www.pathofexile.com/trade2/search/poe2/Test/example',
    warnings: ['浏览器回归样本，不是真实市场报价。'], listings }) });
});
await mkdir('artifacts/workbench', { recursive: true });
try {
  await page.goto(base);
  await page.getByRole('button', { name: '粘贴游戏物品' }).click();
  await page.getByRole('textbox', { name: '游戏物品文本' }).fill(boots);
  await page.getByRole('button', { name: '识别并导入', exact: false }).click();
  const panel = page.getByRole('region', { name: '全物品查价' });
  await panel.getByRole('button', { name: /综合找升级/ }).click();
  await panel.getByLabel('升级预算上限档位').selectOption('25');
  const queryOf = async () => JSON.parse(new URL(await panel.getByRole('link', { name: '打开升级候选搜索', exact: true }).getAttribute('href')).searchParams.get('q'));
  const query = await queryOf();
  assert.deepEqual(query.sort, { 'statgroup.0': 'desc' });
  assert.equal(query.query.filters.trade_filters.filters.price.max, 25);
  assert.equal(query.query.type, undefined);
  assert.equal(query.query.filters.equipment_filters, undefined);
  assert(query.query.stats[0].filters.length > 3);
  await panel.getByRole('button', { name: '搜索市场综合候选' }).click();
  await expect(panel.getByText('#1 Balanced Boots', { exact: true })).toBeVisible();
  await expect(panel.getByText(/有取舍，含下降属性/)).toBeVisible();
  console.log('PASS official weighted sorting, budget and current-direction tradeoffs replace uniform 10% floors');
  await panel.locator('.wb-search-conditions > summary').click();
  const lifeWeight = panel.locator('input[aria-label$="权重"]');
  const namedLife = panel.locator('input[aria-label*="生命"][aria-label$="权重"]');
  assert(await lifeWeight.count() >= 3);
  await namedLife.locator('xpath=ancestor::details[1]').locator(':scope > summary').click();
  await namedLife.fill('10');
  await panel.getByRole('button', { name: '搜索市场综合候选' }).click();
  await expect(panel.getByText('#1 Life Boots', { exact: true })).toBeVisible();
  console.log('PASS changing life priority changes the top candidate instead of keeping the cheapest offer');
  await panel.locator('input[aria-label*="生命"][aria-label$="下限"]').fill('90');
  const bounded = await queryOf();
  assert(bounded.query.stats.some((group) => group.type !== 'weight' && group.filters.some((filter) => filter.value?.min === 90)));
  await panel.getByRole('button', { name: '搜索市场综合候选' }).click();
  await expect(panel.getByText('#1 Life Boots', { exact: true })).toBeVisible();
  assert.equal(await panel.getByText(/#\d Balanced Boots/).count(), 0);
  await writeFile('artifacts/workbench/weighted-upgrade-query.json', JSON.stringify(requests.at(-1), null, 2));
  console.log('PASS mandatory life floor stays independent of scoring and old candidate results are cleared');
  await panel.screenshot({ path: 'artifacts/workbench/weighted-upgrade-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
  await panel.screenshot({ path: 'artifacts/workbench/weighted-upgrade-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('PASS 390px layout fits and no uncaught browser errors occur');
} finally { await browser.close(); }
