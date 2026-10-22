import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const fixtures = await readFile('src/workbench/fixtures/fullGear.ts', 'utf8');
const boots = /BOOTS_SAMPLE = `([\s\S]*?)`;/.exec(fixtures)[1];
const weapon = /WEAPON_SAMPLE = `([\s\S]*?)`;/.exec(fixtures)[1];
const betterBoots = boots.replace('Dusk Trail', 'Dawn Trail').replace('+100(90-100)', '+120(110-120)').replace('200 (augmented)', '250 (augmented)');
const index = JSON.parse(await readFile('src/workbench/data/equipment-index.json', 'utf8'));
const baseUrl = process.env.WORKBENCH_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
const checks = [];
const normalizeCraftSession = (raw) => {
  const value = JSON.parse(raw);
  return { ...value, checkpoint: value.checkpoint ?? null, checkpointReview: value.checkpointReview ?? null };
};
page.on('pageerror', (error) => errors.push(error.message));
const pass = (name) => { checks.push(name); console.log('PASS', name); };
await mkdir('artifacts/workbench', { recursive: true });
try {
  assert.deepEqual(await (await page.request.get(`${baseUrl}/api/workbench/health`)).json(), { ok: true, app: 'poe2-craft-workbench' });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('navigation', { name: '工作区域' }).getByRole('button', { name: '制作策略' }).click();
  await page.getByRole('button', { name: '粘贴游戏物品' }).click();
  await page.getByRole('button', { name: '试用戒指示例' }).click();
  const craftBefore = await page.evaluate(() => localStorage.getItem('poe2-workbench-v1'));
  const nav = page.getByRole('navigation', { name: '工作区域' });
  await nav.getByRole('button', { name: '角色装备' }).click();
  const loadout = page.getByRole('region', { name: '角色全身装备' });
  assert.equal(await loadout.locator('.lo-slot').count(), 15);
  await loadout.getByLabel('选择装备栏位').selectOption('boots');
  await loadout.getByLabel('导入此栏装备').fill(boots);
  await loadout.getByRole('button', { name: /^放入/ }).click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')).slots.boots), boots);
  assert.deepEqual(normalizeCraftSession(await page.evaluate(() => localStorage.getItem('poe2-workbench-v1'))), normalizeCraftSession(craftBefore));
  pass('game-style 15-slot inventory imports armour independently of the crafting item');

  await loadout.locator('.lo-comparison > summary').click();
  await loadout.getByLabel('粘贴候选装备').fill(betterBoots);
  await loadout.getByText('已比较属性提升', { exact: true }).waitFor();
  assert.match(await loadout.locator('.lo-deltas').innerText(), /\+20/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')).slots.boots), boots);
  await loadout.getByRole('button', { name: /^采用候选/ }).click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')).slots.boots), betterBoots);
  await loadout.locator('.lo-comparison > summary').click();
  await loadout.getByLabel('粘贴候选装备').fill(boots);
  await loadout.getByText('已比较属性下降', { exact: true }).waitFor();
  await loadout.getByLabel('粘贴候选装备').fill(betterBoots.replace('+120(110-120)', '+150(140-150)').replace('+35(31-35)', '+10(10-15)'));
  await loadout.getByText('有取舍', { exact: true }).waitFor();
  pass('candidate comparison distinguishes improvements, regressions and tradeoffs before explicit replacement');
  await loadout.screenshot({ path: 'artifacts/workbench/character-equipment.png' });

  await loadout.getByRole('button', { name: '寻找这件的升级' }).click();
  const pricing = page.getByRole('region', { name: '全物品查价' });
  const upgradeUrl = new URL(await pricing.getByRole('link', { name: '打开升级候选搜索' }).getAttribute('href'));
  const upgrade = JSON.parse(upgradeUrl.searchParams.get('q'));
  assert.equal(upgrade.query.filters.type_filters.filters.category.option, 'armour.boots');
  assert.equal(upgrade.query.type, undefined);
  assert.equal(upgrade.query.filters.equipment_filters, undefined);
  assert.deepEqual(upgrade.sort, { 'statgroup.0': 'desc' });
  assert.equal(upgrade.query.stats[0].type, 'weight');
  pass('upgrade search ranks current-direction weighted stats while releasing the original armour base');
  await page.getByRole('button', { name: '回到角色装备', exact: true }).click();
  assert.equal(await loadout.getByLabel('粘贴候选装备').inputValue(), betterBoots.replace('+120(110-120)', '+150(140-150)').replace('+35(31-35)', '+10(10-15)'));
  await page.reload({ waitUntil: 'networkidle' });
  await nav.getByRole('button', { name: '角色装备' }).click();
  await loadout.getByLabel('选择装备栏位').selectOption('boots');
  await loadout.locator('.lo-item-title').getByTitle('Dawn Trail', { exact: true }).waitFor();
  pass('the saved set survives reload and temporary candidate text survives a pricing round-trip');

  await loadout.getByLabel('选择装备栏位').selectOption('mainHand');
  await loadout.getByLabel('导入此栏装备').fill(weapon);
  await loadout.getByRole('button', { name: /^放入/ }).click();
  await loadout.getByRole('button', { name: '估价这件装备' }).click();
  const weaponUrl = new URL(await pricing.getByRole('link', { name: '打开官方交易搜索', exact: true }).getAttribute('href'));
  const weaponQuery = JSON.parse(weaponUrl.searchParams.get('q'));
  assert.equal(weaponQuery.query.filters.type_filters.filters.category.option, 'weapon.bow');
  assert.equal(weaponQuery.query.filters.equipment_filters.filters.pdps.min, 180);
  await writeFile('artifacts/workbench/equipment-quote-query.json', JSON.stringify({ league: 'Forbidden Rites', search: weaponQuery }, null, 2));
  pass('weapon pricing uses actual printed DPS and the proper official weapon category');

  await page.route('**/api/workbench/estimate', async (route) => {
    const query = route.request().postDataJSON().search.query;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      ok: true, total: 100, fetched: 20, priced: 17, duplicateSellers: 3,
      groups: [
        { currency: 'alch', count: 12, min: 1, max: 1, p25: 1, median: 1, p75: 1 },
        { currency: 'divine', count: 5, min: 2, max: 6, p25: 3, median: 4, p75: 5 },
      ],
      sampledAt: new Date().toISOString(), cached: false,
      context: { category: query.filters.type_filters.filters.category.option, statCount: 1, propertyCount: 0, sufficient: false, summary: ['测试装备', '仅一项属性条件'] },
      confidence: { level: 'low', reasons: ['回归测试模拟挂单；不是真实市场价格。'] },
      listings: [{ id: 'test-public-item', name: 'Dusk Trail', base: 'Adherent Leggings', price: { amount: 4, currency: 'divine' }, explicitMods: ['+100 to maximum Life'] }],
      warnings: ['回归测试模拟挂单；不是真实市场价格。'],
      url: 'https://www.pathofexile.com/trade2/search/poe2/Test/test-id',
    }) });
  });
  const savedSet = await page.evaluate(() => localStorage.getItem('poe2-workbench-loadout-v1'));
  const flask = index.items.find((item) => item.category === 'flask.life' && !item.base);
  const unique = index.items.find((item) => item.base && item.category.startsWith('weapon.'));
  const packets = [
    boots,
    `物品種類: 生命藥劑\n稀有度: 魔法\n戰士之血 ${flask.zh}\n--------\n物品等級: 70\n--------\n20% increased Charges gained`,
    `Item Class: Weapons\nRarity: Unique\n${unique.en}\n${unique.base}\n--------\nItem Level: 80`,
  ];
  for (const raw of packets) {
    const packet = await (await page.request.post(`${baseUrl}/api/workbench/clipboard`, { data: { raw, mode: 'trade' } })).json();
    assert(packet.ok);
    await expect.poll(async () => (await (await page.request.get(`${baseUrl}/api/workbench/companion-result?id=${packet.id}`)).json()).status,
      { timeout: 20000 }).toBe('ready');
    const response = await (await page.request.get(`${baseUrl}/api/workbench/companion-result?id=${packet.id}`)).json();
    assert.match(response.message, /2 种币种/);
    assert.match(response.detail, /点金石/);
    assert.match(response.detail, /神圣石/);
    assert.match(response.detail, /主要条件/);
    assert.match(response.detail, /样本：/);
    assert.deepEqual(normalizeCraftSession(await page.evaluate(() => localStorage.getItem('poe2-workbench-v1'))), normalizeCraftSession(craftBefore));
    assert.equal(await page.evaluate(() => localStorage.getItem('poe2-workbench-loadout-v1')), savedSet);
  }
  pass('armour, Traditional flask and unique-weapon shortcut packets return all-currency summaries without altering either session');
  await pricing.getByText('查看实际挂单样本（1）').click();
  await pricing.getByText('100最大生命', { exact: true }).waitFor();
  await pricing.screenshot({ path: 'artifacts/workbench/all-equipment-pricing.png' });
  pass('official-listing summaries display Chinese known stats and clearly identified test data');

  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
  await page.getByRole('button', { name: '回到角色装备', exact: true }).click();
  assert(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
  await loadout.screenshot({ path: 'artifacts/workbench/character-equipment-mobile.png' });
  assert.deepEqual(errors, []);
  pass('full equipment pricing and inventory fit 390px without uncaught browser errors');
  await writeFile('artifacts/workbench/equipment-results.json', JSON.stringify({ checks, errors, at: new Date().toISOString() }, null, 2));
} finally { await browser.close(); }
