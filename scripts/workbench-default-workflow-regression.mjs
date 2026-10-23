import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')));
try {
  await page.route('**/api/workbench/trade-log*', (route) => route.fulfill({ json: { ok: true, found: false, events: [], truncated: false } }));
  await page.route('**/api/workbench/pob/builds', (route) => route.fulfill({ json: { ok: true, installed: false, builds: [] } }));
  await page.route('**/api/workbench/estimate', async (route) => {
    const request = route.request().postDataJSON(), boots = request.search.query.filters.type_filters.filters.category.option === 'armour.boots';
    await route.fulfill({ json: { ok: true, total: 1, fetched: 1, priced: 1, duplicateSellers: 0, groups: [], warnings: [], cached: false, sampledAt: new Date().toISOString(), url: 'https://www.pathofexile.com/trade2', listings: [{
      id: boots ? 'listing-boots' : 'listing-ring', name: boots ? 'Test Boots' : 'Damage Ring', base: boots ? 'Lattice Sandals' : 'Gold Ring', rarity: 'rare', itemLevel: 84,
      price: { amount: boots ? 4 : 6, currency: 'divine' }, explicitMods: boots ? ['+10% to Cold Resistance', '+30% to all Elemental Resistances', '+12% to Chaos Resistance'] : ['12% increased Attack Speed', 'Adds 10 to 20 Lightning Damage to Attacks'],
    }] } });
  });
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173/?companion=1');
  const initial = await page.evaluate(async () => {
    const { pairFixture } = await import('/src/workbench/fixtures/upgradePlans.ts');
    const state = pairFixture().state;
    localStorage.setItem('poe2-workbench-loadout-v1', JSON.stringify(state)); return state;
  });
  await page.reload();
  const loadout = page.getByRole('region', { name: '角色全身装备' });
  await loadout.getByRole('button', { name: '左戒指：Test Loop' }).click();
  await loadout.getByRole('button', { name: '寻找这件的升级', exact: true }).click();
  const search = page.locator('.wb-equipment-core-search');
  await expect(search.getByRole('combobox', { name: '升级预算上限档位' })).toHaveValue('10');
  const axis = search.getByRole('combobox', { name: '核心属性 1', exact: true });
  // This synthetic ring has no verified attack-speed trade filter. Use the
  // independently verified item-level filter; skill-affix native queries are
  // exercised by workbench-skill-affix-regression.mjs.
  await axis.selectOption('property:itemLevel');
  await search.getByRole('button', { name: '检索提升候选', exact: true }).click();
  await search.getByRole('button', { name: '比较这件', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-upgrade-pool-v1')).candidates.length)).toBe(1);
  const pool = await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-upgrade-pool-v1')));
  assert.equal(pool.candidates[0].quote.amount, 6);
  await loadout.getByRole('button', { name: '鞋靴：Test Boots' }).click();
  await loadout.getByRole('button', { name: '寻找这件的升级', exact: true }).click();
  await search.getByRole('button', { name: '检索提升候选', exact: true }).click();
  await search.getByRole('button', { name: '比较这件', exact: true }).click();
  const plans = loadout.locator('.wf-plans');
  await plans.locator('summary').first().click();
  await expect(plans).toContainText('四抗与预算通过');
  const pair = plans.locator('article').filter({ hasText: '左戒指＋鞋靴' }).first();
  await expect(pair).toContainText('购买价 10');
  await expect(pair.getByRole('button', { name: '采用此组合' })).toBeEnabled();
  assert.deepEqual((await saved()).slots, initial.slots);
  await mkdir('artifacts/workbench', { recursive: true });
  await plans.screenshot({ path: 'artifacts/workbench/default-workflow-pair-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await plans.screenshot({ path: 'artifacts/workbench/default-workflow-pair-mobile.png' });
  await pair.getByRole('button', { name: '采用此组合' }).click();
  assert.equal((await saved()).slots.ring1.includes('Damage Ring'), true);
  assert.equal((await saved()).slots.boots.includes('+12% to Chaos Resistance'), true);
  assert.deepEqual((await saved()).source, initial.source);
  assert.deepEqual(errors, []);
  console.log('PASS default total budget, automatic quote capture from two market searches, cross-slot chaos compensation, atomic explicit adoption, unchanged original PoB snapshot, desktop/mobile');
} finally { await browser.close(); }
