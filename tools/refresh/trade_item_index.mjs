#!/usr/bin/env node
// All official non-equipment types; localized names come from the pinned MIT EE2 snapshot.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const officialDate = '2026-10-22';
async function official(kind) {
  const file = resolve(root, `artifacts/all-items-official-${kind}.json`);
  if (!process.argv.includes('--refresh')) try { return JSON.parse(await readFile(file, 'utf8')); } catch { /* fetch below */ }
  const response = await fetch(`https://www.pathofexile.com/api/trade2/data/${kind}`, { headers: { 'User-Agent': 'PoE2-Craft-Workbench/1.0 (local personal item comparison)' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${kind}: HTTP ${response.status}`);
  const value = await response.json(); await writeFile(file, JSON.stringify(value)); return value;
}
const [types, filters, enText, zhText] = await Promise.all([
  official('items'), official('filters'), readFile(resolve(root, 'artifacts/currency-source-items.ndjson'), 'utf8'), readFile(resolve(root, 'artifacts/ee2-cmn-Hant-items.ndjson'), 'utf8'),
]);
const rows = (text) => text.trim().split('\n').map(JSON.parse);
const en = new Map(rows(enText).map((row) => [`${row.namespace}:${row.refName}`, row]));
const zh = new Map(rows(zhText).map((row) => [`${row.namespace}:${row.refName}`, row]));
const categories = filters.result.flatMap((group) => group.filters).find((filter) => filter.id === 'category').option.options.map((option) => option.id).filter(Boolean);
const fields = Object.fromEntries(filters.result.map((group) => [group.id, group.filters.map((filter) => filter.id)]));
function category(group, item, source) {
  const name = item.type;
  if (group === 'gem') return ({ 'Active Skill Gem': 'gem.activegem', 'Support Skill Gem': 'gem.supportgem', MetaSkillGem: 'gem.metagem' })[source?.craftable?.category] ?? 'gem';
  if (group === 'map') {
    if (/^Waystone \(Tier /.test(name)) return 'map.waystone';
    if (/Tablet$/.test(name)) return 'map.tablet';
    if (/Barya$/.test(name)) return 'map.barya';
    if (name === 'Inscribed Ultimatum') return 'map.ultimatum';
    if (name === 'Expedition Logbook') return 'map.logbook';
    if (name === 'Breachstone') return 'map.breachstone';
    return ({ PinnacleKey: 'map.bosskey', MapFragment: 'map.fragment' })[source?.craftable?.category] ?? 'map';
  }
  if (group === 'currency') {
    if (source?.tags?.includes('rune')) return 'currency.rune';
    if (source?.tags?.includes('soul_core')) return 'currency.soulcore';
    if (source?.craftable?.category === 'SoulCore') return 'currency.socketable';
    if (source?.craftable?.category === 'Omen') return 'currency.omen';
    return 'currency';
  }
  return ''; // Official Wombgifts have no category filter: exact type only.
}
const items = types.result.filter((group) => ['map', 'gem', 'currency', 'wombgift'].includes(group.id)).flatMap((group) => group.entries.map((item) => {
  const namespace = item.name ? 'UNIQUE' : group.id === 'gem' && !/^Uncut /.test(item.type) ? 'GEM' : 'ITEM';
  const key = `${namespace}:${item.name ?? item.type}`;
  const source = en.get(key), translated = zh.get(key);
  const id = category(group.id, item, source);
  if (id && !categories.includes(id)) throw new Error(`Unknown official category ${id}`);
  return { en: item.name ?? item.type, zh: translated?.name ?? item.name ?? item.type, category: id, group: group.id,
    ...(item.name ? { base: item.type } : {}), ...(source?.map?.tier ? { mapTier: source.map.tier } : {}),
    ...(source?.icon?.startsWith('https://web.poecdn.com/') ? { icon: source.icon } : {}) };
}));
await writeFile(resolve(root, 'src/workbench/data/trade-item-index.json'), JSON.stringify({ version: 1, officialDate,
  source: 'https://www.pathofexile.com/api/trade2/data/items', filtersSource: 'https://www.pathofexile.com/api/trade2/data/filters',
  ee2Commit: '572c1925e4737d2c5f79143d03280df9660c1d8f', categories, fields, items }));
console.log(`Trade item index: ${items.length} non-equipment entries, ${categories.length} official categories`);
