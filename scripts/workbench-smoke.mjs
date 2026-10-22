import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const checks = [];
const check = (name) => { checks.push(name); console.log('PASS', name); };
const screenshotDir = 'artifacts/workbench';
await mkdir(screenshotDir, { recursive: true });
try {
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.getByRole('navigation', { name: '工作区域' }).getByRole('button', { name: '制作策略' }).click();
  await page.getByRole('button', { name: '载入目标示例' }).waitFor();
  await page.locator('.wb-pool-row').first().waitFor();
  assert.match(await page.title(), /制作工坊/);
  check('load indexed engine data and Simplified UI');
  await page.screenshot({ path: `${screenshotDir}/desktop.png`, fullPage: true });

  await page.getByRole('button', { name: '粘贴游戏物品' }).click();
  await page.getByRole('button', { name: '试用戒指示例' }).click();
  assert.equal(await page.locator('.wb-current-mods .wb-mod').count(), 3);
  assert.equal(await page.locator('.wb-targets .wb-mod').count(), 3);
  assert.equal(await page.getByLabel('装备底座').inputValue(), 'Ruby Ring');
  assert.equal(await page.getByRole('button', { name: '我已补齐并核对当前词缀' }).count(), 0);
  check('Traditional ring text imports exact current affixes and tiers');

  await page.getByRole('button', { name: '计算制作策略', exact: true }).click();
  await page.locator('.wb-results').waitFor({ timeout: 60_000 });
  assert.match(await page.locator('.wb-results').innerText(), /目标已达成|可以停止制作/);
  assert.equal(await page.locator('.wb-results .wb-metrics>div').first().locator('strong').innerText(), '0');
  check('real Web Worker solves an already-complete existing item at zero further cost');

  const nav = page.getByRole('navigation', { name: '工作区域' });
  await page.getByRole('button', { name: '自由模拟' }).click();
  await page.locator('.wb-currency').filter({ has: page.locator('strong', { hasText: /^崇高石$/ }) }).click();
  assert.equal(await page.locator('.wb-current-mods .wb-mod').count(), 4);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  assert.equal(await page.locator('.wb-current-mods .wb-mod').count(), 3);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  assert.equal(await page.locator('.wb-current-mods .wb-mod').count(), 4);
  check('weighted crafting simulation, undo and redo update the actual item');

  await nav.getByRole('button', { name: '官方查价' }).click();
  await page.getByLabel('交易赛季').fill('Forbidden Rites');
  const href = await page.getByRole('link', { name: '在官方交易网站搜索' }).getAttribute('href');
  const url = new URL(href);
  const query = JSON.parse(url.searchParams.get('q'));
  assert.equal(url.hostname, 'www.pathofexile.com');
  assert.equal(query.query.type, undefined);
  assert.equal(query.query.filters.misc_filters, undefined);
  assert(query.query.stats.reduce((count, group) => count + group.filters.length, 0) > 0);
  assert(await page.locator('.wb-trade-filter.enabled').count() <= 3);
  check('official trade URL uses selected stats without hidden base or item level restrictions');
  await page.locator('.wb-trade-search > .wb-fold > summary').click();
  await page.getByRole('checkbox', { name: '限制物品等级' }).check();
  await page.getByLabel('交易最低物等').fill('0');
  await page.getByRole('heading', { name: '选核心属性，查相似装备。' }).waitFor();
  assert.match(await page.locator('main.wb-main').innerText(), /交易物品等级必须/);
  await page.getByLabel('交易最低物等').fill('82');
  check('invalid level validation cannot crash the trade view');

  // Restore the known ring and test a nontrivial policy, not only a zero-cost target.
  await page.getByRole('button', { name: '粘贴游戏物品' }).click();
  await page.getByRole('button', { name: '试用戒指示例' }).click();
  await nav.getByRole('button', { name: '制作策略' }).click();
  await page.locator('.wb-current-mods select').first().selectOption('3');
  while (await page.locator('.wb-targets .wb-mod').count() > 1) await page.locator('.wb-targets .wb-remove').last().click();
  await page.locator('.wb-targets select').first().selectOption('1');
  await page.getByLabel('搜索精度').selectOption('15000');
  await page.getByText('通货范围与计算选项', { exact: true }).click();
  await page.getByRole('checkbox', { name: /同时抽样验证/ }).check();
  await page.getByRole('button', { name: '计算制作策略', exact: true }).click();
  await page.locator('.wb-results').waitFor({ timeout: 70_000 });
  await page.getByText('抽样校验与材料消耗', { exact: true }).click();
  const nontrivial = await page.locator('.wb-results').innerText();
  assert.match(nontrivial, /后续期望成本/);
  const baselineCost = Number((await page.locator('.wb-results .wb-metrics>div').first().locator('strong').innerText()).replaceAll(',', ''));
  assert(Number.isFinite(baselineCost) && baselineCost > 0);
  assert.match(nontrivial, /P95 成本/);
  assert(await page.locator('.wb-resource-table>div').count() > 0);
  await page.screenshot({ path: `${screenshotDir}/policy.png`, fullPage: true });
  check('nontrivial tier upgrade computes an adaptive policy in the browser');
  check('policy replay reports cost percentiles and per-material consumption');

  const priceSheet = JSON.parse(await readFile(new URL('../data/patches/0.5.0/prices.json', import.meta.url), 'utf8'));
  const doubled = Object.fromEntries(Object.entries(priceSheet.prices).filter(([, value]) => value > 0).map(([key, value]) => [key, value * 2]));
  await page.evaluate((overrides) => {
    const session = JSON.parse(localStorage.getItem('poe2-workbench-v1'));
    session.overrides = overrides;
    localStorage.setItem('poe2-workbench-v1', JSON.stringify(session));
  }, doubled);
  await page.reload({ waitUntil: 'networkidle' });
  await nav.getByRole('button', { name: '制作策略' }).click();
  await page.locator('.wb-pool-row').first().waitFor({ state: 'attached' });
  await page.getByRole('button', { name: '计算制作策略', exact: true }).click();
  await page.locator('.wb-results').waitFor({ timeout: 70_000 });
  const doubledCost = Number((await page.locator('.wb-results .wb-metrics>div').first().locator('strong').innerText()).replaceAll(',', ''));
  // The UI rounds large prices to whole Ex; allow the corresponding rounding error.
  assert(Math.abs(doubledCost - 2 * baselineCost) <= 2, `${baselineCost} -> ${doubledCost}`);
  check('saved manual material prices reach the actual Worker solver');

  await page.getByRole('button', { name: '粘贴游戏物品' }).click();
  const text = await page.getByLabel('游戏物品文本').inputValue();
  await page.getByLabel('游戏物品文本').fill(text + '\n--------\n已污染');
  await page.getByRole('button', { name: '识别并导入' }).click();
  assert(await page.getByRole('button', { name: '计算制作策略', exact: true }).isDisabled());
  await page.reload({ waitUntil: 'networkidle' });
  await nav.getByRole('button', { name: '制作策略' }).click();
  await page.locator('.wb-pool-row').first().waitFor({ state: 'attached' });
  assert(await page.getByRole('button', { name: '计算制作策略', exact: true }).isDisabled());
  assert.equal(await page.getByRole('button', { name: '我已补齐并核对当前词缀' }).count(), 0);
  check('corruption restriction survives reload and cannot be cleared as a parsing warning');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${screenshotDir}/mobile.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 1, `mobile horizontal overflow: ${overflow}px`);
  check('390px mobile layout has no page overflow');
  assert.deepEqual(errors, []);
  check('no uncaught browser runtime errors');
  await writeFile(`${screenshotDir}/smoke-results.json`, JSON.stringify({ checks, errors, at: new Date().toISOString() }, null, 2));
} finally {
  await browser.close();
}
