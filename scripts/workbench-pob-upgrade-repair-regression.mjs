import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const fixture = await readFile('src/workbench/fixtures/ordainedPob.ts', 'utf8');
const item = /ORDAINED_POB_ITEM = `([\s\S]*?)`;/.exec(fixture)[1];
const legacy = /LEGACY_ORDAINED_RAW = `([\s\S]*?)`;/.exec(fixture)[1];
const xml = `<PathOfBuilding2><Items activeItemSet="1"><Item id="1"><![CDATA[${item}]]></Item><ItemSet id="1" title="Current"><Slot name="Weapon 1" itemId="1"/></ItemSet></Items></PathOfBuilding2>`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }), errors = [], requests = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await mkdir('artifacts/workbench', { recursive: true });
  await page.addInitScript((raw) => {
    const slots = { mainHand: raw, ring1: 'Rarity: Rare\nSaved Ring\nGold Ring\n--------\n+70 to maximum Life' };
    localStorage.setItem('poe2-workbench-loadout-v1', JSON.stringify({ version: 1, slots, goals: { priorities: ['life'], minimums: {} },
      source: { kind: 'pob', fileName: 'Upgrade-repair-fixture.xml', importedAt: '2026-10-22T00:00:00Z', setId: '1', setTitle: 'Current', secondWeapons: false, equipmentSignature: JSON.stringify(Object.entries(slots).sort(([a], [b]) => a.localeCompare(b))) } }));
    localStorage.setItem('poe2-workbench-finance-v1', JSON.stringify({ version: 1, sessions: [], entries: [], assets: [], valuations: [] }));
  }, legacy);
  await page.route('**/api/workbench/pob/builds', (route) => route.fulfill({ json: { ok: true, installed: true, builds: [{ id: 'd'.repeat(64), name: 'Upgrade-repair-fixture.xml' }] } }));
  await page.route('**/api/workbench/pob/build', (route) => route.fulfill({ json: { ok: true, xml } }));
  await page.route('**/api/workbench/estimate', (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, total: 0, fetched: 0, priced: 0, groups: [], warnings: [], sampledAt: new Date().toISOString(), cached: false, url: 'https://www.pathofexile.com/trade2' } });
  });
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173');
  const nav = page.getByRole('navigation', { name: '工作区域' });
  const before = await page.evaluate(() => ({ gear: JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')), finance: localStorage.getItem('poe2-workbench-finance-v1'), craft: localStorage.getItem('poe2-workbench-v1') }));
  await page.getByRole('region', { name: '角色全身装备' }).getByRole('button', { name: '寻找这件的升级', exact: true }).click();
  const repair = page.getByRole('region', { name: '修复 PoB 装备识别' });
  const trade = page.getByRole('region', { name: '全物品查价' });
  await expect(trade.getByRole('button', { name: '搜索市场综合候选', exact: true })).toBeVisible();
  await expect(repair).toHaveCount(0);
  const after = await page.evaluate(() => ({ gear: JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')), finance: localStorage.getItem('poe2-workbench-finance-v1'), craft: localStorage.getItem('poe2-workbench-v1') }));
  assert(!after.gear.slots.mainHand.includes('PoB数值待'));
  assert.equal(after.gear.slots.ring1, before.gear.slots.ring1);
  assert.deepEqual(after.gear.goals, before.gear.goals); assert.equal(after.finance, before.finance); assert.equal(after.craft, before.craft);
  console.log('PASS upgrade entry automatically reparses the original PoB, fixes the nine legacy markers and persists just the selected equipment');

  await expect.poll(() => requests.length).toBe(1);
  const query = requests[0].search;
  assert.deepEqual(query.sort, { 'statgroup.0': 'desc' });
  assert.equal(query.query.name, 'The Ordained'); assert.equal(query.query.type, undefined);
  assert.equal(query.query.filters.type_filters.filters.rarity.option, 'unique');
  assert.equal(query.query.filters.misc_filters.filters.corrupted, undefined);
  assert(query.query.stats[0].filters.length > 1);
  assert(query.query.stats.find((group) => group.type === 'and').filters.some((filter) => filter.id === 'skill.righteous_descent'));
  await expect(trade.getByText('词缀资料 · 已识别 9/9')).toBeVisible();
  await trade.locator('.wb-search-conditions > summary').click();
  await trade.getByRole('checkbox', { name: '限定同名传奇' }).uncheck();
  const broad = JSON.parse(new URL(await trade.getByRole('link', { name: '打开升级候选搜索', exact: true }).getAttribute('href')).searchParams.get('q'));
  assert.equal(broad.query.name, undefined); assert.equal(broad.query.filters.type_filters.filters.rarity, undefined);
  console.log('PASS upgraded search uses real numeric weights, keeps unique mechanics by default and releases other rarities only when requested');
  await trade.screenshot({ path: 'artifacts/workbench/pob-upgrade-repaired-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
  await trade.screenshot({ path: 'artifacts/workbench/pob-upgrade-repaired-mobile.png' });
  await nav.getByRole('button', { name: '角色装备', exact: true }).click();
  await page.getByRole('region', { name: '角色全身装备' }).getByRole('button', { name: '寻找这件的升级', exact: true }).click();
  await expect(page.getByRole('region', { name: '修复 PoB 装备识别' })).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log('PASS repaired equipment stays repaired after returning from loadout; mobile fits with no runtime errors');
} finally { await browser.close(); }
