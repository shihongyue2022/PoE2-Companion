import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [], requests = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.route('**/api/workbench/trade-log*', (route) => route.fulfill({ json: { ok: true, found: false, events: [], truncated: false } }));
  await page.route('**/api/workbench/pob/builds', (route) => route.fulfill({ json: { ok: true, installed: false, builds: [] } }));
  await page.route('**/api/workbench/estimate', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true, total: 2, fetched: 2, priced: 2, duplicateSellers: 0, groups: [], warnings: [], cached: false, sampledAt: new Date().toISOString(), url: 'https://www.pathofexile.com/trade2',
      listings: [35, 30].map((speed, index) => ({ id: `speed${speed}`, name: 'Example Bracers', base: 'Grand Bracers', itemLevel: 84, price: { amount: index ? 1 : 5, currency: 'divine' },
        explicitMods: [`${speed}% increased Projectile Speed`, '+70 to maximum Life', '+10% to Fire Resistance'] })) } });
  });
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173/?companion=1');
  const original = await page.evaluate(async () => {
    const { linkedGuideState } = await import('/src/workbench/fixtures/skillAffixGuide.ts');
    const { serializeLoadout } = await import('/src/workbench/loadout.ts');
    const state = linkedGuideState();
    localStorage.setItem('poe2-workbench-loadout-v1', serializeLoadout(state));
    return { slots: state.slots, goals: state.goals };
  });
  await page.reload();
  await mkdir('artifacts/workbench', { recursive: true });
  await page.getByRole('region', { name: '主输出与智能配装' }).screenshot({ path: 'artifacts/workbench/skill-icon-overview.png' });
  await page.getByRole('button', { name: '查看增伤词缀与部位', exact: true }).click();
  const guide = page.getByRole('region', { name: '技能增伤与装备检索' });
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('投射物速度的增加／减少');
  await expect(guide).toContainText('0.66');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')).goals), original.goals);
  await guide.locator('.sg-links summary').click();
  const link = guide.getByRole('button', { name: /联动：.*第 5 组/ });
  await link.click();
  await expect(link).toHaveAttribute('aria-pressed', 'true');
  await expect(guide).toContainText('提供可被旋风消耗的旋风效果');
  await expect.poll(() => guide.locator('.sg-art img').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')).goals), original.goals);
  await guide.getByRole('combobox', { name: '筛选技能增伤方向', exact: true }).selectOption('projectileSpeed');
  const card = guide.locator('article').first();
  await expect(card).toContainText('手套');
  await expect(card).toContainText('词池前提');
  await card.getByRole('combobox', { name: /检索档位：/ }).selectOption('tier:1');
  await mkdir('artifacts/workbench', { recursive: true });
  await guide.screenshot({ path: 'artifacts/workbench/skill-affix-guide-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await guide.screenshot({ path: 'artifacts/workbench/skill-affix-guide-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await card.getByRole('button', { name: '检索这条词缀', exact: true }).click();
  const search = page.locator('.wb-equipment-core-search');
  await expect(search).toBeVisible();
  await expect(search.getByRole('combobox', { name: /核心属性要求：/ })).toHaveValue('tier:1');
  await expect(search).toContainText('来自技能增伤路线');
  await expect(search.getByRole('region', { name: '整套抗性约束' })).toBeVisible();
  await search.getByRole('button', { name: '检索提升候选', exact: true }).click();
  await expect(search.locator('tbody tr')).toHaveCount(1);
  assert.equal(requests[0].search.query.filters.type_filters.filters.category.option, 'armour.gloves');
  assert(!requests[0].search.query.name);
  assert(JSON.stringify(requests[0]).includes('"min":31'));
  assert(!/[\u3400-\u9fff]/u.test(JSON.stringify(requests[0])));
  await search.screenshot({ path: 'artifacts/workbench/skill-affix-search.png' });
  await search.getByRole('button', { name: '比较这件', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '候选已送入手套比较' })).toBeVisible();
  await expect(page.getByRole('region', { name: '比较替换装备' })).toContainText('潜在词缀评分');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')).slots), original.slots);
  assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')).goals.mainSkill)).name, 'Twister');
  assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')).goals.mainSkill.links[0])).name, 'Whirling Slash');
  assert.deepEqual(errors, []);
  console.log('PASS main-skill inspector, enabled support mechanics, rune-gated affix locations, T1 native market query, candidate roundtrip, unchanged equipped gear and mobile layout');
} finally { await browser.close(); }
