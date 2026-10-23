import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const fixture = await readFile(new URL('../src/workbench/fixtures/breachRing.ts', import.meta.url), 'utf8');
const raw = /BREACH_RING_SAMPLE = `([\s\S]*?)`;/.exec(fixture)[1];
const afterAnnul = raw.replace(/\{ 已褻瀆 前綴[^\r\n]*\r?\n攻擊附加2[^\r\n]*\r?\n/, '');
assert.notEqual(raw, afterAnnul);
const finished = raw.replace('{ 前綴 "純藍的"(階層：2)', '{ 前綴 "純藍的"(階層：1)').replace('+157(150-164)最大魔力', '+170(165-179)最大魔力');
const baseUrl = process.env.WORKBENCH_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
const errors = [];
const checks = [];
const check = (message) => { checks.push(message); console.log('PASS', message); };
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('artifacts/workbench', { recursive: true });
try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('navigation', { name: '工作区域' }).getByRole('button', { name: '制作策略' }).click();
  await page.locator('.wb-pool-row').first().waitFor();
  await page.getByRole('button', { name: '粘贴游戏物品' }).click();
  await page.getByLabel('游戏物品文本').fill(raw);
  await page.getByRole('button', { name: '识别并导入' }).click();
  const advisor = page.getByRole('region', { name: '底材与做装建议' });
  assert.match(await advisor.innerText(), /至少需要物等 82/);
  const cold = advisor.locator('[data-ceiling-id="Rings/ColdResistance"]');
  assert.match(await cold.innerText(), /T2/);
  assert.match(await cold.innerText(), /T1 需物等 82/);
  const baseLink = new URL(await advisor.getByRole('link', { name: /查物等 82/ }).getAttribute('href'));
  assert.equal(JSON.parse(baseLink.searchParams.get('q')).query.filters.misc_filters.filters.ilvl.min, 82);
  check('pasted ring immediately diagnoses ilvl79 cold ceilingT2 and links to ilvl82+ replacement bases');

  await page.getByLabel('搜索精度').selectOption('15000');
  await page.getByText('通货范围与计算选项', { exact: true }).click();
  await page.getByRole('checkbox', { name: /同时抽样验证/ }).check();
  await advisor.locator(':scope > details.wb-fold > summary').click();
  await page.getByLabel('追加材料预算档位').selectOption('0');
  const repair = advisor.locator('[data-candidate-id="repair"]');
  await repair.getByRole('button', { name: '单独评估此方案' }).click();
  await repair.locator('.wb-advisor-cost,[role="alert"]').first().waitFor({ timeout: 70_000 });
  await repair.getByRole('button', { name: '查看通货顺序' }).waitFor({ timeout: 1000 });
  const costText = await repair.locator('.wb-advisor-cost').first().innerText();
  assert.match(costText, /Ex/);
  assert.match(await repair.innerText(), /超过预算/);
  assert.match(await repair.innerText(), /抽样 P95/);
  check('real Worker computes protected-fracture improvement cost and sampled P95, then judges zero additional budget');

  await page.getByLabel('追加材料预算档位').selectOption('custom');
  await page.getByLabel('追加材料预算', { exact: true }).fill('1000000000');
  assert.match(await repair.innerText(), /可考虑继续制作/);
  const restart = repair.locator('.wb-restart-comparison');
  await restart.locator(':scope > summary').click();
  await restart.getByRole('textbox').fill(finished);
  await restart.getByText('核对／更正实际买价（高级）', { exact: true }).click();
  await restart.getByRole('spinbutton').fill('0');
  await restart.getByRole('button', { name: '计算更换底材成本' }).click();
  await restart.getByText('更换底材的期望追加成本较低', { exact: true }).waitFor({ timeout: 70_000 });
  assert.match(await restart.innerText(), /净期望追加成本：0 Ex/);
  assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('poe2-workbench-v1')).item.prefixes[2].tierDisplay)), 2);
  check('replacement comparison independently solves pasted alternative without changing held gear or treating an unquoted price as free');
  await advisor.screenshot({ path: 'artifacts/workbench/craft-advisor.png' });

  await repair.getByRole('button', { name: '查看通货顺序' }).click();
  await page.locator('.wb-results').waitFor();
  assert.match(await page.locator('.wb-results').innerText(), /后续期望成本/);
  assert(!/\b(?:Exalted|Annulment|removes)\b/.test(await page.locator('.wb-results').innerText()));
  assert(await page.locator('.wb-targets [data-mod-id="Rings/ItemFoundRarityIncrease"]').count() === 1);
  check('adopting an evaluated plan loads its real policy and protected fracture, with Chinese route labels');

  const checkpoint = page.getByRole('region', { name: '制作步骤校验' });
  await checkpoint.getByRole('button', { name: '设置制作锚点' }).click();
  await checkpoint.getByLabel('本步目标类型').selectOption('remove');
  await checkpoint.getByRole('checkbox', { name: /允许移除：.*闪电/ }).check();
  await checkpoint.getByRole('button', { name: '锁定本步目标' }).click();
  await checkpoint.getByLabel('操作后装备文本').fill(afterAnnul);
  await checkpoint.getByRole('button', { name: '校验本步结果' }).click();
  await checkpoint.locator('[data-status="met"]').waitFor();
  assert.equal(await page.locator('.wb-current-mods .wb-mod').count(), 5);
  await checkpoint.screenshot({ path: 'artifacts/workbench/checkpoint-met.png' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('navigation', { name: '工作区域' }).getByRole('button', { name: '制作策略' }).click();
  await page.getByRole('region', { name: '制作步骤校验' }).locator('[data-status="met"]').waitFor();
  check('annul checkpoint verifies the intended removal, updates gear, and persists the frozen objective and result');

  await checkpoint.getByLabel('操作后装备文本').fill('这不是装备文本');
  await checkpoint.getByRole('button', { name: '校验本步结果' }).click();
  await checkpoint.locator('[data-status="unresolved"]').waitFor();
  assert(await checkpoint.getByRole('button', { name: '重新计算后续策略' }).isDisabled());
  assert.equal(await page.locator('.wb-current-mods .wb-mod').count(), 5);
  check('invalid follow-up text clears the previous approval, blocks recalculation, and preserves actual gear');

  const packet = await (await page.request.post(`${baseUrl}/api/workbench/clipboard`, { data: { raw: afterAnnul, mode: 'checkpoint' } })).json();
  assert(packet.ok);
  await expect.poll(async () => (await (await page.request.get(`${baseUrl}/api/workbench/companion-result?id=${packet.id}`)).json()).status,
    { timeout: 20000 }).toBe('ready');
  check('desktop checkpoint packet travels through SSE and receives the verified result');

  const beforePrice = await page.evaluate(() => localStorage.getItem('poe2-workbench-v1'));
  await page.route('**/api/workbench/estimate', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    ok: true, total: 80, fetched: 20, priced: 5, duplicateSellers: 15,
    groups: [{ currency: 'exalted', count: 5, min: 40, max: 100, p25: 55, median: 60, p75: 70 }],
    sampledAt: new Date().toISOString(), cached: false,
    url: 'https://www.pathofexile.com/trade2/search/poe2/Forbidden%20Rites/test-query', warnings: ['回归测试样本；不是真实市场报价。'],
  }) }));
  const pricePacket = await (await page.request.post(`${baseUrl}/api/workbench/clipboard`, { data: { raw, mode: 'trade' } })).json();
  await page.getByRole('region', { name: '装备估价' }).getByText(/55–70/).waitFor();
  await expect.poll(async () => (await (await page.request.get(`${baseUrl}/api/workbench/companion-result?id=${pricePacket.id}`)).json()).status,
    { timeout: 20000 }).toBe('ready');
  const afterPrice = await page.evaluate(() => localStorage.getItem('poe2-workbench-v1'));
  assert.equal(afterPrice, beforePrice);
  await page.getByRole('region', { name: '装备估价' }).screenshot({ path: 'artifacts/workbench/price-estimate.png' });
  check('desktop price packet opens isolated pricing, displays clearly identified sample statistics, and preserves the active craft session');

  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
  await page.getByRole('navigation', { name: '工作区域' }).getByRole('button', { name: '制作策略' }).click();
  assert(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
  assert.deepEqual(errors, []);
  check('guided crafting and price interfaces fit 390px without uncaught browser errors');
  await writeFile('artifacts/workbench/guided-results.json', JSON.stringify({ checks, errors, costText, at: new Date().toISOString() }, null, 2));
} finally { await browser.close(); }
