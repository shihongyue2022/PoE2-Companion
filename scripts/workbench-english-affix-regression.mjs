import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const raw = '物品種類: 項鍊\n稀有度: 傳奇\n烈焰之擊\n赤紅項鍊\n--------\n+17%火焰抗性';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }), lookups = [], errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => { if (request.url().endsWith('/api/workbench/affix-reference')) lookups.push(request.postDataJSON()); });
try {
  await page.addInitScript((item) => localStorage.setItem('poe2-workbench-loadout-v1', JSON.stringify({ version: 1, slots: { ring1: 'Rarity: Rare\nKeep Ring\nGold Ring\n--------\n+70 to maximum Life', amulet: item }, goals: { priorities: ['life'], minimums: {} } })), raw);
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173/?companion=1');
  await page.getByRole('region', { name: '角色全身装备' }).getByRole('button', { name: '项链：烈焰之擊' }).click();
  const detail = page.getByRole('region', { name: '项链装备详情' });
  await detail.getByText('词缀资料 · 已识别 1/1').click();
  await expect(detail.getByText(/已读取 6 条英文资料/)).toBeVisible({ timeout: 20000 });
  assert.deepEqual(lookups, [{ name: 'Igniferis' }]);
  await detail.getByRole('button', { name: '用这些资料设置查价条件 →' }).click();
  const trade = page.getByRole('region', { name: '全物品查价' });
  await trade.locator('.wb-search-conditions > summary').click();
  const extra = trade.getByRole('checkbox', { name: /搜索属性：.*魔力/ });
  await expect(extra).not.toBeChecked(); await extra.check();
  const query = JSON.parse(new URL(await trade.getByRole('link', { name: '打开官方交易搜索', exact: true }).getAttribute('href')).searchParams.get('q'));
  assert.equal(query.query.name, 'Igniferis'); assert(!/[\u3400-\u9fff]/u.test(JSON.stringify(query)));
  assert(query.query.stats.flatMap((group) => group.filters).some((condition) => !condition.value));
  await trade.getByText('词缀资料 · 已识别 1/1').click();
  assert.equal(lookups.length, 1); // Loadout → trade reuses the same English research.
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')));
  assert.equal(state.slots.amulet, raw); assert(state.slots.ring1.includes('Keep Ring'));
  await mkdir('artifacts/workbench', { recursive: true });
  await trade.screenshot({ path: 'artifacts/workbench/english-affix-integrated-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await trade.screenshot({ path: 'artifacts/workbench/english-affix-integrated-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('PASS real English PoE2DB lookup → simplified Chinese reference → cached optional official search condition; no owned item mutation');
  console.log('PASS outbound names/query contain no Chinese, reference ranges are not actual rolls, desktop/mobile have no runtime errors');
} finally { await browser.close(); }
