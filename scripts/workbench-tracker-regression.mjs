import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';

const base = process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage(), errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const now = new Date().toISOString();
const candidate = { id: 'log-fixture-1', at: now, player: 'FixtureTrader', item: '测试交易戒指', quantity: 1, amount: 1, currency: 'exalted', currencyText: 'exalted', kind: 'sale', league: 'Forbidden Rites', source: 'log' };
try {
  await mkdir('artifacts/workbench', { recursive: true });
  await page.route('**/api/workbench/trade-log*', (route) => route.fulfill({ json: { ok: true, found: true, source: 'Test fixture / Client.txt', events: [candidate], truncated: false } }));
  await page.goto(`${base}/?companion=1`);
  const nav = page.getByRole('navigation', { name: '工作区域' });
  await expect(nav.getByRole('button')).toHaveCount(4);
  await expect(page.getByRole('region', { name: '角色全身装备' })).toBeVisible();
  await nav.getByRole('button', { name: '交易追踪', exact: true }).click();
  const tracker = page.getByRole('region', { name: '交易追踪器', exact: true });
  const cards = tracker.locator('.tt-card strong');
  await expect(cards).toHaveText(['0', '0', '0']);
  await tracker.getByRole('button', { name: '读取最近 30 天日志' }).click();
  await expect(tracker.getByText(candidate.item, { exact: true })).toBeVisible();
  await expect(cards).toHaveText(['0', '0', '0']);
  await tracker.getByLabel(`${candidate.item}实际成交数量`).fill('10');
  await tracker.getByRole('button', { name: '确认成交', exact: true }).click();
  await expect(cards).toHaveText(['10', '0', '10']);
  await tracker.getByRole('button', { name: '读取最近 30 天日志' }).click();
  await expect(tracker.locator('.tt-pending-row')).toHaveCount(0);
  const ledger = () => page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-finance-v1')));
  assert.equal((await ledger()).entries.length, 1);
  console.log('PASS quote is not income; actual confirmation records 10 instead of quoted 1, repeated reads do not duplicate');

  await tracker.getByRole('button', { name: '粘贴交易密语' }).click();
  await tracker.getByLabel('交易密语文字').fill('@To FixtureSeller: Hi, I would like to buy your Base Ring listed for 3 divine in Forbidden Rites.');
  await tracker.getByRole('button', { name: '识别交易', exact: true }).click();
  await tracker.getByRole('button', { name: '确认成交', exact: true }).click();
  await expect(cards).toHaveText(['10', '0', '10']);
  await tracker.getByLabel('交易统计通货').selectOption('divine');
  await expect(cards).toHaveText(['0', '3', '-3']);
  await tracker.getByLabel('搜索交易记录').fill('FixtureSeller');
  await expect(tracker.locator('.tt-day')).toHaveCount(1);
  const downloaded = page.waitForEvent('download');
  await tracker.getByRole('button', { name: '导出当前筛选交易 CSV' }).click();
  const download = await downloaded;
  const csv = await readFile(await download.path(), 'utf8');
  assert.match(csv, /FixtureSeller/); assert.match(csv, /神圣石/); assert.doesNotMatch(csv, /测试交易戒指/);
  await tracker.getByLabel('搜索交易记录').fill('不存在的玩家');
  await expect(cards).toHaveText(['0', '0', '0']);
  await tracker.getByLabel('搜索交易记录').fill('');
  console.log('PASS purchases, currencies, player search and filtered CSV remain separate');

  await page.reload();
  await nav.getByRole('button', { name: '交易追踪', exact: true }).click();
  await expect(cards).toHaveText(['10', '0', '10']);
  await tracker.getByRole('checkbox', { name: '自动读取交易线索' }).check();
  await nav.getByRole('button', { name: '角色装备', exact: true }).click();
  await nav.getByRole('button', { name: '交易追踪', exact: true }).click();
  assert.equal((await ledger()).entries.length, 2);
  await tracker.screenshot({ path: 'artifacts/workbench/tracker-desktop.png' });
  console.log('PASS confirmed ledger survives reload; navigating away preserves tracker state');

  // Every major page and the two secondary icon tools remain reachable on narrow screens.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ['角色装备', '官方查价', '制作策略', '交易追踪']) {
    await nav.getByRole('button', { name, exact: true }).click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, `${name} overflows mobile`);
  }
  await tracker.screenshot({ path: 'artifacts/workbench/tracker-mobile.png' });
  await page.getByRole('button', { name: '自由模拟', exact: true }).click();
  await expect(page.locator('.wb-sim-toolbar')).toBeVisible();
  await page.getByRole('button', { name: '数据与价格', exact: true }).click();
  await expect(page.getByText('自定义材料价格', { exact: false })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log('PASS one navigation, mobile layouts and secondary icon tools work without runtime errors');
} finally { await browser.close(); }
