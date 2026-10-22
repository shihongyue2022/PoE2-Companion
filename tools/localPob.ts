import { createHash } from 'node:crypto';
import { readdir, realpath, stat, open } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join, basename } from 'node:path';
import { spawn } from 'node:child_process';

const MAX_XML = 3_000_000;
export const LOCAL_POB_FOLDER = '.local-tools/pob2-v0.23.1';
export class LocalPobError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export interface LocalPobBuild { id: string; name: string; modifiedAt: string; size: number }
export function createLocalPobService(project = process.cwd()) {
  const install = resolve(project, LOCAL_POB_FOLDER);
  const root = join(install, 'Builds');
  const executable = join(install, 'Path of Building-PoE2.exe');
  const files = new Map<string, string>();
  const inside = (path: string, parent: string) => { const rel = relative(parent, path); return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel); };
  async function installed() { try { return (await stat(executable)).isFile(); } catch { return false; } }
  async function checkedRoot() {
    try {
      const real = await realpath(root);
      // A redirected Builds directory must never expose unrelated personal files.
      if (relative(resolve(root), resolve(real)) !== '') throw new LocalPobError(403, 'PoB2 Builds 目录不能重定向到其他位置。');
      return real;
    } catch (error) {
      if (error instanceof LocalPobError) throw error;
      return null;
    }
  }
  async function list() {
    const builds: LocalPobBuild[] = [];
    const real = await checkedRoot();
    const next = new Map<string, string>();
    let examined = 0;
    async function scan(directory: string, depth: number): Promise<void> {
      if (depth > 4 || builds.length >= 100 || examined >= 1000) return;
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (++examined > 1000 || builds.length >= 100) break;
        if (entry.isSymbolicLink()) continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) { await scan(path, depth + 1); continue; }
        if (!entry.isFile() || !/\.xml$/i.test(entry.name)) continue;
        const resolved = await realpath(path);
        if (!inside(resolved, real!)) continue;
        const info = await stat(resolved);
        if (info.size > MAX_XML || !info.isFile()) continue;
        const name = relative(real!, resolved).split('\\').join('/');
        const id = createHash('sha256').update(name).digest('hex');
        next.set(id, resolved);
        builds.push({ id, name, modifiedAt: info.mtime.toISOString(), size: info.size });
      }
    }
    if (real) await scan(real, 0);
    files.clear(); for (const [id, path] of next) files.set(id, path);
    return { installed: await installed(), builds: builds.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)) };
  }
  async function read(id: unknown) {
    if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id) || !files.has(id)) throw new LocalPobError(404, '请先刷新列表，再选择一个已保存的 PoB2 角色。');
    const rootPath = await checkedRoot();
    if (!rootPath) throw new LocalPobError(404, '本机 PoB2 角色目录不存在。');
    const path = await realpath(files.get(id)!).catch(() => null);
    if (!path || !inside(path, rootPath)) throw new LocalPobError(404, '角色文件已移动，请刷新列表。');
    const handle = await open(path, 'r');
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > MAX_XML) throw new LocalPobError(413, 'PoB2 角色文件超过 3 MB 限制。');
      const buffer = Buffer.alloc(MAX_XML + 1); let length = 0;
      while (length < buffer.length) {
        const result = await handle.read(buffer, length, buffer.length - length, length);
        if (!result.bytesRead) break;
        length += result.bytesRead;
      }
      if (length > MAX_XML) throw new LocalPobError(413, 'PoB2 角色文件超过 3 MB 限制。');
      const xml = buffer.subarray(0, length).toString('utf8');
      if (!/<PathOfBuilding2(?:\s|>)/.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new LocalPobError(400, '所选文件不是可支持的 PoB2 角色文件。');
      return { xml, name: basename(path), modifiedAt: info.mtime.toISOString() };
    } finally { await handle.close(); }
  }
  async function launch() {
    if (!await installed()) throw new LocalPobError(404, '请先双击 start-pob2.cmd 配置官方 PoB2 便携版。');
    await new Promise<void>((done, fail) => {
      const child = spawn(executable, [], { cwd: install, detached: true, stdio: 'ignore', shell: false });
      child.once('error', () => fail(new LocalPobError(500, '无法打开 PoB2，请双击 start-pob2.cmd。')));
      child.once('spawn', () => { child.unref(); done(); });
    });
  }
  return { list, read, launch };
}
