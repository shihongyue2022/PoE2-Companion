import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const base = process.env.WORKBENCH_URL ?? 'http://127.0.0.1:4174';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
const errors = []; page.on('pageerror', (error) => errors.push(error.message));
const xml = `<PathOfBuilding2><Items activeItemSet="1"><Item id="7"><![CDATA[Rarity: RARE
Dawn Loop
Amethyst Ring
Item Level: 82
Implicits: 1
+12% to Chaos Resistance
{range:0.5}+(70-90) to maximum Life
+17% to Fire Resistance]]></Item><ItemSet id="1" title="Current"><Slot name="Ring 1" itemId="7" /></ItemSet></Items></PathOfBuilding2>`;
const fixture = (await readFile('src/workbench/fixtures/igniferis.ts', 'utf8')).match(/`([\s\S]*)`;/)[1];
await mkdir('artifacts/workbench', { recursive: true });
const nav = () => page.getByRole('navigation', { name: '工作区域' });
try {
  await page.goto(base);
  await nav().getByRole('button', { name: '角色装备', exact: true }).click();
  const loadout = page.getByRole('region', { name: '角色全身装备' });
  const craftBefore = await page.evaluate(() => localStorage.getItem('poe2-workbench-v1'));
  await loadout.getByText('从 PoB2 导入整套装备', { exact: true }).click();
  await loadout.getByLabel('PoB2 分享代码或 XML', { exact: true }).fill(deflateSync(xml).toString('base64url'));
  await loadout.getByRole('button', { name: '预览 PoB2 装备', exact: true }).click();
  await expect(loadout.getByText('左戒指：稀有紫晶戒指', { exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => localStorage.getItem('poe2-workbench-loadout-v1')), null);
  await loadout.getByRole('button', { name: '确认替换整套装备（1 件）', exact: true }).click();
  await expect(loadout.getByRole('button', { name: '左戒指：Dawn Loop', exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => localStorage.getItem('poe2-workbench-v1')), craftBefore);
  console.log('PASS actual compressed PoB2 share code previews before import and preserves crafting session');

  await loadout.getByLabel('选择装备栏位', { exact: true }).selectOption('amulet');
  await loadout.getByLabel('导入此栏装备', { exact: true }).fill(fixture + '\n--------\n雙重 Corrupted');
  await loadout.getByRole('button', { name: '放入项链', exact: true }).click();
  await loadout.getByRole('button', { name: '估价这件装备', exact: true }).click();
  const trade = page.getByRole('region', { name: '全物品查价', exact: true });
  await expect(trade.locator('.wb-trade-filter')).toHaveCount(6);
  await expect(trade.getByText('双重腐化', { exact: true })).toBeVisible();
  await expect(trade.getByText(/未加入交易条件的文字/)).toHaveCount(0);
  await trade.getByText('装备背景文字', { exact: true }).click();
  await expect(trade.getByText('屹立不摇的火炉，永不失去温暖，', { exact: true })).toBeVisible();
  await trade.screenshot({ path: 'artifacts/workbench/igniferis-recognized.png' });
  console.log('PASS supplied Igniferis has six real searchable effects, separate lore and double corruption');

  await nav().getByRole('button', { name: '交易追踪', exact: true }).click();
  const finance = page.getByRole('region', { name: '交易与资产损益', exact: true });
  await finance.getByText('场次与手动记账', { exact: true }).click();
  await finance.getByRole('button', { name: '开始本场记录', exact: true }).click();
  async function entry(kind, label, amount, currency = 'exalted', confirmed = true) {
    await finance.getByLabel('收支类型', { exact: true }).selectOption(kind);
    await finance.getByLabel('收支说明', { exact: true }).fill(label);
    await finance.getByLabel('收支数量', { exact: true }).fill(String(amount));
    await finance.getByLabel('收支通货', { exact: true }).selectOption(currency);
    await finance.getByRole('button', { name: '加入待确认', exact: true }).click();
    if (confirmed) await finance.getByRole('row').filter({ has: page.getByText(label, { exact: true }) }).getByRole('button', { name: '确认已成交 / 消耗', exact: true }).click();
  }
  await entry('sale', '测试出售项链', 100);
  await entry('purchase', '测试购买底装', 30);
  await entry('craft', '测试实际崇高消耗', 5);
  await entry('sale', '尚未完成的交易邀请', 9999, 'exalted', false);
  await entry('sale', '另一笔神圣石出售', 2, 'divine');
  const cash = finance.getByRole('region', { name: '已确认收支', exact: true });
  const exalted = cash.locator('table').first().getByRole('row').filter({ has: page.getByRole('rowheader', { name: '崇高石', exact: true }) });
  await expect(exalted.getByRole('cell').last()).toHaveText('65');
  await expect(cash.getByText(/待确认 1 条，不计入报告/)).toBeVisible();
  console.log('PASS confirmed receipts 100 - 30 - 5 = 65 Ex; pending 9999 excluded and Divine separate');

  await finance.getByText('持有资产估值涨跌 · 下线前后对比', { exact: true }).click();
  await finance.getByLabel('资产名称', { exact: true }).fill('测试持有戒指');
  await finance.getByLabel('新增资产数量', { exact: true }).fill('2');
  await finance.getByRole('button', { name: '添加持有资产', exact: true }).click();
  await finance.getByLabel('测试持有戒指参考单价', { exact: true }).fill('100');
  await finance.getByRole('button', { name: '保存估值快照', exact: true }).click();
  await finance.getByLabel('测试持有戒指持有数量', { exact: true }).fill('1');
  await finance.getByLabel('测试持有戒指参考单价', { exact: true }).fill('120');
  await finance.getByRole('button', { name: '保存估值快照', exact: true }).click();
  await expect(finance.locator('.fn-result strong')).toHaveText('40 崇高石');
  await expect(finance.getByRole('row').filter({ has: page.getByRole('rowheader', { name: '测试持有戒指', exact: true }) }).last()).toContainText('-120');
  await finance.getByRole('button', { name: '结束本场 / 下线记账', exact: true }).click();
  await page.reload();
  await nav().getByRole('button', { name: '交易追踪', exact: true }).click();
  await finance.getByText('场次与手动记账', { exact: true }).click();
  await finance.getByText('持有资产估值涨跌 · 下线前后对比', { exact: true }).click();
  await expect(finance.locator('.fn-result strong')).toHaveText('40 崇高石');
  await expect(finance.getByRole('button', { name: '结束本场 / 下线记账', exact: true })).toBeDisabled();
  await finance.screenshot({ path: 'artifacts/workbench/finance-separated.png' });
  console.log('PASS fixed-holdings revaluation +40, quantity change -120 separate; snapshots/session survive reload');

  const peer = await page.context().newPage();
  peer.on('pageerror', (error) => errors.push(error.message));
  await peer.goto(base);
  await peer.getByRole('navigation', { name: '工作区域' }).getByRole('button', { name: '交易追踪', exact: true }).click();
  const peerFinance = peer.getByRole('region', { name: '交易与资产损益', exact: true });
  await peerFinance.getByText('场次与手动记账', { exact: true }).click();
  await peerFinance.getByRole('button', { name: '开始本场记录', exact: true }).click();
  await expect(finance.getByRole('button', { name: '开始本场记录', exact: true })).toBeDisabled();
  await peerFinance.getByLabel('收支类型', { exact: true }).selectOption('income');
  await peerFinance.getByLabel('收支说明', { exact: true }).fill('另一窗口的拾取');
  await peerFinance.getByLabel('收支数量', { exact: true }).fill('7');
  await peerFinance.getByRole('button', { name: '加入待确认', exact: true }).click();
  await peerFinance.getByRole('button', { name: '确认已成交 / 消耗', exact: true }).click();
  await entry('income', '原窗口的拾取', 3);
  await expect(finance.getByRole('region', { name: '已确认收支', exact: true }).locator('table').first().getByRole('cell').last()).toHaveText('10');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-finance-v1')).entries.length), 7);
  await peer.close();
  console.log('PASS two workshop windows synchronize confirmed ledger entries without overwriting');

  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
  await finance.screenshot({ path: 'artifacts/workbench/finance-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('PASS mobile view has no horizontal page overflow or uncaught errors');
} finally { await browser.close(); }
