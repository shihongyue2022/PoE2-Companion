import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [], reads = [];
page.on('pageerror', (error) => errors.push(error.message));
let life = 80;
const fixture = () => `<PathOfBuilding2><Items activeItemSet="1"><Item id="1"><![CDATA[Rarity: RARE
Test Dawn Loop
Amethyst Ring
Item Level: 82
Implicits: 1
+12% to Chaos Resistance
+${life} to maximum Life
+17% to Fire Resistance]]></Item><ItemSet id="1" title="Regression fixture"><Slot name="Ring 1" itemId="1" /></ItemSet></Items></PathOfBuilding2>`;
try {
  // Explicit synthetic saved-file responses; these are not the user's character or live account data.
  await page.route('**/api/workbench/pob/builds', (route) => route.fulfill({ json: { ok: true, installed: true,
    builds: [{ id: 'a'.repeat(64), name: 'Regression-fixture.xml', modifiedAt: '2026-10-22T10:00:00Z', size: 600 }] } }));
  await page.route('**/api/workbench/pob/build', (route) => {
    reads.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, name: 'Regression-fixture.xml', xml: fixture() } });
  });
  await page.goto(base);
  await page.getByRole('navigation', { name: '工作区域' }).getByRole('button', { name: '角色装备', exact: true }).click();
  const craftBefore = await page.evaluate(() => localStorage.getItem('poe2-workbench-v1'));
  const loadout = page.getByRole('region', { name: '角色全身装备' });
  await loadout.getByText('从 PoB2 导入整套装备', { exact: true }).click();
  const local = loadout.getByRole('region', { name: '本机 PoB2 角色导入' });
  await local.getByRole('button', { name: '刷新已保存角色', exact: true }).click();
  await expect(local.getByRole('combobox', { name: '本机 PoB2 角色' })).toHaveValue('a'.repeat(64));
  assert.equal(reads.length, 0);
  await local.getByRole('button', { name: '读取角色并预览', exact: true }).click();
  await expect(loadout.getByText('左戒指：稀有紫晶戒指', { exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => localStorage.getItem('poe2-workbench-loadout-v1')), null);
  await loadout.getByRole('button', { name: '确认替换整套装备（1 件）', exact: true }).click();
  await expect(loadout.getByRole('button', { name: '左戒指：Test Dawn Loop', exact: true })).toBeVisible();
  assert((await page.evaluate(() => localStorage.getItem('poe2-workbench-loadout-v1'))).includes('+80 to maximum Life'));
  assert.equal(await page.evaluate(() => localStorage.getItem('poe2-workbench-v1')), craftBefore);
  console.log('PASS selected local file is previewed before import; crafting state stays unchanged (mock saved character)');

  life = 95;
  await local.getByRole('button', { name: '读取角色并预览', exact: true }).click();
  assert((await page.evaluate(() => localStorage.getItem('poe2-workbench-loadout-v1'))).includes('+80 to maximum Life'));
  await loadout.getByRole('button', { name: '确认替换整套装备（1 件）', exact: true }).click();
  assert((await page.evaluate(() => localStorage.getItem('poe2-workbench-loadout-v1'))).includes('+95 to maximum Life'));
  assert.deepEqual(reads, [{ id: 'a'.repeat(64) }, { id: 'a'.repeat(64) }]);
  console.log('PASS re-reading receives newly saved equipment only after explicit confirmation');

  await mkdir('artifacts/workbench', { recursive: true });
  await page.getByRole('region', { name: '整套装备导入' }).screenshot({ path: 'artifacts/workbench/local-pob-import.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/workbench/local-pob-import-mobile.png', fullPage: true });
  const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth - innerWidth,
    elements: [...document.querySelectorAll('body *')].filter((element) => element.getBoundingClientRect().right > innerWidth + 1).slice(0, 15).map((element) => ({ tag: element.tagName, class: element.className, width: element.getBoundingClientRect().width })) }));
  assert(overflow.width <= 1, JSON.stringify(overflow));
  assert.deepEqual(errors, []);
  console.log('PASS 390px layout and browser errors; no OAuth credentials or account data used');
} finally { await browser.close(); }
