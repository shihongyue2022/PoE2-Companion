import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
const errors = [], searches = [];
page.on('pageerror', (error) => errors.push(error.message));
let rightLife = 80;
const xml = () => `<PathOfBuilding2><Build level="87" className="Witch" ascendClassName="Lich" targetVersion="0_5"><PlayerStat stat="Life" value="1530"/><PlayerStat stat="EnergyShield" value="4898"/></Build><Items activeItemSet="1">
<Item id="1"><![CDATA[Rarity: RARE
Old Dawn Loop
Amethyst Ring
Item Level: 82
Implicits: 1
+12% to Chaos Resistance
+70 to maximum Life
+17% to Fire Resistance]]></Item>
<Item id="2"><![CDATA[Rarity: RARE
Current Dusk Loop
Amethyst Ring
Item Level: 82
Implicits: 1
+12% to Chaos Resistance
+${rightLife} to maximum Life
+30% to Cold Resistance]]></Item>
<ItemSet id="1" title="Current"><Slot name="Ring 1" itemId="1"/><Slot name="Ring 2" itemId="2"/></ItemSet></Items></PathOfBuilding2>`;
try {
  // All character and market responses here are explicit synthetic fixtures, never live account data.
  await page.route('**/api/workbench/pob/builds', (route) => route.fulfill({ json: { ok: true, installed: true,
    builds: [{ id: 'b'.repeat(64), name: 'Character-integration-fixture.xml', modifiedAt: '2026-10-22T10:00:00Z', size: 1400 }] } }));
  await page.route('**/api/workbench/pob/build', (route) => route.fulfill({ json: { ok: true, name: 'Character-integration-fixture.xml', modifiedAt: '2026-10-22T10:00:00Z', xml: xml() } }));
  await page.route('**/api/workbench/estimate', (route) => {
    const request = route.request().postDataJSON(); searches.push(request);
    const weighted = request.search.sort['statgroup.0'] === 'desc';
    return route.fulfill({ json: { ok: true, total: 5, fetched: 5, priced: 5, sampledAt: new Date().toISOString(), cached: false,
      url: 'https://www.pathofexile.com/trade2', warnings: ['Mocked market fixture'], context: { sufficient: true, summary: ['Fixture affix filters'] },
      groups: [{ currency: 'divine', count: 5, median: 10, p25: 8, p75: 12, min: 6, max: 15 }],
      listings: weighted ? [{ id: 'candidate', name: 'Better Ring', base: 'Amethyst Ring', itemLevel: 82, rarity: 'rare',
        price: { amount: 12, currency: 'divine' }, implicitMods: ['+12% to Chaos Resistance'], explicitMods: ['+100 to maximum Life', '+40% to Cold Resistance'] }] : [] } });
  });
  await page.goto(base);
  const nav = page.getByRole('navigation', { name: '工作区域' });
  await nav.getByRole('button', { name: '角色装备', exact: true }).click();
  const loadout = page.getByRole('region', { name: '角色全身装备' });
  const craft = await page.evaluate(() => localStorage.getItem('poe2-workbench-v1'));
  await loadout.getByText('从 PoB2 导入整套装备', { exact: true }).click();
  const local = loadout.getByRole('region', { name: '本机 PoB2 角色导入' });
  await local.getByRole('button', { name: '刷新已保存角色' }).click();
  await local.getByRole('button', { name: '读取角色并预览' }).click();
  await expect(loadout.getByRole('region', { name: '整套装备更新对照' })).toBeVisible();
  await loadout.getByRole('button', { name: '确认替换整套装备（2 件）' }).click();
  await expect(loadout.getByRole('region', { name: '角色数据来源' })).toContainText('Character-integration-fixture.xml');
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')));
  assert.equal(saved.source.level, 87); assert.equal(saved.source.reference.values.life, 1530);
  assert.equal(saved.character, undefined);
  console.log('PASS PoB2 source/profile/reference persists without replacing the measured game baseline');

  await loadout.getByRole('button', { name: '右戒指：Current Dusk Loop', exact: true }).click();
  await loadout.getByRole('button', { name: '估价这件装备', exact: true }).click();
  let trade = page.getByRole('region', { name: '全物品查价', exact: true });
  await trade.getByRole('button', { name: '获取挂牌估价', exact: true }).click();
  await trade.getByRole('button', { name: '记录到角色装备估值（神圣石）', exact: true }).click();
  await nav.getByRole('button', { name: '角色装备', exact: true }).click();
  await expect(loadout.getByRole('region', { name: '整套装备挂牌参考' })).toContainText('1 / 2');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')));
  assert.equal(saved.quotes.ring2.amount, 10); assert.equal(saved.quotes.ring1, undefined);
  await nav.getByRole('button', { name: '交易追踪', exact: true }).click();
  const finance = page.getByRole('region', { name: '交易与资产损益' });
  await finance.getByText('持有资产估值涨跌 · 下线前后对比', { exact: true }).click();
  await finance.getByRole('button', { name: '从角色装备添加持有资产' }).click();
  await expect(finance.locator('.lo-notice')).toContainText('已新增 2');
  await finance.getByRole('button', { name: '从角色装备添加持有资产' }).click();
  await expect(finance.locator('.lo-notice')).toContainText('已新增 0');
  const ledger = await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-finance-v1')));
  assert.equal(ledger.assets.length, 2); assert.equal(ledger.entries.length, 0);
  const itemKey = (slot) => createHash('sha256').update(saved.slots[slot].trim().replace(/\r/g, '')).digest('hex');
  assert.equal(ledger.assets.find((asset) => asset.source.itemKey === itemKey('ring2')).price, 10);
  assert.equal(ledger.assets.find((asset) => asset.source.itemKey === itemKey('ring1')).price, null);
  console.log('PASS slot-specific quote goes to held assets once; unknown price stays null, no transactions invented');

  await nav.getByRole('button', { name: '角色装备', exact: true }).click();
  await loadout.getByRole('button', { name: '寻找这件的升级', exact: true }).click();
  trade = page.getByRole('region', { name: '全物品查价', exact: true });
  await expect(trade).toContainText('已关联角色右戒指');
  await trade.getByRole('button', { name: '搜索市场综合候选', exact: true }).click();
  await expect(trade).toContainText('Better Ring');
  await trade.getByRole('button', { name: '加入换装比较', exact: true }).click();
  await expect(loadout.getByRole('region', { name: '比较替换装备' })).toContainText('替换右戒指');
  await expect(loadout.getByRole('button', { name: '右戒指：Current Dusk Loop', exact: true })).toBeVisible();
  await loadout.getByRole('button', { name: '采用候选并替换右戒指', exact: true }).click();
  await expect(loadout.getByRole('button', { name: '右戒指：Better Ring', exact: true })).toBeVisible();
  await expect(loadout.getByRole('button', { name: '左戒指：Old Dawn Loop', exact: true })).toBeVisible();
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')));
  assert.equal(saved.quotes?.ring2, undefined);
  await expect(loadout.getByRole('region', { name: '角色数据来源' })).toContainText('装备已手动变更');
  assert.equal(await page.evaluate(() => localStorage.getItem('poe2-workbench-v1')), craft);
  console.log('PASS weighted search uses loadout priorities; market candidate returns to right ring, old quote expires');

  await loadout.locator('.lo-import-fold > summary').click();
  await loadout.getByText('从 PoB2 导入整套装备', { exact: true }).click();
  rightLife = 95;
  await local.getByRole('button', { name: '刷新已保存角色' }).click();
  await local.getByRole('button', { name: '读取角色并预览' }).click();
  await loadout.getByRole('button', { name: '确认替换整套装备（2 件）' }).click();
  await loadout.getByText('最近一次整套更新对照', { exact: true }).click();
  await expect(loadout.getByRole('region', { name: '整套装备更新对照' }).getByTitle('Better Ring → Current Dusk Loop')).toBeVisible();
  await page.reload(); await nav.getByRole('button', { name: '角色装备', exact: true }).click();
  await expect(loadout.getByRole('region', { name: '角色数据来源' })).toContainText('Character-integration-fixture.xml');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')));
  assert(saved.previous.slots.ring2.includes('Better Ring'));
  console.log('PASS reimport remembers previous gear and source across reload');
  await mkdir('artifacts/workbench', { recursive: true });
  await page.screenshot({ path: 'artifacts/workbench/character-data-integration.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1);
  assert.deepEqual(errors, []);
  console.log('PASS browser errors and 390px layout (character and market responses mocked)');
} finally { await browser.close(); }
