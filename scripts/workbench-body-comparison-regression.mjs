import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }), errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173/?companion=1');
  await expect(page.getByRole('region', { name: '角色全身装备' })).toBeVisible();
  const fixture = await page.evaluate(async () => {
    const { damageState } = await import('/src/workbench/fixtures/damageGoal.ts');
    const { MORIOR_INVICTUS_SAMPLE, MORIOR_INVICTUS_CANDIDATE } = await import('/src/workbench/fixtures/moriorInvictus.ts');
    const { REPLACEMENT_BEFORE } = await import('/src/workbench/fixtures/weaponReplacement.ts');
    const { equipmentSignature } = await import('/src/workbench/characterPanel.ts');
    const state = damageState();
    state.slots = { mainHand: REPLACEMENT_BEFORE, body: MORIOR_INVICTUS_SAMPLE };
    state.character.equipmentSignature = equipmentSignature(state.slots);
    state.character.values = { fireResistance: 189, coldResistance: 139, lightningResistance: 113, chaosResistance: 75 };
    state.source.equipmentSignature = equipmentSignature(state.slots);
    localStorage.setItem('poe2-workbench-loadout-v1', JSON.stringify(state));
    return { state, candidate: MORIOR_INVICTUS_CANDIDATE };
  });
  await page.reload();
  const loadout = page.getByRole('region', { name: '角色全身装备' });
  await loadout.getByRole('navigation').getByRole('button', { name: /^比较候选/ }).click();
  await loadout.getByLabel('粘贴候选装备').fill(fixture.candidate);
  await expect(loadout.getByRole('combobox', { name: '选择装备栏位' })).toHaveValue('body');
  const comparison = loadout.getByRole('region', { name: '比较替换装备' });
  await expect(comparison.getByText('当前：不败亡者', { exact: true })).toBeVisible();
  await expect(comparison.getByText('当前：神授命使', { exact: true })).toHaveCount(0);
  await comparison.getByRole('button', { name: '按两件全部镶嵌比较' }).click();
  const summary = comparison.getByRole('region', { name: '换装结论摘要' });
  await expect(summary.getByText('这件有取舍，不是全面升级')).toBeVisible();
  await expect(summary.getByText('护甲：1,532 → 1,366（-166）')).toBeVisible();
  await expect(summary.getByText('能量护盾：433 → 387（-46）')).toBeVisible();
  await expect(summary.getByText('每秒生命回复（固定值）：41 → 59（+18）')).toBeVisible();
  await expect(comparison.getByRole('row', { name: /^全域能量护盾增加/ })).toContainText('60%');
  await expect(comparison.getByRole('article', { name: '火焰抗性' }).getByText('总值：189% → 184%')).toBeVisible();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')).slots), fixture.state.slots);
  await mkdir('artifacts/workbench', { recursive: true });
  await comparison.screenshot({ path: 'artifacts/workbench/body-comparison-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await summary.screenshot({ path: 'artifacts/workbench/body-comparison-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('PASS pasted body replaces the comparison target, never the spear; five-socket defence/regen tradeoff is visible');
  console.log('PASS per-socket resistance projection, unchanged saved equipment, desktop/mobile');
} finally { await browser.close(); }
