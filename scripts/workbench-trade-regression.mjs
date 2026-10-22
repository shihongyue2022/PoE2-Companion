import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const fixtureFile = await readFile(new URL('../src/workbench/fixtures/breachRing.ts', import.meta.url), 'utf8');
const raw = /BREACH_RING_SAMPLE = `([\s\S]*?)`;/.exec(fixtureFile)?.[1];
assert(raw);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1150 } });
const page = await context.newPage();
const errors = [];
const checks = [];
page.on('pageerror', (error) => errors.push(error.message));
const check = (name) => { checks.push(name); console.log('PASS', name); };
const directory = 'artifacts/workbench';
await mkdir(directory, { recursive: true });
const searchLink = () => page.getByRole('link', { name: '在官方交易网站搜索' });
async function query() {
  const href = await searchLink().getAttribute('href');
  const url = new URL(href);
  assert.equal(url.hostname, 'www.pathofexile.com');
  return JSON.parse(url.searchParams.get('q')).query;
}
try {
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.locator('.wb-pool-row').first().waitFor();
  await page.getByRole('button', { name: '粘贴游戏物品' }).click();
  await page.getByLabel('游戏物品文本').fill(raw);
  await page.getByRole('button', { name: '识别并导入' }).click();
  assert.equal(await page.locator('.wb-current-mods .wb-mod').count(), 6);
  assert.equal(await page.getByLabel('装备底座').inputValue(), 'Breach Ring');
  const rarity = page.locator('.wb-current-mods [data-mod-id="Rings/ItemFoundRarityIncrease"]');
  assert(await rarity.getByRole('checkbox', { name: '已锁定／破裂' }).isChecked());
  check('imports all six advanced Hant affixes and preserves the fractured suffix');

  const nav = page.getByRole('navigation', { name: '工作区域' });
  await nav.getByRole('button', { name: '官方查价' }).click();
  await searchLink().waitFor();
  let q = await query();
  assert.equal(q.type, undefined);
  assert.equal(q.filters.misc_filters, undefined);
  assert.equal(q.status.option, 'any');
  assert.equal(await page.locator('.wb-trade-filter.enabled').count(), 3);
  const total = page.locator('[data-filter-key="pseudo:elemental-resistance"]');
  assert(await total.getByRole('checkbox').isChecked());
  assert.equal(await total.getByLabel('总元素抗性 下限').inputValue(), '62.4');
  check('similar search selects three useful stats including 78 total resistance at 80%, with no hidden base or ilvl');

  await page.getByRole('button', { name: '全部实际属性' }).click();
  q = await query();
  const amounts = [...new Set(q.stats.flatMap((group) => group.filters).map((filter) => filter.value?.min))].sort((a, b) => a - b);
  assert.deepEqual(amounts, [15, 18, 33, 34, 36.5, 157]);
  assert.equal(await page.locator('.wb-trade-filter.enabled').count(), 6);
  check('all-actual search keeps fire 36.5, lightning 34, mana157, rarity18, allres15 and cold33 without reapplying quality');

  const fire = page.locator('.wb-trade-filter[data-mod-id="Rings/FireDamage"]');
  await fire.locator('input[type="number"]').first().fill('20');
  q = await query();
  assert(q.stats.flatMap((group) => group.filters).some((filter) => filter.value?.min === 20));
  await fire.getByRole('checkbox').uncheck();
  assert.equal(await page.locator('.wb-trade-filter.enabled').count(), 5);
  await page.getByRole('checkbox', { name: '限定当前底座' }).check();
  await page.getByRole('checkbox', { name: '限制物品等级' }).check();
  q = await query();
  assert.equal(q.type, 'Breach Ring');
  assert.equal(q.filters.misc_filters.filters.ilvl.min, 79);
  check('editable per-stat bounds, selection, base and ilvl directly update official query');

  await page.getByRole('button', { name: '放宽数值与底座限制' }).click();
  q = await query();
  assert.equal(q.type, undefined);
  assert.equal(q.filters.misc_filters, undefined);
  await page.getByRole('button', { name: '宽松比较' }).click();
  assert.equal(await page.locator('.wb-trade-filter.enabled').count(), 2);
  await page.getByLabel('属性匹配', { exact: true }).selectOption('count');
  await page.getByLabel('至少满足属性数').fill('1');
  q = await query();
  assert(q.stats.some((group) => group.type === 'count' && group.value.min === 1));
  check('relaxing removes base/ilvl and supports matching only part of selected stats');

  await page.getByRole('button', { name: '全部实际属性' }).click();
  await fire.locator('input[type="number"]').last().fill('10');
  assert.equal(await searchLink().count(), 0);
  assert.match(await page.getByRole('alert').innerText(), /下限不能大于上限/);
  await fire.locator('input[type="number"]').last().fill('');
  await page.getByRole('button', { name: '只要求属性存在' }).click();
  q = await query();
  assert(q.stats.flatMap((group) => group.filters).every((filter) => filter.value === undefined));
  check('invalid intervals stop link generation; blank numeric ranges search attribute presence');

  await page.getByRole('button', { name: '找同类顶配' }).click();
  assert.equal(await page.locator('.wb-trade-filter.enabled').count(), 3);
  const mana = page.locator('.wb-trade-filter[data-mod-id="Rings/IncreasedMana"]');
  const cold = page.locator('.wb-trade-filter[data-mod-id="Rings/ColdResistance"]');
  assert.equal(await mana.locator('input[type="number"]').first().inputValue(), '165');
  assert.equal(await fire.locator('input[type="number"]').first().inputValue(), '36.5');
  assert.equal(await total.getByLabel('总元素抗性 下限').inputValue(), '86');
  q = await query();
  assert.equal(q.type, undefined);
  assert.equal(q.filters.misc_filters, undefined);
  assert.match(await page.locator('.wb-trade-top').innerText(), /规则快照 0\.5\.0/);
  check('top gear search raises copied directions to T1 without the original ilvl79 cap or lowering quality-enhanced fire');

  await fire.getByRole('checkbox').uncheck();
  await page.getByLabel('顶配数值档位').selectOption('high');
  assert.equal(await mana.locator('input[type="number"]').first().inputValue(), '176.2');
  assert.equal(await fire.getByRole('checkbox').isChecked(), false);
  await page.getByLabel('顶配数值档位').selectOption('perfect');
  assert.equal(await mana.locator('input[type="number"]').first().inputValue(), '179');
  await page.getByLabel('顶配数值档位').selectOption('t1');
  await page.getByRole('checkbox', { name: '所选属性不低于当前装备' }).uncheck();
  assert.equal(await fire.locator('input[type="number"]').first().inputValue(), '31');
  check('top tier and high-roll controls preserve selected stats and can release the original-item numeric floor');

  await page.getByRole('checkbox', { name: '所选属性不低于当前装备' }).check();
  await page.getByRole('button', { name: '保留全部词缀方向' }).click();
  assert.equal(await page.locator('.wb-trade-filter.enabled').count(), 6);
  assert.equal(await cold.locator('input[type="number"]').first().inputValue(), '41');
  assert.equal(await total.getByRole('checkbox').isChecked(), false);
  await page.getByRole('button', { name: '恢复核心方向' }).click();
  assert.equal(await page.locator('.wb-trade-filter.enabled').count(), 3);
  assert.equal(await total.getByRole('checkbox').isChecked(), true);
  assert.equal(await cold.getByRole('checkbox').isChecked(), false);
  check('top gear profile switches between original six-affix directions and core totals without duplicate resistance constraints');

  await page.screenshot({ path: `${directory}/top-gear-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${directory}/top-gear-mobile.png`, fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1);
  check('top gear controls fit a 390px viewport');
  await page.setViewportSize({ width: 1440, height: 1150 });

  await page.getByRole('button', { name: '相似查价' }).click();
  await page.screenshot({ path: `${directory}/flexible-trade-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${directory}/flexible-trade-mobile.png`, fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1);
  check('flexible trade editor fits a 390px viewport');

  await page.locator('.wb-current-mods [data-mod-id="Rings/IncreasedMana"] select').selectOption('3');
  assert.equal(await page.locator('.wb-trade-filter[data-origin="actual"]').count(), 0);
  assert.match(await page.locator('.wb-trade-search').innerText(), /经过编辑或模拟/);
  await page.reload({ waitUntil: 'networkidle' });
  await nav.getByRole('button', { name: '官方查价' }).click();
  assert.match(await page.locator('.wb-trade-search').innerText(), /经过编辑或模拟/);
  check('editing gear invalidates original roll provenance and remains safe after reload');
  assert.deepEqual(errors, []);
  check('no uncaught browser errors');
  await writeFile(`${directory}/trade-regression-results.json`, JSON.stringify({ checks, errors, at: new Date().toISOString() }, null, 2));
} finally {
  await browser.close();
}
