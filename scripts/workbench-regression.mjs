import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const fixture = {
  item: { baseId: 'Rings', level: 82, rarity: 'rare', prefixes: [{ modId: 'Rings/IncreasedLife', tierDisplay: 3 }], suffixes: [] },
  baseName: 'Ruby Ring', targets: [{ modId: 'Rings/Essence_ColdResistance', tierDisplay: 1 }],
  raw: '', league: 'Forbidden Rites', overrides: {},
  options: { strengths: true, omens: false, essences: true, desecration: false }, baseCost: 0,
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript((value) => {
  if (!localStorage.getItem('workbench-regression-installed')) {
    localStorage.setItem('poe2-workbench-v1', JSON.stringify(value));
    localStorage.setItem('workbench-regression-installed', '1');
  }
}, fixture);
const page = await context.newPage();
const errors = [];
const checks = [];
page.on('pageerror', (error) => errors.push(error.message));
const pass = (name) => { checks.push(name); console.log('PASS', name); };
await mkdir('artifacts/workbench', { recursive: true });
try {
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: '工作区域' }).getByRole('button', { name: '制作策略' }).click();
  await page.locator('.wb-library > summary').click();
  await page.locator('.wb-pool-row').first().waitFor();
  const targetIssue = page.locator('.wb-target-issue');
  assert.match(await targetIssue.innerText(), /普通精华.*魔法.*稀有/s);
  assert(await page.getByRole('button', { name: '计算制作策略', exact: true }).isDisabled());
  assert.equal(await page.locator('.wb-results').count(), 0);
  pass('impossible rare-item Essence goal blocked before starting a solve');

  assert.equal(await page.getByLabel('词缀来源', { exact: true }).inputValue(), 'normal');
  assert.equal(await page.locator('.wb-pool-list [data-mod-id="Rings/Essence_ColdResistance"]').count(), 0);
  await page.getByLabel('词缀来源', { exact: true }).selectOption('essence');
  const essenceRow = page.locator('.wb-pool-list [data-mod-id="Rings/Essence_ColdResistance"]');
  assert(await essenceRow.getByRole('button').isDisabled());
  assert.match(await essenceRow.innerText(), /普通精华专属/);
  pass('ordinary source is default and unavailable Essence rows explain their restrictions');

  await page.getByRole('button', { name: '改选普通词缀 · T3 · 31–35', exact: true }).click();
  assert.equal(await page.locator('.wb-targets [data-mod-id="Rings/ColdResistance"] select').inputValue(), '3');
  assert.equal(await page.locator('.wb-targets [data-mod-id="Rings/Essence_ColdResistance"]').count(), 0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-v1')));
  assert.deepEqual(saved.item, fixture.item);
  pass('explicit recovery chooses the normal source at the same range without changing equipment');

  await page.getByRole('button', { name: '计算制作策略', exact: true }).click();
  await page.locator('.wb-results').waitFor({ timeout: 60_000 });
  const cost = Number((await page.locator('.wb-metrics>div').first().locator('strong').innerText()).replaceAll(',', ''));
  assert(Number.isFinite(cost) && cost > 0);
  assert.match(await page.locator('.wb-results').innerText(), /当前模型已收敛/);
  pass('recovered normal Cold Resistance goal obtains a real nonzero policy');

  const officialImage = page.locator('.wb-item-art img');
  await officialImage.waitFor({ timeout: 15_000 });
  const source = await officialImage.getAttribute('src');
  assert.equal(new URL(source).hostname, 'web.poecdn.com');
  assert.equal(await page.getByRole('link', { name: 'GGG 官方图片' }).getAttribute('href'), source);
  await page.waitForFunction(() => {
    const image = document.querySelector('.wb-item-art img');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  }, undefined, { timeout: 25_000 });
  pass('Ruby Ring artwork loads from the verified official GGG CDN with a source link');
  await page.screenshot({ path: 'artifacts/workbench/official-ring.png', fullPage: true });

  await page.getByText('修改底座、稀有度与物等', { exact: true }).click();
  await page.getByLabel('装备类型', { exact: true }).selectOption('Amulets');
  await page.waitForFunction(() => {
    const image = document.querySelector('.wb-item-art img');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 && image.alt.includes('项链');
  }, undefined, { timeout: 25_000 });
  assert.notEqual(await page.locator('.wb-item-art img').getAttribute('src'), source);
  pass('switching to an amulet loads its corresponding official artwork');
  await page.screenshot({ path: 'artifacts/workbench/official-amulet.png', fullPage: true });
  await page.evaluate(async () => {
    const { BREACH_RING_SAMPLE } = await import('/src/workbench/fixtures/breachRing.ts');
    const { loadEngine } = await import('/src/lib/engine.ts');
    const { parseWorkbenchItem } = await import('/src/workbench/itemImport.ts');
    const imported = parseWorkbenchItem((await loadEngine()).data, BREACH_RING_SAMPLE);
    localStorage.setItem('poe2-workbench-v1', JSON.stringify({ item: { baseId: 'Rings', level: 79, rarity: 'rare', prefixes: imported.prefixes.slice(0, 1), suffixes: imported.suffixes.slice(1) },
      baseName: 'Breach Ring', targets: [], raw: BREACH_RING_SAMPLE, league: 'Forbidden Rites', overrides: {}, baseCost: 0,
      warnings: ['未识别：{ 已褻瀆 前綴 "電極的"(階層: 1) }'] }));
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('poe2-workbench-v1'));
    return [saved.item.prefixes.length, saved.item.suffixes.length, saved.warnings.length];
  })).toEqual([3, 3, 0]);
  pass('engine readiness repairs a saved legacy advanced-header import before further crafting');
  assert.deepEqual(errors, []);
  await writeFile('artifacts/workbench/regression-results.json', JSON.stringify({ checks, errors, at: new Date().toISOString() }, null, 2));
} finally {
  await browser.close();
}
