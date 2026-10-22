import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';

const fixture = await readFile('src/workbench/fixtures/moriorInvictus.ts', 'utf8');
const raw = /MORIOR_INVICTUS_SAMPLE = `([\s\S]*?)`;/.exec(fixture)[1];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }), errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await mkdir('artifacts/workbench', { recursive: true });
  await page.addInitScript((raw) => localStorage.setItem('poe2-workbench-loadout-v1', JSON.stringify({ version: 1, slots: { body: raw }, goals: { priorities: ['life', 'fireResistance', 'coldResistance', 'lightningResistance'], minimums: {} } })), raw);
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173');
  const loadout = page.getByRole('region', { name: '角色全身装备' });
  await loadout.getByLabel('选择装备栏位').selectOption('body');
  await loadout.locator('.lo-comparison > summary').click();
  await loadout.getByLabel('粘贴候选装备').fill(raw);
  const comparison = page.getByRole('region', { name: '比较替换装备' });
  const row = (name) => comparison.getByRole('row').filter({ has: page.getByRole('rowheader', { name: new RegExp(`^${name}(?:优先)?$`) }) });
  await expect(comparison.getByText('装备文本相同，未发现升级差异', { exact: true })).toBeVisible();
  await expect(row('护甲')).toContainText('1,532');
  await expect(row('火焰抗性')).toContainText('待确认镶嵌');
  await expect(comparison.getByRole('button', { name: '无需替换：相同装备文本' })).toBeDisabled();
  assert.equal(await comparison.getByText(/尚未成为可搜索属性/).count(), 0);
  console.log('PASS supplied Traditional armour, corruption and identical-text detection; unknown socket effects are not displayed as zero');

  await comparison.getByRole('button', { name: '按两件全部镶嵌比较' }).click();
  await expect(row('火焰抗性')).toContainText('50%');
  await expect(row('每秒生命回复（固定值）')).toContainText('41');
  await expect(row('全域能量护盾增加')).toContainText('60%');
  await expect(row('能量护盾')).toHaveText('能量护盾4334330');
  await comparison.getByLabel('当前装备已镶嵌数量').selectOption('4');
  await expect(comparison.getByText('已比较属性提升', { exact: true })).toBeVisible();
  await expect(row('每秒生命回复（固定值）')).toContainText('+8.2');
  await expect(comparison.getByRole('button', { name: '无需替换：相同装备文本' })).toBeDisabled();
  console.log('PASS full sockets produce 50 all-res, 41 regen and 60% global defence without double-counting 433 local shield');

  await loadout.getByLabel('粘贴候选装备').fill(raw.replace('1532', '2000').replace('增加12(9-12)%全域', '增加11(9-12)%全域'));
  await expect(comparison.getByText('信息不足，暂不能判定升级', { exact: true })).toBeVisible();
  await comparison.getByRole('button', { name: '按两件全部镶嵌比较' }).click();
  await expect(comparison.getByText('有取舍', { exact: true })).toBeVisible();
  await expect(row('护甲')).toContainText('+468');
  await expect(row('全域能量护盾增加')).toContainText('-5%');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')));
  assert.equal(saved.slots.body, raw);
  await comparison.screenshot({ path: 'artifacts/workbench/socket-comparison-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
  await comparison.screenshot({ path: 'artifacts/workbench/socket-comparison-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('PASS higher local armour with lower global defence is a tradeoff; changing candidate clears socket assumptions, saved gear stays intact, mobile fits');
} finally { await browser.close(); }
