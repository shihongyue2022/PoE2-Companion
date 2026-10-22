import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { basename } from 'node:path';

// Run against the real local user's saved build; keep it out of tracked fixtures/logs.
if (!process.env.POB_BUILD_FILE) throw new Error('Set POB_BUILD_FILE to your local saved PoB2 XML. Personal builds are not committed.');
const xml = await readFile(process.env.POB_BUILD_FILE, 'utf8'), fileName = basename(process.env.POB_BUILD_FILE);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173/?companion=1');
  const before = await page.evaluate(async (input) => {
    const { parsePobXml, previewPob, pobImportSource } = await import('/src/workbench/pobImport.ts');
    const { emptyLoadout } = await import('/src/workbench/loadout.ts');
    const document = parsePobXml(input.xml), set = document.sets.find((entry) => entry.id === document.activeSet);
    const preview = previewPob(document, set.id, set.secondWeapons);
    const source = pobImportSource(document, set.id, set.secondWeapons, preview.slots, { name: input.fileName });
    delete source.combat; // Simulate an older already-imported loadout.
    const state = { ...emptyLoadout(), slots: preview.slots, source };
    localStorage.setItem('poe2-workbench-loadout-v1', JSON.stringify(state));
    return state;
  }, { xml, fileName });
  await page.reload();
  const loadout = page.getByRole('region', { name: '角色全身装备' });
  await loadout.getByText('技能与构成', { exact: true }).click();
  await loadout.getByRole('button', { name: '补读原 PoB2 的技能与伤害' }).click();
  await expect(loadout.getByText(/已补读技能、辅助宝石和保存时伤害/)).toBeVisible({ timeout: 20000 });
  const main = loadout.getByRole('region', { name: '主技能与辅助宝石' });
  await expect(main.getByText('闪电长矛', { exact: true })).toBeVisible();
  await expect(main.locator('.ca-gem.support')).toHaveCount(5);
  const damage = loadout.getByRole('region', { name: '技能伤害构成' });
  await expect(damage.getByText('174.46', { exact: true })).toBeVisible();
  await expect(damage.getByText(/不表示角色伤害为零/)).toBeVisible();
  const composition = loadout.getByRole('region', { name: '装备构成' });
  await composition.getByRole('combobox', { name: '装备贡献属性' }).selectOption('energyShield');
  assert(await composition.locator('.ca-contributions button').count() > 0);
  await composition.locator('.ca-contributions button').first().click();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')));
  assert.deepEqual(after.slots, before.slots); assert.deepEqual(after.goals, before.goals);
  assert(after.source.combat.sets[0].groups.length >= 18);
  assert(after.source.combat.matchesEquipment);
  await mkdir('artifacts/workbench', { recursive: true });
  await loadout.locator('.ca-panel').screenshot({ path: 'artifacts/workbench/character-analysis-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await loadout.locator('.ca-panel').screenshot({ path: 'artifacts/workbench/character-analysis-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('PASS actual saved PoB2 → older import metadata supplement → localized main + 5 supports, saved hit/DoT damage, per-slot contribution navigation');
  console.log('PASS actual loopback bridge, unchanged gear/goals, desktop/mobile, no page errors');
} finally { await browser.close(); }
