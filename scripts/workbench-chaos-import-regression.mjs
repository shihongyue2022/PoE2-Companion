import { chromium, expect } from '@playwright/test';
import { readFile, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

// Set POB_BUILD_FILE to validate a real local snapshot; no personal XML is tracked.
const file = process.env.POB_BUILD_FILE;
const xml = file ? await readFile(file, 'utf8') : `<PathOfBuilding2><Build level="87">
<PlayerStat stat="FireResist" value="75"/><PlayerStat stat="FireResistOverCap" value="116"/>
<PlayerStat stat="ColdResist" value="75"/><PlayerStat stat="ColdResistOverCap" value="35"/>
<PlayerStat stat="LightningResist" value="75"/><PlayerStat stat="LightningResistOverCap" value="47"/>
<PlayerStat stat="ChaosResist" value="28"/><PlayerStat stat="ChaosResistOverCap" value="0"/>
</Build><Items activeItemSet="1"><Item id="1"><![CDATA[Rarity: RARE
Test Loop
Gold Ring
--------
+20% to Fire Resistance]]></Item><ItemSet id="1"><Slot name="Ring 1" itemId="1"/></ItemSet></Items></PathOfBuilding2>`;
const name = file ? path.basename(file) : 'Reference.xml';
const modifiedAt = file ? (await stat(file)).mtime.toISOString() : '2026-10-23T00:00:00Z';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.route('**/api/workbench/pob/builds', (route) => route.fulfill({ json: { ok: true, installed: true, builds: [{ id: 'a'.repeat(64), name, modifiedAt }] } }));
  await page.route('**/api/workbench/pob/build', (route) => route.fulfill({ json: { ok: true, xml, name, modifiedAt } }));
  await page.goto(process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173/?companion=1');
  await expect(page.getByRole('region', { name: '角色全身装备' })).toBeVisible();
  const original = await page.evaluate(async ({ xml, name, modifiedAt }) => {
    const { parsePobXml, previewPob, pobImportSource } = await import('/src/workbench/pobImport.ts');
    const { emptyLoadout } = await import('/src/workbench/loadout.ts');
    const doc = parsePobXml(xml), set = doc.sets.find((s) => s.id === doc.activeSet);
    const { slots } = previewPob(doc, set.id, set.secondWeapons);
    const state = { ...emptyLoadout(), slots, source: pobImportSource(doc, set.id, set.secondWeapons, slots, { name, modifiedAt }) };
    const chaos = state.source.reference.values.chaosResistance;
    if (typeof chaos !== 'number') throw Error('Original snapshot chaos was not parsed');
    // Reproduce old persisted imports: effective exists, total and cap are missing.
    delete state.source.reference.values.chaosResistance;
    localStorage.setItem('poe2-workbench-loadout-v1', JSON.stringify(state));
    return { chaos, slots };
  }, { xml, name, modifiedAt });
  await page.reload();
  const strip = page.getByRole('region', { name: '当前整套抗性' });
  await expect(strip).toContainText(`混沌抗性：${original.chaos}%（总值） / 上限未导出`);
  await strip.getByRole('button', { name: '确认我的四项抗性上限均为 75%' }).click();
  await expect(strip).toContainText(`混沌抗性：${Math.min(original.chaos, 75)}% / 75%`);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-loadout-v1')).slots), original.slots);
  await page.reload();
  await expect(strip).toContainText(`混沌抗性：${Math.min(original.chaos, 75)}% / 75%`);
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(errors, []);
  console.log(`PASS ${file ? 'actual saved PoB2 XML' : 'native PoB2 stat fixture'}: chaos ${original.chaos}%, legacy reference repaired, explicit 75% cap persisted, gear preserved`);
} finally { await browser.close(); }
