import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const fixture = await readFile('src/workbench/fixtures/weaponReplacement.ts', 'utf8');
const before = /REPLACEMENT_BEFORE = `([\s\S]*?)`;/.exec(fixture)[1];
const after = /REPLACEMENT_AFTER = `([\s\S]*?)`;/.exec(fixture)[1];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }), errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  // This regression checks the independent paper comparison; capped-damage has its own suite.
  await page.addInitScript((raw) => localStorage.setItem('poe2-workbench-loadout-v1', JSON.stringify({ version: 1, slots: { mainHand: raw }, goals: { objective: 'balanced', priorities: ['life', 'fireResistance'], minimums: {} } })), before);
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173/?companion=1');
  const panel = page.getByRole('region', { name: '比较替换装备' });
  await page.locator('.lo-comparison > summary').click();
  await panel.getByLabel('粘贴候选装备').fill(after);
  await expect(panel.locator('.lo-verdict strong')).toHaveText('已比较属性提升');
  const row = panel.getByRole('row', { name: /武器物理 DPS/ });
  await expect(row).toContainText('398.37'); await expect(row).toContainText('473.9');
  await expect(row).toContainText('+75.53'); await expect(row).toContainText('+18.96%');
  await expect(panel.getByRole('row', { name: /最大生命/ })).toHaveCount(0);
  await expect(panel.getByText(/技能与特殊词缀对照.*0 项变化/)).toBeVisible();
  await mkdir('artifacts/workbench', { recursive: true });
  await panel.screenshot({ path: 'artifacts/workbench/replacement-same-mechanics.png' });
  console.log('PASS same bilingual mechanics permit the reported +18.96% physical panel verdict; irrelevant zero metrics are omitted');
  await panel.getByLabel('粘贴候选装备').fill(after.replace('等級 19', '等級 18'));
  await expect(panel.locator('.lo-verdict strong')).toHaveText('物品面板提升，整体收益待确认');
  await expect(panel.getByText('发生变化', { exact: true })).toBeVisible();
  await expect(panel.getByText(/候选：.*18/)).toBeVisible();
  await expect(row).toContainText('+18.96%');
  await panel.getByLabel('粘贴候选装备').fill(after.replace('元素傷害: 1-257\n', ''));
  await expect(panel.getByRole('row', { name: /武器总攻击 DPS/ })).toContainText('缺少伤害面板');
  await expect(panel.locator('.lo-verdict strong')).toHaveText('物品面板提升，整体收益待确认');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')));
  assert.equal(saved.slots.mainHand, before);
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await panel.screenshot({ path: 'artifacts/workbench/replacement-partial-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('PASS changed skill and missing elemental panel remain explicit without hiding the physical gain or replacing gear; mobile has no overflow');
} finally { await browser.close(); }
