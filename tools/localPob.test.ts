import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createLocalPobService, LOCAL_POB_FOLDER } from './localPob';
import { createWorkbenchBridge } from './workbenchServer';

const roots: string[] = [];
const cleanups: (() => void)[] = [];
const xml = '<PathOfBuilding2><Items><Item id="1">Rarity: RARE\nTest Ring\nGold Ring</Item><ItemSet id="1"><Slot name="Ring 1" itemId="1" /></ItemSet></Items></PathOfBuilding2>';
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'poe2-pob-test-')); roots.push(root);
  return root;
}
afterEach(async () => {
  for (const close of cleanups.splice(0)) close();
  for (const root of roots.splice(0)) {
    const rel = relative(resolve(tmpdir()), resolve(root));
    if (rel.startsWith('poe2-pob-test-') && !rel.includes('..') && !isAbsolute(rel)) await rm(root, { recursive: true, force: true });
  }
});
describe('local saved PoB2 builds', () => {
  it('only exposes bounded saved build XML, not settings, account tokens or arbitrary paths', async () => {
    const root = await workspace(); const folder = join(root, LOCAL_POB_FOLDER);
    await mkdir(join(folder, 'Builds', 'Current'), { recursive: true });
    await writeFile(join(folder, 'Settings.xml'), '<Settings>PRIVATE FIXTURE</Settings>');
    await writeFile(join(folder, 'Builds', 'Current', 'Character.xml'), xml);
    await writeFile(join(folder, 'Builds', 'notes.txt'), 'not a build');
    const service = createLocalPobService(root);
    const listed = await service.list();
    expect(listed.installed).toBe(false); expect(listed.builds).toHaveLength(1);
    expect(listed.builds[0]!.name).toBe('Current/Character.xml');
    expect(JSON.stringify(listed)).not.toContain(root);
    expect(await service.read(listed.builds[0]!.id)).toMatchObject({ xml, name: 'Character.xml' });
    await expect(service.read('../Settings.xml')).rejects.toMatchObject({ status: 404 });
    await expect(service.read('a'.repeat(64))).rejects.toMatchObject({ status: 404 });
  });
  it('rejects oversized, removed, non-PoB and external-entity files without changing them', async () => {
    const root = await workspace(); const folder = join(root, LOCAL_POB_FOLDER, 'Builds');
    await mkdir(folder, { recursive: true });
    const path = join(folder, 'Character.xml'); await writeFile(path, xml);
    const service = createLocalPobService(root); const first = (await service.list()).builds[0]!;
    await writeFile(path, 'x'.repeat(3_000_001));
    await expect(service.read(first.id)).rejects.toMatchObject({ status: 413 });
    expect((await service.list()).builds).toHaveLength(0);
    await writeFile(path, '<Settings />'); const second = (await service.list()).builds[0]!;
    await expect(service.read(second.id)).rejects.toMatchObject({ status: 400 });
    await writeFile(path, '<!DOCTYPE x><PathOfBuilding2/>');
    await expect(service.read(second.id)).rejects.toMatchObject({ status: 400 });
    await rm(path);
    await expect(service.read(second.id)).rejects.toMatchObject({ status: 404 });
  });
  it('provides clear empty setup status and never launches an uninstalled application', async () => {
    const service = createLocalPobService(await workspace());
    expect(await service.list()).toEqual({ installed: false, builds: [] });
    await expect(service.launch()).rejects.toMatchObject({ status: 404 });
  });
  it('protects local file and launch routes with loopback/origin and JSON checks', async () => {
    const localPob = { list: vi.fn(async () => ({ installed: true, builds: [] })), read: vi.fn(async () => ({ xml })), launch: vi.fn(async () => {}) };
    const bridge = createWorkbenchBridge({ localPob });
    const server = createServer((request, response) => { void bridge.handle(request, response); });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    cleanups.push(() => { bridge.close(); server.closeAllConnections(); server.close(); });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/workbench/pob`;
    expect((await fetch(`${base}/builds`)).status).toBe(200);
    expect((await fetch(`${base}/builds`, { headers: { Origin: 'https://unrelated.test' } })).status).toBe(403);
    expect((await fetch(`${base}/launch`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status).toBe(415);
    expect(localPob.launch).not.toHaveBeenCalled();
    const posted = await fetch(`${base}/build`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'selected' }) });
    expect(await posted.json()).toEqual({ ok: true, xml });
    expect(localPob.read).toHaveBeenCalledWith('selected');
  });
});
