import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }), calls = [], errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let updatedXml;
await page.route('**/api/workbench/pob/**', async (route) => {
  const action = new URL(route.request().url()).pathname.split('/').at(-1);
  calls.push({ action, method: route.request().method(), body: route.request().postDataJSON() });
  const value = action === 'launch' ? { ok: true } : action === 'builds' ? { ok: true, installed: true, builds: [
    { id: 'b'.repeat(64), name: 'Other.xml', modifiedAt: '2026-10-23T12:00:00Z', size: 100 },
    { id: 'a'.repeat(64), name: 'Current.xml', modifiedAt: '2026-10-23T11:00:00Z', size: 100 },
  ] } : { ok: true, xml: updatedXml, name: 'Current.xml', modifiedAt: '2026-10-23T11:00:00Z' };
  await route.fulfill({ json: value });
});
try {
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173/?companion=1');
  await expect(page.getByRole('region', { name: '角色全身装备' })).toBeVisible();
  const before = await page.evaluate(async () => {
    const { damageState } = await import('/src/workbench/fixtures/damageGoal.ts');
    const { combatXml } = await import('/src/workbench/fixtures/pobCombat.ts');
    const state = damageState(); state.source.fileName = 'Current.xml'; state.source.savedAt = '2026-10-22T10:00:00Z';
    localStorage.setItem('poe2-workbench-loadout-v1', JSON.stringify(state));
    return { state, xml: combatXml.replace('+70 to maximum Life', '+110 to maximum Life') };
  });
  updatedXml = before.xml;
  await page.reload();
  const loadout = page.getByRole('region', { name: '角色全身装备' });
  const controls = loadout.getByRole('region', { name: '本机 PoB2 角色导入' });
  await expect(controls.getByRole('button', { name: '打开 PoB2' })).toBeVisible();
  await expect(controls.getByRole('button', { name: '保存后重新读取' })).toBeVisible();
  assert.equal(calls.length, 0);
  await controls.getByRole('button', { name: '打开 PoB2' }).click();
  await expect(controls.getByRole('status')).toContainText('Ctrl+S');
  assert.equal(calls[0].action, 'launch'); assert.equal(calls[0].method, 'POST');
  await controls.getByRole('button', { name: '保存后重新读取' }).click();
  const preview = loadout.locator('.lo-pob-preview');
  await expect(preview).toBeVisible();
  assert.equal(calls.find((call) => call.action === 'build').body.id, 'a'.repeat(64));
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')).slots), before.state.slots);
  await mkdir('artifacts/workbench', { recursive: true });
  await controls.screenshot({ path: 'artifacts/workbench/pob-update-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await controls.screenshot({ path: 'artifacts/workbench/pob-update-mobile.png' });
  await preview.getByRole('button', { name: /确认替换整套装备/ }).click();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')));
  assert(after.slots.ring1.includes('+110 to maximum Life'));
  assert.equal(after.source.savedAt, '2026-10-23T11:00:00Z');
  assert.equal(after.character, undefined); assert.deepEqual(after.goals, before.state.goals);
  assert.deepEqual(errors, []);
  console.log('PASS visible launch/save/read controls, explicit POST launch, current file wins over newer other character');
  console.log('PASS saved snapshot preview before confirm, fresh metadata, intact goals, desktop/mobile');
} finally { await browser.close(); }
