import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = []; page.on('pageerror', (error) => errors.push(error.message));
const at = new Date(Date.now() - 60000).toISOString();
await page.addInitScript(({ at }) => {
  // Isolated fixture for the real workbench content script; no user's cookies or
  // browser profile is opened. Live-account verification is explicitly deferred.
  globalThis.chrome = { runtime: { sendMessage: async ({ action, league }) => action === 'ping' ? { ready: true, version: '1.1.0' } : {
    ready: true, payload: { endpoint: 'trade2/history', league, fetchedAt: new Date().toISOString(), entries: [
      { id: 'fixture-sale', time: Math.floor(Date.parse(at) / 1000), price: { amount: 12, currency: 'divine' }, item: { name: 'Example', baseType: 'Gold Ring', league } },
      { id: 'fixture-purchase', direction: 'buy', time: at, price: { amount: 4, currency: 'divine' }, item: { name: 'Example Boots', baseType: 'Iron Greaves', league } },
    ] },
  } } };
}, { at });
await page.addInitScript({ content: await readFile('browser-extension/official-history/workbench.js', 'utf8') });
let requests = [], updatedXml = '';
try {
  await page.route('**/api/workbench/trade-log*', (route) => route.fulfill({ json: { ok: true, found: true, events: [], truncated: false } }));
  await page.route('**/api/workbench/pob/builds', (route) => route.fulfill({ json: { ok: true, installed: true, builds: [{ id: 'a'.repeat(64), name: 'Fixture.xml', modifiedAt: at }] } }));
  await page.route('**/api/workbench/pob/build', (route) => route.fulfill({ json: { ok: true, xml: updatedXml, name: 'Fixture.xml', modifiedAt: at } }));
  await page.route('**/api/workbench/estimate', async (route) => {
    const value = route.request().postDataJSON(); requests.push(value);
    const listings = [23, 24, 25, 60].map((roll, index) => ({ id: `offer${index}`, name: 'The Taming', base: 'Prismatic Ring', rarity: 'unique',
      price: { amount: [10, 12, 14, 1][index], currency: 'divine' }, explicitMods: [`${roll}% increased Damage for each type of Elemental Ailment on Enemy`, `+${[30, 26, 25, 30][index]}% to all Elemental Resistances`] }));
    await route.fulfill({ json: { ok: true, total: 40, fetched: 4, priced: 4, duplicateSellers: 0, listings, groups: [], warnings: [], sampledAt: new Date().toISOString(), cached: false, url: 'https://www.pathofexile.com/trade2/search/poe2/Forbidden%20Rites/fixture' } });
  });
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173/?companion=1');
  updatedXml = await page.evaluate(async () => {
    const { dualWeaponsXml } = await import('/src/workbench/fixtures/dualWeapons.ts');
    const { parsePobXml, previewPob, pobImportSource } = await import('/src/workbench/pobImport.ts');
    const { emptyLoadout, serializeLoadout } = await import('/src/workbench/loadout.ts');
    const { applyPobLoadout } = await import('/src/workbench/loadoutIntegration.ts');
    const charm = "Rarity: Unique\nNgamahu's Chosen\nRuby Charm\n--------\n+10% to Fire Resistance";
    const ring = 'Rarity: Unique\nThe Taming\nPrismatic Ring\n--------\n+12% to all Elemental Resistances (implicit)\n+26% to all Elemental Resistances\n24% increased Damage for each type of Elemental Ailment on Enemy';
    const xml = dualWeaponsXml.replace('<ItemSet id="1"', `<Item id="100"><![CDATA[${charm}]]></Item><Item id="101"><![CDATA[${ring}]]></Item><ItemSet id="1"`).replace('</ItemSet>', '<Slot name="Charm 1" itemId="100"/><Slot name="Charm 2" itemId="100"/><Slot name="Charm 3" itemId="100"/><Slot name="Ring 2" itemId="101"/></ItemSet>');
    const document = parsePobXml(xml), preview = previewPob(document, '1', false);
    localStorage.setItem('poe2-workbench-loadout-v1', serializeLoadout(applyPobLoadout(emptyLoadout(), preview.slots, pobImportSource(document, '1', false, preview.slots, { name: 'Fixture.xml', modifiedAt: '2026-10-22T00:00:00Z' }))));
    return xml.replace(/name="Charm ([123])" itemId="100"/g, 'name="Charm $1" itemId="0"');
  });
  await page.reload();
  const loadout = page.getByRole('region', { name: '角色全身装备' });
  await loadout.getByRole('button', { name: '保存后重新读取', exact: true }).click();
  const preview = loadout.locator('.lo-pob-preview');
  await expect(preview.locator('.lo-import-slot-status p').filter({ hasText: '空栏 · 确认导入后清除此栏旧物品' })).toHaveCount(5);
  await expect(preview.getByRole('article', { name: '护符 1更新详情' })).toContainText('移除装备');
  await preview.getByRole('button', { name: /确认替换整套装备/ }).click();
  for (const id of ['charm1', 'charm2', 'charm3']) await expect(loadout.locator(`.lo-slot-${id}`)).toContainText('点击导入');
  await loadout.locator('.lo-slot-ring2').click();
  await loadout.getByRole('button', { name: '估价这件装备', exact: true }).click();
  const prices = page.getByRole('region', { name: '核心属性档位估价' });
  await expect(page.getByRole('heading', { name: '装备提升检索', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '配装方式', exact: true })).toHaveValue('loadout');
  await expect(page.getByRole('region', { name: '整套抗性约束' })).toContainText('四抗约束整套配装，不要求每件装备补齐');
  await expect(page.getByRole('group', { name: '全装备查价预设' })).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: /权重$/ })).toHaveCount(0);
  await expect(page.getByText('实际报价与利润情景（可选／高级）', { exact: true })).toHaveCount(0);
  await expect(prices.locator('.wb-core-axis')).toHaveCount(1);
  await expect(prices.getByLabel('核心属性 1', { exact: true }).locator('option:checked')).toContainText('24');
  await expect(prices.getByRole('button', { name: '低一档', exact: true })).toHaveCount(0);
  await prices.getByRole('button', { name: '添加属性', exact: true }).click();
  const secondAxis = prices.getByLabel('核心属性 2', { exact: true });
  const resistanceKey = await secondAxis.getByRole('option', { name: /26%.*抗性/ }).getAttribute('value');
  await secondAxis.selectOption(resistanceKey);
  await expect(prices.locator('.wb-core-axis')).toHaveCount(2);
  await expect(prices.getByRole('checkbox')).toHaveCount(0);
  await expect(prices.getByRole('button', { name: /优先降序：/, pressed: true })).toHaveCount(1);
  for (const select of await prices.locator('.wb-core-axis-scope').all()) {
    await expect(select).toHaveValue('at-least');
    assert(!(await select.locator('option').allTextContents()).some((text) => /[-−±]/.test(text)));
  }
  await prices.getByRole('button', { name: '检索提升候选', exact: true }).click();
  await expect(prices.getByText('符合要求的挂牌 1–12 神圣石')).toBeVisible();
  await expect(prices.locator('tbody tr')).toHaveCount(2);
  await expect(prices.getByRole('columnheader', { name: '换入后的整套四抗' })).toBeVisible();
  await expect(prices.locator('tbody tr').first().locator('td').first()).toHaveText('24');
  assert(!await prices.innerText().then((text) => text.includes('样本中位数')));
  assert.equal(requests.length, 1); assert.equal(requests[0].search.sort.price, 'asc');
  assert(!/pseudo_total_(fire|cold|lightning|chaos)_resistance/.test(JSON.stringify(requests[0])));
  assert(JSON.stringify(requests[0]).includes('"min":24'));
  assert(JSON.stringify(requests[0]).includes('"min":26'));
  assert(!JSON.stringify(requests[0]).includes('"max":25'));
  assert(!JSON.stringify(requests[0]).includes('"min":20.8'), 'surplus resistance must not gate a core price cohort');
  await mkdir('artifacts/workbench', { recursive: true });
  await page.screenshot({ path: 'artifacts/workbench/core-page-desktop.png' });
  await prices.screenshot({ path: 'artifacts/workbench/integrated-core-pricing.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/workbench/core-page-mobile.png' });
  await prices.screenshot({ path: 'artifacts/workbench/integrated-core-pricing-mobile.png' });
  const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((node) => node.getBoundingClientRect().right > innerWidth + 1 && node.getBoundingClientRect().width > 0).slice(0, 12).map((node) => ({ tag: node.tagName, class: node.className, right: node.getBoundingClientRect().right })));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), JSON.stringify(overflow));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await prices.getByRole('button', { name: '比较这件', exact: true }).first().click();
  await expect(loadout.getByRole('textbox', { name: '粘贴候选装备' })).toHaveValue(/24% increased Damage/);
  await page.getByRole('navigation', { name: '工作区域' }).getByRole('button', { name: '交易追踪', exact: true }).click();
  const official = page.getByRole('region', { name: '官方成交同步' });
  await expect(official.getByText('同步桥已连接 · 尚未读取成交')).toBeVisible();
  await official.getByRole('button', { name: '同步官方成交', exact: true }).click();
  await expect(official.getByText(/已同步 2 笔新成交/)).toBeVisible();
  const tracker = page.getByRole('region', { name: '交易追踪器' });
  await expect(tracker.getByLabel('交易统计通货')).toHaveValue('divine');
  await expect(tracker.locator('.tt-card strong')).toHaveText(['12', '4', '8']);
  let ledger = await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-finance-v1')));
  assert.equal(ledger.entries.length, 2); assert.equal(ledger.officialHistory['Forbidden Rites'].purchases, 1);
  await page.reload();
  await page.getByRole('navigation', { name: '工作区域' }).getByRole('button', { name: '交易追踪', exact: true }).click();
  await official.getByRole('button', { name: '同步官方成交', exact: true }).click();
  await expect(official.getByText(/已同步 0 笔新成交 · 重复 2 笔/)).toBeVisible();
  ledger = await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-finance-v1')));
  assert.equal(ledger.entries.length, 2);
  // Merchant-only data must not look like zero spending and realized profit.
  await page.evaluate(() => {
    const ledger = JSON.parse(localStorage.getItem('poe2-workbench-finance-v1'));
    ledger.entries = ledger.entries.filter((entry) => entry.kind === 'sale');
    ledger.officialHistory['Forbidden Rites'].purchases = 0;
    localStorage.setItem('poe2-workbench-finance-v1', JSON.stringify(ledger));
  });
  await page.reload();
  await page.getByRole('navigation', { name: '工作区域' }).getByRole('button', { name: '交易追踪', exact: true }).click();
  await expect(tracker.locator('.tt-card strong')).toHaveText(['12', '未记录', '待补支出']);
  await expect(tracker.getByText(/官网同步未读取到买入/)).toBeVisible();
  await mkdir('artifacts/workbench', { recursive: true });
  await page.screenshot({ path: 'artifacts/workbench/integrated-official-history.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: 'artifacts/workbench/integrated-official-history-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('PASS saved charm removals, core cohort bounds and price exclusion, candidate roundtrip, official bridge fixture income/expense and persistent dedup, missing spending coverage, mobile layout');
} finally { await browser.close(); }
