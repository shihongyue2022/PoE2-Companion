import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';

const base = process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173';
const ring = (await readFile('src/workbench/fixtures/breachRing.ts', 'utf8')).match(/`([\s\S]*)`;/)[1];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const requests = [], errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.route('**/api/workbench/estimate', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true, total: 0, fetched: 0, priced: 0, groups: [],
      warnings: ['浏览器回归测试的模拟市场响应'], url: 'https://www.pathofexile.com/trade2', sampledAt: new Date().toISOString(), cached: false } });
  });
  await page.goto(base);
  await page.getByRole('button', { name: '粘贴游戏物品' }).click();
  await page.getByRole('textbox', { name: '游戏物品文本' }).fill(ring);
  await page.getByRole('button', { name: /识别并导入/ }).click();
  const nav = page.getByRole('navigation', { name: '工作区域' });
  await nav.getByRole('button', { name: '官方查价', exact: true }).click();
  const craft = await page.evaluate(() => localStorage.getItem('poe2-workbench-v1'));
  await page.getByRole('button', { name: '同类全词缀 T1', exact: true }).click();
  const editor = page.getByRole('region', { name: '全物品查价', exact: true });
  const original = await editor.getByRole('link', { name: '打开同类全 T1 搜索' }).getAttribute('href');
  const query = JSON.parse(new URL(original).searchParams.get('q'));
  await editor.getByText('收藏当前搜索条件', { exact: true }).click();
  await editor.getByRole('textbox', { name: '收藏搜索名称' }).fill('戒指全 T1');
  await editor.getByRole('textbox', { name: '收藏搜索分组' }).fill('做装候选');
  await editor.getByRole('button', { name: '保存搜索', exact: true }).click();
  assert.equal(requests.length, 0);
  await editor.getByRole('button', { name: '查询全 T1 市场', exact: true }).click();
  await expect(editor.getByText(/当前联盟未找到同时满足全部 T1/)).toBeVisible();
  await editor.getByRole('spinbutton', { name: '+33%冰冷抗性下限', exact: true }).fill('999');
  console.log('PASS saving does not query market; exact six-affix T1 query is saved before editor changes');

  const memory = page.locator('.wb-trade-memory');
  await memory.locator(':scope > summary').click();
  await memory.getByRole('button', { name: '搜索收藏', exact: true }).click();
  await memory.getByRole('button', { name: '打开原条件', exact: true }).click();
  const stored = memory.getByRole('region', { name: '已保存的搜索条件' });
  assert.deepEqual(JSON.parse(await stored.locator('pre').textContent()), query);
  assert.equal(requests.length, 1);
  await stored.getByRole('button', { name: '获取挂牌估价', exact: true }).click();
  await expect(stored.getByText(/没有找到挂单/)).toBeVisible();
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].search, query);
  assert.equal(await page.evaluate(() => localStorage.getItem('poe2-workbench-v1')), craft);
  console.log('PASS reopening preserves original T1 conditions and never alters the active crafting session');

  await page.reload();
  await nav.getByRole('button', { name: '官方查价', exact: true }).click();
  await memory.locator(':scope > summary').click();
  await memory.getByRole('button', { name: '搜索收藏', exact: true }).click();
  await expect(memory.getByText('★ 戒指全 T1', { exact: true })).toBeVisible();
  await memory.getByRole('combobox', { name: '筛选收藏分组' }).selectOption('做装候选');
  const savedUrl = await memory.getByRole('link', { name: '官网搜索', exact: true }).getAttribute('href');
  assert.equal(new URL(savedUrl).origin, 'https://www.pathofexile.com');
  assert.deepEqual(JSON.parse(new URL(savedUrl).searchParams.get('q')), query);
  assert.equal(requests.length, 2);
  await mkdir('artifacts/workbench', { recursive: true });
  await memory.screenshot({ path: 'artifacts/workbench/search-memory.png' });
  console.log('PASS bookmarks, grouping and original league survive browser refresh with no automatic requests');

  await page.setViewportSize({ width: 390, height: 844 });
  await memory.getByRole('button', { name: '打开原条件', exact: true }).click();
  assert((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1);
  assert.deepEqual(errors, []);
  console.log('PASS saved search view has no overflow at 390px and no browser errors (market responses mocked)');
} finally { await browser.close(); }
