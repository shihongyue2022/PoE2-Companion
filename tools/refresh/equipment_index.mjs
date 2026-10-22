#!/usr/bin/env node
// Independent of the crafting engine. Rebuild: node tools/refresh/equipment_index.mjs
// Uses pinned MIT EE2 vocabulary and current official trade metadata; inputs stay in ignored artifacts/.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const commit = '572c1925e4737d2c5f79143d03280df9660c1d8f';
const sources = {
  'currency-source-items.ndjson': `https://raw.githubusercontent.com/Kvan7/Exiled-Exchange-2/${commit}/renderer/public/data/en/items.ndjson`,
  'ee2-stats.ndjson': `https://raw.githubusercontent.com/Kvan7/Exiled-Exchange-2/${commit}/renderer/public/data/en/stats.ndjson`,
  'ee2-cmn-Hant-items.ndjson': `https://raw.githubusercontent.com/Kvan7/Exiled-Exchange-2/${commit}/renderer/public/data/cmn-Hant/items.ndjson`,
  'ee2-cmn-Hant-stats.ndjson': `https://raw.githubusercontent.com/Kvan7/Exiled-Exchange-2/${commit}/renderer/public/data/cmn-Hant/stats.ndjson`,
  'equipment-official-filters.json': 'https://www.pathofexile.com/api/trade2/data/filters',
  'equipment-official-stats.json': 'https://www.pathofexile.com/api/trade2/data/stats',
  'opencc-tschars.txt': 'https://raw.githubusercontent.com/BYVoid/OpenCC/ver.1.1.9/data/dictionary/TSCharacters.txt',
};
async function input(name) {
  const path = resolve(root, 'artifacts', name);
  if (!process.argv.includes('--refresh')) {
    try { return await readFile(path, 'utf8'); } catch { /* download below */ }
  }
  const response = await fetch(sources[name]);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const text = await response.text();
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, text);
  return text;
}
const files = Object.fromEntries(await Promise.all(Object.keys(sources).map(async (name) => [name, await input(name)])));
const ndjson = (name) => files[name].trim().split('\n').map((line) => JSON.parse(line));
const categoryMap = {
  'Amulet': 'accessory.amulet', 'Ring': 'accessory.ring', 'Belt': 'accessory.belt',
  'Body Armour': 'armour.chest', 'Helmet': 'armour.helmet', 'Gloves': 'armour.gloves', 'Boots': 'armour.boots',
  'Shield': 'armour.shield', 'Buckler': 'armour.buckler', 'Focus': 'armour.focus', 'Quiver': 'armour.quiver',
  'Bow': 'weapon.bow', 'Crossbow': 'weapon.crossbow', 'One Hand Mace': 'weapon.onemace', 'Two Hand Mace': 'weapon.twomace',
  'One Hand Axe': 'weapon.oneaxe', 'Two Hand Axe': 'weapon.twoaxe', 'One Hand Sword': 'weapon.onesword', 'Two Hand Sword': 'weapon.twosword',
  'Dagger': 'weapon.dagger', 'Claw': 'weapon.claw', 'Flail': 'weapon.flail', 'Warstaff': 'weapon.warstaff',
  'Spear': 'weapon.spear', 'Staff': 'weapon.staff', 'Wand': 'weapon.wand', 'Sceptre': 'weapon.sceptre', 'Talisman': 'weapon.talisman',
  'Jewel': 'jewel', 'Flask': 'flask', 'Charm': 'flask.charm', 'Relic': 'sanctum.relic',
};
const officialCategories = new Set(JSON.parse(files['equipment-official-filters.json']).result.flatMap((g) => g.filters ?? [])
  .find((f) => f.id === 'category').option.options.map((o) => o.id).filter(Boolean));
for (const id of Object.values(categoryMap)) if (!officialCategories.has(id)) throw new Error(`Invalid category ${id}`);
const officialIds = new Set(JSON.parse(files['equipment-official-stats.json']).result.flatMap((g) => g.entries.map((e) => e.id)));
const enItems = ndjson('currency-source-items.ndjson');
const cnItems = new Map(ndjson('ee2-cmn-Hant-items.ndjson').map((i) => [`${i.namespace}:${i.refName}`, i]));
const bases = new Map(enItems.filter((i) => i.namespace === 'ITEM').map((i) => [i.refName, i]));
const items = enItems.filter((i) => typeof i.refName === 'string' && categoryMap[i.craftable?.category ?? bases.get(i.unique?.base)?.craftable?.category]).map((i) => {
  let category = categoryMap[i.craftable?.category ?? bases.get(i.unique?.base)?.craftable?.category];
  const base = i.unique?.base ?? i.refName;
  if (category === 'flask') category = /Life Flask/.test(base) ? 'flask.life' : /Mana Flask/.test(base) ? 'flask.mana' : category;
  const cn = cnItems.get(`${i.namespace}:${i.refName}`);
  return { en: i.refName, zh: cn?.name ?? i.name ?? i.refName, category, ...(i.unique ? { base } : {}),
    ...(i.icon?.startsWith('https://web.poecdn.com/') ? { icon: i.icon } : {}) };
});
const cnStats = new Map(ndjson('ee2-cmn-Hant-stats.ndjson').map((s) => [s.ref, s]));
const kinds = ['explicit', 'implicit', 'fractured', 'crafted', 'enchant', 'rune', 'desecrated', 'sanctum', 'skill'];
const stats = ndjson('ee2-stats.ndjson').flatMap((s) => {
  const ids = Object.fromEntries(kinds.map((k) => [k, (s.trade?.ids?.[k] ?? []).filter((id) => officialIds.has(id))]).filter(([, values]) => values.length));
  if (!Object.keys(ids).length) return [];
  return [{ ref: s.ref, ...(s.id ? { id: s.id } : {}),
    matchers: [...(s.matchers ?? []), ...(cnStats.get(s.ref)?.matchers ?? [])], ids }];
});
const simplify = {};
for (const line of files['opencc-tschars.txt'].split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const [traditional, alternatives] = line.split('\t');
  if (traditional && alternatives) simplify[traditional] = alternatives.split(' ')[0];
}
const output = { version: 1, ee2Commit: commit, officialMetadataDate: '2026-10-22', categories: [...new Set(items.map((i) => i.category))].sort(), simplify, items, stats };
const destination = resolve(root, 'src/workbench/data/equipment-index.json');
await writeFile(destination, JSON.stringify(output));
console.log(`Equipment index: ${items.length} items, ${stats.length} stats; ${destination}`);
