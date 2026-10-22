import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const fixture = await readFile('src/workbench/fixtures/tamingPob.ts', 'utf8');
const item = /TAMING_POB_ITEM = `([\s\S]*?)`;/.exec(fixture)[1];
const legacy = /TAMING_LEGACY_RAW = `([\s\S]*?)`;/.exec(fixture)[1];
const xml = `<PathOfBuilding2><Items activeItemSet="1"><Item id="1"><![CDATA[${item}]]></Item><ItemSet id="1" title="Current"><Slot name="Ring 2" itemId="1"/></ItemSet></Items></PathOfBuilding2>`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [], searches = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.addInitScript((raw) => {
    localStorage.setItem('poe2-workbench-loadout-v1', JSON.stringify({ version: 1,
      slots: { ring1: 'Rarity: Rare\nKeep Left\nGold Ring\n--------\n+70 to maximum Life', ring2: raw },
      goals: { priorities: ['life'], minimums: {} }, source: { kind: 'pob', fileName: 'Taming-fixture.xml',
        setId: '1', setTitle: 'Current', secondWeapons: false, importedAt: '2026-10-22T00:00:00Z', equipmentSignature: '' } }));
  }, legacy);
  await page.route('**/api/workbench/pob/builds', (route) => route.fulfill({ json: { ok: true, builds: [{ id: 'f'.repeat(64), name: 'Taming-fixture.xml' }] } }));
  await page.route('**/api/workbench/pob/build', (route) => route.fulfill({ json: { ok: true, xml } }));
  await page.route('**/api/workbench/affix-reference', (route) => route.fulfill({ status: 502, json: { ok: false, error: { message: 'Fixture offline reference' } } }));
  await page.route('**/api/workbench/estimate', (route) => {
    searches.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, total: 0, fetched: 0, priced: 0, groups: [], warnings: [], sampledAt: new Date().toISOString(), cached: false, url: 'https://www.pathofexile.com/trade2' } });
  });
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173/?companion=1');
  const gear = page.getByRole('region', { name: '角色全身装备' });
  await gear.getByRole('button', { name: '右戒指：The Taming' }).click();
  const details = gear.getByRole('region', { name: '右戒指装备详情' });
  await expect(details.getByText('词缀资料 · 已识别 6/6', { exact: true })).toBeVisible();
  await details.getByText('词缀资料 · 已识别 6/6', { exact: true }).click();
  await expect(details.getByText('3 项已识别的条件与特殊效果', { exact: true })).toBeVisible();
  await expect(details.locator('.lo-item-mods li')).toHaveCount(6);
  assert(!(await details.locator('.lo-item-mods').textContent()).includes('PoB数值待'));
  assert(!(await details.locator('.lo-item-mods').textContent()).includes('Wind Skills'));
  await expect(details.getByText(/条件伤害增幅 = 24% ×/)).toBeVisible();
  await expect(details.locator('.lo-item-mods')).toContainText('点燃、感电、和冰缓');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')));
  assert(!saved.slots.ring2.includes('PoB数值待'));
  assert(saved.slots.ring1.includes('Keep Left'));
  assert.deepEqual(saved.goals, { priorities: ['life'], minimums: {} });
  console.log('PASS equipment page reparses seven pending lines into six modifiers; preserves other gear and goals');
  await mkdir('artifacts/workbench', { recursive: true });
  await details.screenshot({ path: 'artifacts/workbench/taming-repaired-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await details.screenshot({ path: 'artifacts/workbench/taming-repaired-mobile.png' });
  await details.getByRole('button', { name: '寻找这件的升级' }).click();
  await expect.poll(() => searches.length).toBe(1);
  const filters = searches[0].search.query.stats[0].filters;
  assert(filters.length > 1);
  assert(!filters.some((filter) => filter.id === 'explicit.stat_3388405805'));
  await expect(page.getByRole('region', { name: '全物品查价' }).getByText(/未单独筛选的文字/)).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log('PASS repaired ring feeds upgrade search; conditional damage is not unconditional DPS; mobile has no overflow or runtime errors');
} finally { await browser.close(); }
