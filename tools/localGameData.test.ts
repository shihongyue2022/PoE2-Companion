import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { createLocalGameDataService, parseGameConfiguration } from './localGameData';
import { createWorkbenchBridge } from './workbenchServer';

let temporary = '';
afterEach(async () => {
  if (temporary && resolve(temporary).startsWith(resolve(tmpdir(), 'workbench-game-test-'))) await rm(temporary, { recursive: true, force: true });
  temporary = '';
});
const config = `[LANGUAGE]\nlanguage=zh-TW\n[DISPLAY]\nfullscreen=true\nborderless_windowed_fullscreen=false\nresolution_width=2560\nresolution_height=1440\n[LOGIN]\npassword=MUST_NOT_LEAK\n[UI]\nuse_wasd_to_move=false\nitem_filter=filter-1\n[ACTION_KEYS]\nhighlight=18\nuse_bound_skill6=69\nuse_bound_skill9=69 2\n`;
describe('local game directory summary', () => {
  it('uses an allowlist of configuration fields and the active control scheme', () => {
    const parsed = parseGameConfiguration(config);
    expect(parsed).toMatchObject({ language: 'zh-TW', mode: 'exclusive', width: 2560, height: 1440, controls: 'mouse', altHighlight: true, eActions: ['技能 6'] });
    expect(JSON.stringify(parsed)).not.toContain('MUST_NOT_LEAK');
    expect(parseGameConfiguration(config.replace('resolution_width=2560', 'resolution_width=999999999')).width).toBeUndefined();
    expect(parseGameConfiguration(config.replace('borderless_windowed_fullscreen=false', 'borderless_windowed_fullscreen=true')).mode).toBe('borderless');
    expect(parseGameConfiguration('[constructor]\npassword=private').mode).toBe('unknown');
  });
  it('returns bounded planning metadata, skips redirected files and keeps equipment/log data out', async () => {
    temporary = await mkdtemp(join(tmpdir(), 'workbench-game-test-'));
    const root = join(temporary, 'game'); await mkdir(join(root, 'BuildPlanner'), { recursive: true });
    await writeFile(join(root, 'poe2_production_Config.ini'), config);
    await writeFile(join(root, 'BuildPlanner', 'Example.build'), JSON.stringify({ name: 'Example', author: 'poe.ninja', ascendancy: 'Mercenary3', passives: [1, 2], skills: [3], equipment: 'PRIVATE_GEAR' }));
    await writeFile(join(root, 'BuildPlanner', 'Large.build'), 'x'.repeat(512_001));
    await writeFile(join(root, 'Client.txt'), 'PRIVATE_CHAT');
    const service = createLocalGameDataService([{ path: root, label: '测试文档' }]);
    const result = await service.summary();
    expect(result).toMatchObject({ found: true, location: '测试文档', plans: [{ fileName: 'Example.build', name: 'Example', passiveCount: 2, skillCount: 1 }] });
    expect(result.warnings.join()).toContain('Large.build');
    expect(JSON.stringify(result)).not.toMatch(/MUST_NOT_LEAK|PRIVATE_GEAR|PRIVATE_CHAT/);
    const outside = join(temporary, 'outside.ini'); await writeFile(outside, config);
    await rm(join(root, 'poe2_production_Config.ini'));
    try { await symlink(outside, join(root, 'poe2_production_Config.ini')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EPERM') return; throw error; }
    expect((await service.summary()).found).toBe(false);
  });
  it('returns not found for missing configuration and protects the read-only API from other origins', async () => {
    expect((await createLocalGameDataService([{ path: join(tmpdir(), 'missing-poe2-game-config'), label: '测试' }]).summary()).found).toBe(false);
    const localGameData = { summary: vi.fn().mockResolvedValue({ found: false, plans: [], warnings: [], savedTradeSearchFile: false }), readPlan: vi.fn().mockResolvedValue(null) };
    const bridge = createWorkbenchBridge({ localGameData });
    const server = createServer((request, response) => { void bridge.handle(request, response); });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    try {
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing server address');
      const url = `http://127.0.0.1:${address.port}/api/workbench/game-data`;
      expect((await fetch(url, { headers: { Origin: 'https://example.com' } })).status).toBe(403);
      expect(localGameData.summary).not.toHaveBeenCalled();
      expect((await fetch(url, { method: 'POST' })).status).toBe(404);
      expect((await fetch(url)).status).toBe(200); expect(localGameData.summary).toHaveBeenCalledTimes(1);
    } finally { bridge.close(); await new Promise<void>((done) => server.close(() => done())); }
  });
});
