import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }), requests = [], errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/api/workbench/estimate', async (route) => {
  requests.push(route.request().postDataJSON());
  await route.fulfill({ json: { ok: true, total: 3, fetched: 3, priced: 3, groups: [], warnings: [], sampledAt: new Date().toISOString(), cached: false,
    url: 'https://www.pathofexile.com/trade2/search/poe2/Test/fixture', listings: [
      { id: 'unsafe', name: 'Unsafe Loop', base: 'Gold Ring', price: { amount: 1, currency: 'divine' }, explicitMods: ['+5% to all Elemental Resistances', '+12% to Chaos Resistance', '50% increased Attack Speed'] },
      { id: 'tank', name: 'Tank Loop', base: 'Gold Ring', price: { amount: 1, currency: 'divine' }, explicitMods: ['+100% to all Elemental Resistances', '+50% to Chaos Resistance', '+300 to maximum Life', '10% increased Attack Speed'] },
      { id: 'useful', name: 'Useful Loop', base: 'Gold Ring', price: { amount: 10, currency: 'divine' }, explicitMods: ['+15% to all Elemental Resistances', '+12% to Chaos Resistance', '15% increased Attack Speed'] },
    ] } });
});
try {
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173/?companion=1');
  await expect(page.getByRole('region', { name: '角色全身装备' })).toBeVisible();
  const before = await page.evaluate(async () => {
    const { damageState } = await import('/src/workbench/fixtures/damageGoal.ts');
    const state = damageState();
    localStorage.setItem('poe2-workbench-loadout-v1', JSON.stringify(state));
    return state;
  });
  await page.reload();
  const loadout = page.getByRole('region', { name: '角色全身装备' });
  await expect(loadout.getByText('配装标准：四抗达到各自上限后，优先提高主技能伤害')).toBeVisible();
  await loadout.getByRole('button', { name: '左戒指：Test Loop' }).click();
  await loadout.getByRole('button', { name: '寻找这件的升级' }).click();
  const trade = page.getByRole('region', { name: '全物品查价' });
  await expect(trade.getByText('#1 Useful Loop')).toBeVisible({ timeout: 15000 });
  await expect(trade.getByText('#2 Tank Loop')).toBeVisible();
  await expect(trade.getByText('#3 Unsafe Loop')).toBeVisible();
  const unsafe = trade.locator('article').filter({ hasText: '#3 Unsafe Loop' });
  await expect(unsafe.getByText('抗性未达上限，不符合配装目标')).toBeVisible();
  await trade.locator('.wb-search-conditions > summary').click();
  const locked = trade.getByRole('checkbox', { name: '搜索属性：封顶所需火焰抗性合计' });
  await expect(locked).toBeChecked(); await expect(locked).toBeDisabled();
  const search = requests[0].search;
  assert(!/[\u3400-\u9fff]/u.test(JSON.stringify(search)));
  assert(search.query.stats.some((group) => group.type === 'and' && group.filters.some((filter) => filter.id === 'pseudo.pseudo_total_chaos_resistance' && filter.value.min === 12)));
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')));
  assert.deepEqual(after.slots, before.slots);
  await mkdir('artifacts/workbench', { recursive: true });
  await trade.locator('.wb-price-estimate').screenshot({ path: 'artifacts/workbench/damage-goal-candidates-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await trade.locator('.wb-price-estimate').screenshot({ path: 'artifacts/workbench/damage-goal-candidates-mobile.png' });
  await trade.locator('article').filter({ hasText: '#1 Useful Loop' }).getByRole('button', { name: '加入换装比较' }).click();
  await expect(loadout.getByText('四抗达标，伤害方向更高 · 候选待 PoB2 验证')).toBeVisible();
  assert.deepEqual(errors, []);
  console.log('PASS four resistance caps are hard constraints, damage beats life/resistance overflow, missing-cap candidates stay unverified');
  console.log('PASS locked English pseudo query, worn items unchanged, candidate comparison handoff, desktop/mobile');
} finally { await browser.close(); }
