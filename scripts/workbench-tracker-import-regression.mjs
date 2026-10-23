import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = []; page.on('pageerror', (error) => errors.push(error.message));
const now = new Date(Date.now() - 60000).toISOString();
const csv = `时间,物品,玩家,类型,数量,通货,联盟,物品数量,来源交易ID\n${now},市集戒指,Trader,出售收入,10,神圣石,Forbidden Rites,1,market-1\n${now},买入鞋子,Seller,购买支出,3,神圣石,Forbidden Rites,1,market-2`;
try {
  let requests = 0;
  await page.route('**/api/workbench/trade-log*', async (route) => { requests++; await route.fulfill({ json: { ok: true, found: true, source: 'Test Client.txt', events: [], truncated: false, diagnostics: { history: true, bytesRead: 3000, lines: 10, whispers: 5, unmatchedTradeMessages: 0, acceptanceHints: 0 } } }); });
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173/?companion=1');
  await expect(page.getByRole('region', { name: '角色全身装备' })).toBeVisible();
  assert.equal(requests, 0, 'hidden tracker must not scan history before first visit');
  await page.getByRole('navigation', { name: '工作区域' }).getByRole('button', { name: '交易追踪', exact: true }).click();
  const tracker = page.getByRole('region', { name: '交易追踪器' });
  await tracker.getByText('其他交易来源 · 密语线索与 CSV', { exact: true }).click();
  await expect(tracker.getByText('密语交易 · 日志已连接')).toBeVisible();
  await expect(tracker.getByText(/5 条密语中识别 0 条交易线索/)).toBeVisible();
  await expect(tracker.getByRole('region', { name: '官方成交同步' })).toBeVisible();
  await tracker.getByRole('button', { name: '导入已有成交 CSV', exact: true }).click();
  const importer = tracker.getByRole('region', { name: '导入交易记录' });
  async function preview() {
    await importer.getByLabel('交易 CSV 文件').setInputFiles({ name: 'completed-trades.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(importer.getByText('已读取 2 行，尚未写入账本。', { exact: false })).toBeVisible();
    await importer.getByRole('button', { name: '预览交易', exact: true }).click();
    await expect(importer.getByText('2 笔可导入 · 0 行需处理。重复来源会跳过。')).toBeVisible();
    await importer.getByRole('checkbox', { name: '这些是已完成的交易，实际金额与通货已经核对' }).check();
    await importer.getByRole('button', { name: '确认并导入已成交记录', exact: true }).click();
  }
  await preview();
  await expect(tracker.getByText(/本联盟已有 2 笔确认记录/)).toBeVisible();
  await tracker.getByRole('button', { name: /神圣石 · 2 笔 · 净额 7/ }).click();
  await expect(tracker.locator('.tt-card strong')).toHaveText(['10', '3', '7']);
  await tracker.getByRole('button', { name: '导入已有成交 CSV', exact: true }).click();
  await preview();
  await expect(page.getByText('已记入成交 0 笔，跳过重复 2 笔。', { exact: true })).toBeVisible();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-finance-v1')));
  assert.equal(state.entries.length, 2);
  await page.reload();
  await page.getByRole('navigation', { name: '工作区域' }).getByRole('button', { name: '交易追踪', exact: true }).click();
  await tracker.getByRole('button', { name: /神圣石 · 2 笔/ }).click();
  await expect(tracker.locator('.tt-card strong')).toHaveText(['10', '3', '7']);
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(errors, []);
  console.log('PASS first-visit diagnostics, explicit source limits, confirmed CSV income/expense, currency discovery, deduplication, reload and mobile layout');
} finally { await browser.close(); }
