// Display vocabulary only. Never supplies trade IDs or numeric crafting rules.
// Inputs are the pinned EE2 files downloaded by equipment_index.mjs (MIT).
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../../', import.meta.url);
const read = async (path) => readFile(new URL(path, root), 'utf8');
const lines = (text) => text.trim().split('\n').map(JSON.parse);
const index = JSON.parse(await read('src/workbench/data/equipment-index.json'));
const refs = new Set(index.stats.map((stat) => stat.ref));
const chinese = new Map(lines(await read('artifacts/ee2-cmn-Hant-stats.ndjson')).map((stat) => [stat.ref, stat]));
const stats = lines(await read('artifacts/ee2-stats.ndjson')).filter((stat) => !refs.has(stat.ref)).flatMap((stat) => {
  const translated = chinese.get(stat.ref);
  if (!translated?.matchers?.length) return [];
  return [{ english: stat.matchers, chinese: translated.matchers }];
});
const path = new URL('src/workbench/data/equipment-display.json', root);
await writeFile(path, JSON.stringify({ source: 'Exiled Exchange 2 (MIT), display-only matchers without official trade mappings', ee2Commit: index.ee2Commit, stats }));
console.log(`Wrote ${stats.length} display-only translations to ${fileURLToPath(path)}`);
