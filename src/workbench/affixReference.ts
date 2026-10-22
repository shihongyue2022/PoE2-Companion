import { matchEquipmentStat, type Equipment } from './genericEquipment';
import type { EquipmentTradeRow } from './genericEquipmentTrade';
import type { AffixReferenceResult } from '../../tools/affixReference';
import { englishPoe2dbUrl } from './poe2dbReference';

export type { AffixReferenceResult };
const cache = new Map<string, { at: number; result: AffixReferenceResult }>();
export function englishReferenceName(item: Equipment): string | undefined {
  return item.rarity === 'unique' ? item.nameEnglish ?? item.baseNameEnglish : item.baseNameEnglish;
}
export function cachedAffixReference(item: Equipment): AffixReferenceResult | undefined {
  const entry = cache.get(englishReferenceName(item) ?? '');
  return entry && Date.now() - entry.at < 6 * 60 * 60_000 ? { ...entry.result, cached: true } : undefined;
}
export async function readAffixReference(item: Equipment, signal: AbortSignal): Promise<AffixReferenceResult> {
  const name = englishReferenceName(item);
  if (!name || /[\u3400-\u9fff]/u.test(name)) throw new Error('需先识别英文底座或传奇名称，暂不使用中文猜测检索。');
  const cached = cachedAffixReference(item); if (cached) return cached;
  const response = await fetch('/api/workbench/affix-reference', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  const data: unknown = await response.json();
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  const expected = englishPoe2dbUrl(name);
  if (!object(data)) throw new Error('英文词缀资料格式不正确，未采用。');
  if (!response.ok || data.ok !== true) throw new Error(object(data.error) && typeof data.error.message === 'string' ? data.error.message : '英文词缀资料暂不可用。');
  if (data.name !== name || data.url !== expected || typeof data.checkedAt !== 'string' || !Number.isFinite(Date.parse(data.checkedAt))
    || !Array.isArray(data.modifiers) || data.modifiers.length > 100) throw new Error('英文词缀资料格式不正确，未采用。');
  const modifiers: AffixReferenceResult['modifiers'] = [];
  for (const entry of data.modifiers as unknown[]) {
    if (!object(entry) || typeof entry.english !== 'string' || entry.english.length > 2000 || /[\u3400-\u9fff]/u.test(entry.english)
      || entry.origin !== 'implicit' && entry.origin !== 'explicit') throw new Error('英文词缀资料格式不正确，未采用。');
    modifiers.push({ english: entry.english, origin: entry.origin });
  }
  const result: AffixReferenceResult = { name, url: expected, checkedAt: data.checkedAt, cached: !!data.cached,
    modifiers };
  if (cache.size >= 64) cache.delete(cache.keys().next().value!);
  cache.set(name, { at: Date.now(), result }); return result;
}

export function referenceStat(entry: AffixReferenceResult['modifiers'][number]) {
  // Range endpoints are probes for matching grammar ONLY, never the worn item's rolls.
  const probe = entry.english.replace(/\(([+-]?\d+(?:\.\d+)?)\s*[—–-]\s*[+-]?\d+(?:\.\d+)?\)/g, '$1');
  return matchEquipmentStat(`${probe}${entry.origin === 'implicit' ? ' (implicit)' : ''}`);
}
export function referenceLabel(entry: AffixReferenceResult['modifiers'][number]): string {
  const mod = referenceStat(entry);
  if (!mod.recognized) return '暂未匹配本地中文词缀资料';
  const tokens = entry.english.match(/[+-]?\([+-]?\d+(?:\.\d+)?\s*[—–-]\s*[+-]?\d+(?:\.\d+)?\)|[+-]?\d+(?:\.\d+)?/g) ?? [];
  if (!tokens.some((token) => token.includes('(')) || (mod.label.match(/[+-]?\d+(?:\.\d+)?/g)?.length ?? 0) !== tokens.length) return mod.label;
  let position = 0;
  return mod.label.replace(/[+-]?\d+(?:\.\d+)?/g, () => tokens[position++]!.replace(/[()]/g, ''));
}
export function mergeReferenceRows(rows: EquipmentTradeRow[], reference?: AffixReferenceResult): EquipmentTradeRow[] {
  if (!reference) return rows;
  const ids = new Set(rows.flatMap((row) => row.ids.map((id) => id.split('.').pop())));
  const additions = reference.modifiers.flatMap((entry) => {
    const mod = referenceStat(entry);
    if (!mod.searchable || mod.ids.some((id) => ids.has(id.split('.').pop()))) return [];
    for (const id of mod.ids) ids.add(id.split('.').pop());
    return [{ key: `wiki:${mod.ref}:${entry.origin}`, label: referenceLabel(entry), ids: mod.ids, enabled: false, min: '', max: '',
      presenceOnly: true, referenceOnly: true, warning: '英文资料参考：不代表当前装备实际拥有；勾选后仅要求效果存在，不采用资料范围作为你的实际数值。' }];
  });
  return [...rows, ...additions];
}
