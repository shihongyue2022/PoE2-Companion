// Derived vocabulary only; never execute installed PoB Lua or read account settings.
import { readFile, writeFile } from 'node:fs/promises';
const base = new URL('../../src/workbench/data/', import.meta.url);
const data = JSON.parse(await readFile(new URL('build-planner-index.json', base), 'utf8'));
const gems = Object.fromEntries(Object.entries(data.skills).map(([id, gem]) => [id,
  [gem.name, gem.label, gem.tags.includes('support'), gem.tags, gem.weapon ?? '']]));
await writeFile(new URL('pob-gem-index.json', base), JSON.stringify({ source: data.source, gems }) + '\n');
console.log(`Generated ${Object.keys(gems).length} PoB gem definitions`);
