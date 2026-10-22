// Read data only: never execute the portable application's Lua files.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const pob = '.local-tools/pob2-v0.23.1/';
const raw = await read('artifacts/buildplanner-passives-source.json');
const hash = createHash('sha1').update(`blob ${Buffer.byteLength(raw)}\0`).update(raw).digest('hex');
if (hash !== '6693a00f0e883381193f54d893fef0f2e0137760') throw new Error('Passive mapping revision changed; review the new data before regenerating.');
const tree = JSON.parse(await read(`${pob}TreeData/0_5/tree.json`));
const repoe = JSON.parse(raw);
const vocabulary = JSON.parse(await read('src/workbench/data/equipment-index.json'));
const simplify = (value) => [...value].map((char) => vocabulary.simplify[char] ?? char).join('');
const translations = new Map((await read('artifacts/ee2-cmn-Hant-items.ndjson')).trim().split('\n').map(JSON.parse)
  .filter((entry) => entry.namespace === 'GEM').map((entry) => [entry.refName, simplify(entry.name)]));
const chineseStats = new Map((await read('artifacts/ee2-cmn-Hant-stats.ndjson')).trim().split('\n').map(JSON.parse).map((entry) => [entry.ref, entry]));
for (const stat of (await read('artifacts/ee2-stats.ndjson')).trim().split('\n').map(JSON.parse)) {
  const name = /^Grants Skill: (?:Level # )?(.+)$/.exec(stat.ref)?.[1];
  const translated = chineseStats.get(stat.ref)?.matchers?.find((matcher) => /^賦予技能[:：]/.test(matcher.string))?.string;
  if (name && translated) {
    const label = simplify(translated.replace(/^賦予技能[:：]\s*(?:等級\s*#\s*)?/, ''));
    if (!label.includes('#') && !translations.has(name)) translations.set(name, label);
  }
}
// Descriptive label for the built-in weapon attack (not a purchasable gem).
translations.set('Spear Stab', '长矛普通攻击');
const nodes = Object.fromEntries(Object.values(repoe.passives).map((node) => {
  const reference = tree.nodes[node.hash];
  return [node.id, { name: node.name, stats: node.stats, text: reference?.name === node.name ? reference.stats : [],
    ...(node.is_keystone ? { keystone: true } : {}), ...(node.is_notable ? { notable: true } : {}) }];
}));
const gems = await read(`${pob}Data/Gems.lua`);
const skills = {};
for (const match of gems.matchAll(/^\t\["(Metadata\/Items\/Gems?\/[^"\n]+)"\] = \{([\s\S]*?)^\t\},/gm)) {
  const [, id, body] = match;
  const name = /\bname = "([^"\n]+)"/.exec(body)?.[1]; if (!name) continue;
  const gameId = /\bgameId = "([^"\n]+)"/.exec(body)?.[1] ?? id;
  const tags = [...(/\btags = \{([\s\S]*?)\t\t\}/.exec(body)?.[1] ?? '').matchAll(/(\w+) = true/g)].map((entry) => entry[1]);
  const legacyName = gameId.split('/').pop().replace(/^(?:Skill|Support)Gem/, '').replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/ Three$/, ' III').replace(/ Two$/, ' II');
  const entry = { name, label: translations.get(name) ?? translations.get(legacyName) ?? name, tags, weapon: /weaponRequirements = "([^"\n]+)"/.exec(body)?.[1] };
  skills[gameId] = entry;
  if (!skills[id]) skills[id] = entry;
}
// Some exported builds use Gem/ for an ID that is spelled Gems/ by PoB. Only
// provide an alias when the complete leaf ID uniquely identifies one record.
const leaves = new Map();
for (const [id, skill] of Object.entries(skills)) { const leaf = id.split('/').pop(); const values = leaves.get(leaf) ?? []; if (!values.includes(skill)) values.push(skill); leaves.set(leaf, values); }
const aliases = Object.fromEntries([...leaves].filter(([, values]) => values.length === 1).map(([leaf, values]) => [leaf, values[0]]));
const output = { source: { passiveUrl: 'https://github.com/repoe-fork/poe2/blob/master/data/passive_skill_trees/Default.json', passiveBlob: hash,
  pobTag: 'v0.23.1', tree: '0_5', ee2Commit: vocabulary.ee2Commit, copyright: 'Game data (c) Grinding Gear Games; PoB data code MIT; EE2 vocabulary MIT' }, nodes, skills, aliases };
await writeFile(new URL('../../src/workbench/data/build-planner-index.json', import.meta.url), JSON.stringify(output));
const license = (await read(`${pob}LICENSE.md`)).split('PUC-Rio Lua interpreter')[0];
await writeFile(new URL('../../src/workbench/data/LICENSE-PATH-OF-BUILDING.txt', import.meta.url), license);
console.log(`Wrote ${Object.keys(nodes).length} passive IDs and ${Object.keys(skills).length} gem IDs`);
