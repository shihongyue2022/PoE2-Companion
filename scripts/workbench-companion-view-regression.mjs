import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = process.env.WORKBENCH_URL ?? 'http://127.0.0.1:4174';
const fixtures = await readFile('src/workbench/fixtures/fullGear.ts', 'utf8');
const boots = /BOOTS_SAMPLE = `([\s\S]*?)`;/.exec(fixtures)[1];
const weapon = /WEAPON_SAMPLE = `([\s\S]*?)`;/.exec(fixtures)[1];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();
const errors = [];
// This regression checks navigation and isolation, without querying the live market.
await context.route('**/api/workbench/estimate', (route) => route.fulfill({ status: 503,
  contentType: 'application/json', body: JSON.stringify({ ok: false, error: { kind: 'network', message: 'Navigation test: no market request.' } }) }));
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
const post = async (path, data) => {
  const response = await context.request.post(`${base}/api/workbench/${path}`, { data });
  assert.equal(response.status(), 200);
  return response.json();
};
const savedCraft = () => page.evaluate(() => {
  const session = JSON.parse(localStorage.getItem('poe2-workbench-v1'));
  return { ...session, checkpoint: session.checkpoint ?? null, checkpointReview: session.checkpointReview ?? null };
});
const openView = (id) => page.goto(`${base}/?companion=1&equipment=${encodeURIComponent(id)}`);
try {
  await page.goto(base);
  await page.getByRole('button', { name: '粘贴游戏物品' }).click();
  await page.getByRole('button', { name: '试用戒指示例' }).click();
  await page.getByRole('button', { name: '载入目标示例' }).waitFor();
  const craftBefore = await savedCraft();
  const first = await post('companion-view', { raw: boots, mode: 'trade' });
  const second = await post('companion-view', { raw: weapon, mode: 'trade' });
  await openView(first.id);
  await expect(page.getByTitle('Dusk Trail', { exact: true })).toBeVisible();
  await expect(page.locator('.wb-tabs button.active')).toHaveText('官方查价');
  assert.deepEqual(await savedCraft(), craftBefore);
  console.log('PASS exact equipment opens in pricing even after a different item was saved');
  await page.reload();
  await expect(page.getByTitle('Dusk Trail', { exact: true })).toBeVisible();
  assert.deepEqual(await savedCraft(), craftBefore);
  console.log('PASS refresh preserves the linked equipment without changing the crafting session');
  await openView(second.id);
  await expect(page.getByTitle('Storm Branch', { exact: true })).toBeVisible();
  assert.deepEqual(await savedCraft(), craftBefore);
  console.log('PASS a different saved equipment link opens its own item');
  const checkpoint = await post('companion-view', { raw: boots, mode: 'checkpoint' });
  await openView(checkpoint.id);
  await expect(page.getByText(/保留原锚点核对结果/)).toBeVisible();
  assert.deepEqual(await savedCraft(), craftBefore);
  console.log('PASS viewing a checkpoint does not reapply the copied item or execute a checkpoint');
  await openView('expired');
  await expect(page.getByText(/这件查价装备已过期或工坊暂时无法连接/)).toBeVisible();
  assert.deepEqual(errors, []);
  console.log('PASS missing item links show an actionable error without uncaught browser errors');
} finally { await browser.close(); }
