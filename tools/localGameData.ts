import { homedir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { open, realpath, opendir, stat } from 'node:fs/promises';
import type { LocalGameData } from '../src/workbench/gameData';
import { createHash } from 'node:crypto';
import { analyzeBuildPlan } from './buildPlanner';

interface Folder { path: string; label: string }
const folderTail = ['My Games', 'Path of Exile 2'];
function defaultFolders(): Folder[] {
  const oneDrive = [...new Set([process.env.OneDrive, process.env.OneDriveConsumer, join(homedir(), 'OneDrive')].filter((value): value is string => !!value))];
  return [...oneDrive.flatMap((root) => ['文档', 'Documents'].map((name) => ({ path: join(root, name, ...folderTail), label: `OneDrive ${name}` }))),
    ...['Documents', '文档'].map((name) => ({ path: join(homedir(), name, ...folderTail), label: `本机${name}` }))];
}
const inside = (path: string, parent: string) => { const rel = relative(parent, path); return !!rel && !rel.startsWith('..') && !isAbsolute(rel); };
async function readBounded(root: string, name: string, limit: number): Promise<{ text: string; modifiedAt: string } | null> {
  const file = await realpath(join(root, name)).catch(() => null);
  if (!file || !inside(file, root)) return null;
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > limit) return null;
    const buffer = Buffer.alloc(limit + 1); let offset = 0;
    while (offset < buffer.length) {
      const result = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!result.bytesRead) break;
      offset += result.bytesRead;
    }
    return offset > limit ? null : { text: buffer.subarray(0, offset).toString('utf8'), modifiedAt: info.mtime.toISOString() };
  } finally { await handle.close(); }
}
// Only these sections and options leave this reader. Login, cached account data and chat
// are never returned. The API accepts no client-provided path or configuration writes.
export function parseGameConfiguration(text: string): NonNullable<LocalGameData['configuration']> {
  const allowed: Record<string, RegExp> = {
    LANGUAGE: /^language$/, DISPLAY: /^(?:renderer_type|fullscreen|borderless_windowed_fullscreen|resolution_width|resolution_height)$/,
    UI: /^(?:use_wasd_to_move|item_filter)$/, ACTION_KEYS: /^(?:highlight|use_bound_skill\d+)$/, WASD_ACTION_KEYS: /^(?:highlight|use_bound_skill\d+)$/,
  };
  const fields = new Map<string, string>(); let section = '';
  for (const line of text.split(/\r?\n/)) {
    const header = line.trim().match(/^\[([^\]]+)\]$/);
    if (header) { section = header[1]!; continue; }
    if (!Object.prototype.hasOwnProperty.call(allowed, section)) continue;
    const pair = line.match(/^\s*([^=\s]+)\s*=\s*([^\r\n]*)$/);
    if (pair && allowed[section]!.test(pair[1]!)) fields.set(`${section}.${pair[1]}`, pair[2]!.trim().slice(0, 150));
  }
  const get = (key: string) => fields.get(key);
  const size = (key: string) => { const raw = get(key); return raw && /^\d+$/.test(raw) && Number(raw) >= 320 && Number(raw) <= 16384 ? Number(raw) : undefined; };
  const wasd = get('UI.use_wasd_to_move'), controls = wasd === 'true' ? 'wasd' : wasd === 'false' ? 'mouse' : 'unknown';
  const bindings = controls === 'wasd' ? 'WASD_ACTION_KEYS' : 'ACTION_KEYS';
  const eActions = [...fields].filter(([key, value]) => key.startsWith(`${bindings}.use_bound_skill`) && value === '69')
    .map(([key]) => `技能 ${key.match(/\d+$/)![0]}`).slice(0, 20);
  const full = get('DISPLAY.fullscreen'), borderless = get('DISPLAY.borderless_windowed_fullscreen');
  return { language: get('LANGUAGE.language'), renderer: get('DISPLAY.renderer_type'), width: size('DISPLAY.resolution_width'), height: size('DISPLAY.resolution_height'),
    mode: borderless === 'true' ? 'borderless' : full === 'true' ? 'exclusive' : full === 'false' && borderless === 'false' ? 'windowed' : 'unknown',
    controls, activeFilter: get('UI.item_filter'), altHighlight: get(`${bindings}.highlight`) === '18', eActions };
}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const label = (value: unknown): string | undefined => typeof value === 'string' ? [...value].filter((char) => char.charCodeAt(0) >= 32).join('').slice(0, 150) : undefined;
export function createLocalGameDataService(folders: readonly Folder[] = defaultFolders()) {
  const plans = new Map<string, { root: string; name: string }>();
  async function summary(): Promise<LocalGameData> {
    plans.clear();
    const result: LocalGameData = { found: false, plans: [], savedTradeSearchFile: false, warnings: [] };
    for (const folder of folders) {
      const root = await realpath(resolve(folder.path)).catch(() => null); if (!root) continue;
      let config;
      try { config = await readBounded(root, 'poe2_production_Config.ini', 128_000); }
      catch { result.warnings.push('游戏配置暂时无法读取，请关闭配置编辑器后重试。'); continue; }
      if (!config) continue;
      result.found = true; result.location = folder.label;
      result.configuration = parseGameConfiguration(config.text);
      const plannerRoot = await realpath(join(root, 'BuildPlanner')).catch(() => null);
      if (plannerRoot && inside(plannerRoot, root)) {
        try {
          const directory = await opendir(plannerRoot); let examined = 0;
          for await (const entry of directory) {
            if (++examined > 200 || result.plans.length >= 20) { result.warnings.push('规划文件较多，本次最多读取 20 份摘要。'); break; }
            if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith('.build')) continue;
            try {
              const file = await readBounded(plannerRoot, entry.name, 512_000);
              if (!file) { result.warnings.push(`${entry.name.slice(0, 150)}：文件过大或不可读取。`); continue; }
              const plan: unknown = JSON.parse(file.text);
              if (!record(plan) || !Array.isArray(plan.passives) || !Array.isArray(plan.skills)) continue;
              const id = createHash('sha256').update(`${folder.label}/${entry.name}`).digest('hex');
              plans.set(id, { root: plannerRoot, name: entry.name });
              result.plans.push({ id, fileName: entry.name.slice(0, 150), name: label(plan.name) ?? entry.name.slice(0, 150), author: label(plan.author),
                ascendancy: label(plan.ascendancy), passiveCount: plan.passives.length, skillCount: plan.skills.length, modifiedAt: file.modifiedAt });
            } catch { result.warnings.push(`${entry.name.slice(0, 150)}：规划格式无法读取。`); }
          }
        } catch { result.warnings.push('BuildPlanner 目录暂时无法读取。'); }
      }
      const search = await realpath(join(root, 'ETrade', 'search_query_save.json')).catch(() => null);
      result.savedTradeSearchFile = !!search && inside(search, root) && await stat(search).then((info) => info.isFile()).catch(() => false);
      return result;
    }
    return result;
  }
  async function readPlan(id: string, level: number, weaponSet: number) {
    if (!/^[a-f0-9]{64}$/.test(id)) return null;
    const selected = plans.get(id); if (!selected) return null;
    // Resolve the previously listed root again: moving/replacing a directory must
    // not turn an old opaque ID into access to another directory.
    const root = await realpath(selected.root).catch(() => null);
    if (!root || relative(selected.root, root) !== '') return null;
    try {
      const file = await readBounded(root, selected.name, 512_000); if (!file) return null;
      return analyzeBuildPlan(JSON.parse(file.text), { fileName: selected.name.slice(0, 150), modifiedAt: file.modifiedAt }, level, weaponSet);
    } catch { return null; }
  }
  return { summary, readPlan };
}
