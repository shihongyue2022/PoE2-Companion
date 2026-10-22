import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }), requests = [], errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/api/workbench/estimate', async (route) => {
  requests.push(route.request().postDataJSON());
  const stats = ['+15% to all Elemental Resistances', '+12% to Chaos Resistance', '10% increased Attack Speed'];
  await route.fulfill({ json: { ok: true, total: 3, fetched: 3, priced: 3, groups: [], warnings: [], sampledAt: new Date().toISOString(), cached: false,
    url: 'https://www.pathofexile.com/trade2/search/poe2/Test/fixture', listings: [
      { id: 'same', name: 'Same Loop', base: 'Gold Ring', price: { amount: 1, currency: 'divine' }, explicitMods: stats },
      { id: 'fire', name: 'Fire Loop', base: 'Gold Ring', price: { amount: 1, currency: 'divine' }, explicitMods: [...stats, 'Adds 20 to 30 Fire Damage to Attacks'] },
      { id: 'lightning', name: 'Lightning Loop', base: 'Gold Ring', price: { amount: 1, currency: 'divine' }, explicitMods: [...stats, 'Adds 20 to 30 Lightning Damage to Attacks'] },
    ] } });
});
try {
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173/?companion=1');
  await expect(page.getByRole('region', { name: '角色全身装备' })).toBeVisible();
  const before = await page.evaluate(async () => {
    const { damageState } = await import('/src/workbench/fixtures/damageGoal.ts');
    const { combatXml } = await import('/src/workbench/fixtures/pobCombat.ts');
    const { parsePobXml } = await import('/src/workbench/pobImport.ts');
    const state = damageState();
    const xml = combatXml.replace('</SkillSet></Skills>', '<Skill><Gem nameSpec="Fireball" gemId="Metadata/Items/Gems/SkillGemFireball" skillId="FireballPlayer" level="18" enabled="true"/><Gem nameSpec="Controlled Destruction" level="1" enabled="true"/></Skill></SkillSet></Skills>');
    state.source.combat = parsePobXml(xml).profile.combat;
    localStorage.setItem('poe2-workbench-loadout-v1', JSON.stringify(state));
    return state;
  });
  await page.reload();
  const loadout = page.getByRole('region', { name: '角色全身装备' });
  const recommendation = page.getByRole('region', { name: '主输出与智能配装' });
  await expect(recommendation.getByText('智能配装 · 闪电长矛')).toBeVisible();
  const workflow = loadout.getByRole('navigation', { name: '配装提升流程' });
  await workflow.getByRole('button', { name: /^导入角色/ }).click();
  await expect(loadout.getByRole('region', { name: '整套装备导入' })).toBeVisible();
  await loadout.locator('.lo-import-entry > summary').click();
  await workflow.getByRole('button', { name: /^校准抗性/ }).click();
  await expect(loadout.getByRole('button', { name: '保存当前游戏面板基准' })).toBeVisible();
  await workflow.getByRole('button', { name: /^确认方向/ }).click();
  await expect(recommendation.getByRole('combobox')).toBeFocused();
  await loadout.getByRole('button', { name: '左戒指：Test Loop' }).click();
  await workflow.getByRole('button', { name: /^寻找升级/ }).click();
  const trade = page.getByRole('region', { name: '全物品查价' });
  await expect(trade.getByText('#1 Lightning Loop')).toBeVisible({ timeout: 15000 });
  await expect(trade.getByText('#2 Fire Loop')).toBeVisible();
  await expect(trade.getByText('#3 Same Loop')).toBeVisible();
  const query = requests.at(-1).search;
  assert(!/[\u3400-\u9fff]/u.test(JSON.stringify(query)));
  const weighted = query.query.stats.find((group) => group.type === 'weight');
  assert(weighted.filters.length > 3, 'adds possible damage affixes absent from the old item');
  assert(query.query.stats.filter((group) => group.type !== 'weight').flatMap((group) => group.filters).every((filter) => filter.id.startsWith('pseudo.')), 'potential affixes are optional ranking directions');
  await trade.locator('article').filter({ hasText: '#1 Lightning Loop' }).getByRole('button', { name: '加入换装比较' }).click();
  await expect(loadout.getByText('四抗达标，伤害方向更高 · 候选待 PoB2 验证')).toBeVisible();
  await expect(loadout.getByText(/沿用本次市场搜索的属性选择与权重/)).toBeVisible();
  await recommendation.getByRole('combobox', { name: '智能配装主输出技能' }).selectOption('pob:2:5');
  await expect(recommendation.getByText('智能配装 · 火球')).toBeVisible();
  await expect(loadout.getByText(/角色或目标已变化，原搜索依据已失效/)).toBeVisible();
  await recommendation.getByText('为什么推荐这些属性').click();
  await expect(recommendation.getByText(/已识别无法暴击/)).toBeVisible();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')).slots), before.slots);
  await mkdir('artifacts/workbench', { recursive: true });
  await recommendation.screenshot({ path: 'artifacts/workbench/skill-recommendation-desktop.png' });
  await loadout.getByRole('navigation').screenshot({ path: 'artifacts/workbench/upgrade-workflow-desktop.png' });
  const oldRequests = requests.length;
  await loadout.getByRole('button', { name: '寻找这件的升级' }).click();
  await expect(trade.getByText(/火球/).first()).toBeVisible();
  await expect.poll(() => requests.length).toBeGreaterThan(oldRequests);
  const fireSearch = requests.at(-1).search;
  assert.notDeepEqual(fireSearch.query.stats.find((group) => group.type === 'weight'), weighted);
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.getByRole('button', { name: '回到角色装备' }).click();
  await loadout.getByRole('navigation').screenshot({ path: 'artifacts/workbench/upgrade-workflow-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('PASS missing lightning affix beats off-direction fire, optional native English weighted query, capped comparison handoff');
  console.log('PASS workflow navigation, main-skill switch, search context invalidation, gear unchanged, desktop/mobile');
} finally { await browser.close(); }
