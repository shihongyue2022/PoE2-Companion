import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Isolated browser/storage and synthetic offers; never opens a user's profile.
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const requests = [], errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.route('**/api/workbench/trade-log*', (route) => route.fulfill({ json: { ok: true, found: false, events: [], truncated: false } }));
  await page.route('**/api/workbench/pob/builds', (route) => route.fulfill({ json: { ok: true, installed: false, builds: [] } }));
  await page.route('**/api/workbench/estimate', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true, total: 3, fetched: 3, priced: 3, duplicateSellers: 0, groups: [], warnings: [], cached: false, sampledAt: new Date().toISOString(), url: 'https://www.pathofexile.com/trade2',
      listings: [
        { id: 'valid', name: 'Example Belt', base: 'Rawhide Belt', itemLevel: 84, price: { amount: 5, currency: 'divine' }, explicitMods: ['+25% to Chaos Resistance', '+100 to maximum Life'] },
        { id: 'low-roll', name: 'Low Roll', base: 'Rawhide Belt', itemLevel: 84, price: { amount: 1, currency: 'divine' }, explicitMods: ['+23% to Chaos Resistance'] },
        { id: 'low-level', name: 'Low Level', base: 'Rawhide Belt', itemLevel: 83, price: { amount: 2, currency: 'divine' }, explicitMods: ['+27% to Chaos Resistance'] },
      ] } });
  });
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173/?companion=1');
  await page.evaluate(async () => {
    const { emptyLoadout, serializeLoadout } = await import('/src/workbench/loadout.ts');
    const state = emptyLoadout();
    state.slots.belt = 'Rarity: Rare\nExample Belt\nRawhide Belt\n--------\nItem Level: 84\n--------\n+60 to maximum Life';
    localStorage.setItem('poe2-workbench-loadout-v1', serializeLoadout(state));
  });
  await page.reload();
  const loadout = page.getByRole('region', { name: '角色全身装备' });
  await loadout.locator('.lo-slot-belt').click();
  await loadout.getByRole('button', { name: '估价这件装备', exact: true }).click();
  const panel = page.locator('.wb-equipment-core-search'), core = panel.getByRole('region', { name: '核心属性档位估价' });
  const property = core.getByLabel('核心属性 1', { exact: true });
  const chaos = property.getByRole('option', { name: '混沌抗性 · 后缀 · 可新增', exact: true });
  await expect(chaos).toBeAttached();
  await property.selectOption(await chaos.getAttribute('value'));
  await core.getByLabel('核心属性要求：混沌抗性', { exact: true }).selectOption('tier:1');
  await core.getByRole('button', { name: '添加属性', exact: true }).click();
  const second = core.getByLabel('核心属性 2', { exact: true });
  await second.selectOption(await second.getByRole('option', { name: '物品等级 · 当前 84', exact: true }).getAttribute('value'));
  await core.getByLabel('核心属性要求：物品等级', { exact: true }).selectOption('level:84');
  await core.getByRole('button', { name: '检索提升候选', exact: true }).click();
  await expect(core.locator('tbody tr')).toHaveCount(1);
  await expect(core.locator('tbody tr')).toContainText('25');
  await expect(core.locator('tbody tr')).toContainText('84');
  await expect(core.getByText('符合要求的挂牌 5–5 神圣石', { exact: true })).toBeVisible();
  assert.equal(requests[0].search.query.filters.misc_filters.filters.ilvl.min, 84);
  assert(JSON.stringify(requests[0]).includes('"min":24'));
  assert(!/[\u3400-\u9fff]/u.test(JSON.stringify(requests[0])));
  assert.equal(await page.getByRole('spinbutton', { name: /权重/ }).count(), 0);
  await mkdir('artifacts/workbench', { recursive: true });
  await panel.screenshot({ path: 'artifacts/workbench/belt-search-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.screenshot({ path: 'artifacts/workbench/belt-search-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('PASS belt prefix/suffix options, absent chaos T1 + item level AND filters, returned-value validation, desktop/mobile layout');
} finally { await browser.close(); }
