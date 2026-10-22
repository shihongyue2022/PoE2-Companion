import equipmentIndex from '../src/workbench/data/equipment-index.json';
import tradeItems from '../src/workbench/data/trade-item-index.json';
import { englishPoe2dbUrl } from '../src/workbench/poe2dbReference';

const names = new Set([...equipmentIndex.items, ...tradeItems.items].map((item) => item.en));
const LIMIT = 2_000_000;
export class AffixReferenceError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export interface AffixReferenceResult {
  name: string; url: string; checkedAt: string; cached: boolean;
  modifiers: { english: string; origin: 'implicit' | 'explicit' }[];
}
const plain = (html: string) => html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
  .replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|nbsp|lt|gt|ndash|mdash);/gi, (_, entity: string) => {
    if (entity.startsWith('#')) {
      const value = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '';
    }
    return ({ amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>', ndash: '–', mdash: '—' } as Record<string, string>)[entity.toLowerCase()] ?? '';
  }).split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
const normalizeName = (text: string) => text.toLowerCase().replace(/[\s’']/g, '');

/** Read only the first item popup, never lore, scripts, related items or history. */
export function parseEnglishAffixPage(html: string, expectedName: string): AffixReferenceResult['modifiers'] {
  if (html.length > LIMIT) throw new AffixReferenceError(502, '词缀资料页面过大。');
  const start = /<div\b[^>]*class=["'][^"']*\bnewItemPopup\b[^"']*["'][^>]*>/i.exec(html);
  if (!start) throw new AffixReferenceError(502, '未找到英文物品资料，未添加词缀。');
  const tags = /<\/?div\b[^>]*>/gi; tags.lastIndex = start.index;
  let depth = 0, end = -1;
  for (let tag = tags.exec(html); tag; tag = tags.exec(html)) {
    depth += tag[0].startsWith('</') ? -1 : 1;
    if (depth === 0) { end = tags.lastIndex; break; }
  }
  if (end < 0) throw new AffixReferenceError(502, '物品资料结构不完整。');
  const popup = html.slice(start.index, end);
  const title = /<div\b[^>]*class=["'][^"']*\bitemName\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(popup)?.[1];
  if (!title || normalizeName(plain(title)) !== normalizeName(expectedName)) throw new AffixReferenceError(502, '英文资料名称与当前物品不一致，未采用。');
  const modifiers: AffixReferenceResult['modifiers'] = [];
  for (const match of popup.matchAll(/<div\b[^>]*class=["'](implicitMod|explicitMod)["'][^>]*>([\s\S]*?)<\/div>/gi)) {
    const english = plain(match[2]!);
    if (!english || english.length > 2000 || /[\u3400-\u9fff]/u.test(english) || Array.from(english).some((char) => char.charCodeAt(0) < 9)) continue;
    modifiers.push({ english, origin: match[1] === 'implicitMod' ? 'implicit' : 'explicit' });
    if (modifiers.length > 100) throw new AffixReferenceError(502, '物品词缀数量异常。');
  }
  if (!modifiers.length) throw new AffixReferenceError(502, '当前英文页面没有可读取的词缀。可打开资料页人工核对。');
  return modifiers;
}

export function createAffixReferenceService(options: { fetch?: typeof fetch; now?: () => number } = {}) {
  const request = options.fetch ?? fetch, now = options.now ?? Date.now;
  const cache = new Map<string, { at: number; result: AffixReferenceResult }>();
  const inflight = new Map<string, Promise<AffixReferenceResult>>();
  return async (input: unknown): Promise<AffixReferenceResult> => {
    if (!input || typeof input !== 'object' || !('name' in input) || typeof input.name !== 'string'
      || !names.has(input.name) || /[\u3400-\u9fff]/u.test(input.name)) throw new AffixReferenceError(400, '需要已识别的原生英文物品名称。');
    const name = input.name;
    const cached = cache.get(name);
    if (cached && now() - cached.at < 6 * 60 * 60_000) return { ...cached.result, cached: true };
    if (inflight.has(name)) return inflight.get(name)!;
    if (inflight.size >= 4) throw new AffixReferenceError(429, '正在补查其他词缀资料，请稍候重试。');
    const task = (async () => {
      const url = englishPoe2dbUrl(name);
      try {
        const response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(12_000), headers: { Accept: 'text/html' } });
        if (!response.ok) throw new AffixReferenceError(502, `英文词缀资料暂时不可用（HTTP ${response.status}）。`);
        if (!/text\/html/i.test(response.headers.get('content-type') ?? '') || Number(response.headers.get('content-length')) > LIMIT) throw new AffixReferenceError(502, '英文资料响应格式不正确。');
        const reader = response.body?.getReader();
        if (!reader) throw new AffixReferenceError(502, '英文资料内容为空。');
        const chunks: Uint8Array[] = []; let size = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read(); if (done) break;
            size += value.byteLength; if (size > LIMIT) throw new AffixReferenceError(502, '英文资料超过大小限制。');
            chunks.push(value);
          }
        } finally { await reader.cancel().catch(() => undefined); }
        const html = Buffer.concat(chunks).toString('utf8');
        const result = { name, url, checkedAt: new Date(now()).toISOString(), cached: false, modifiers: parseEnglishAffixPage(html, name) };
        if (cache.size >= 64) cache.delete(cache.keys().next().value!);
        cache.set(name, { at: now(), result }); return result;
      } catch (reason) {
        if (reason instanceof AffixReferenceError) throw reason;
        throw new AffixReferenceError(502, '无法读取英文词缀资料；现有装备和检索条件保持不变。');
      }
    })();
    inflight.set(name, task);
    try { return await task; } finally { inflight.delete(name); }
  };
}
