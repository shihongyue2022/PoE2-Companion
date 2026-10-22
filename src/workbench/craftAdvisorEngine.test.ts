import { describe, expect, it } from 'vitest';
import { indexPatch } from '../../packages/engine/src/indexPatch';
import { indexPrices } from '../../packages/optimizer/src/cost';
import modsFile from '../../data/patches/0.5.0/mods.json';
import basesFile from '../../data/patches/0.5.0/base_items.json';
import pricesFile from '../../data/patches/0.5.0/prices.json';
import { listMods, type ExistingItem } from '../lib/engine';
import { runSolve } from '../lib/solve';
import { assessCraftPotential } from './craftPotential';
import { BREACH_RING_SAMPLE } from './fixtures/breachRing';
import { parseWorkbenchItem } from './itemImport';
import { DEFAULT_OPTIONS, makeSolveRequest } from './model';

const engine = { data: indexPatch(modsFile as never, basesFile as never), prices: indexPrices(pricesFile) };
const parsed = parseWorkbenchItem(engine.data, BREACH_RING_SAMPLE)!;
const ring: ExistingItem = { baseId: 'Rings', level: parsed.level!, rarity: 'rare', prefixes: parsed.prefixes, suffixes: parsed.suffixes };
const list = listMods(engine.data, 'Rings');
const mods = new Map([...list.prefixes, ...list.suffixes].map((mod) => [mod.id, mod]));

describe('real from-item advisor solve with an existing desecrated modifier', () => {
  it('can repair the supplied fractured ring with bones excluded instead of losing its initial flagged state', () => {
    const candidate = assessCraftPotential({ engine, item: ring, baseName: 'Breach Ring', options: DEFAULT_OPTIONS })
      .candidates.find((entry) => entry.id === 'repair')!;
    expect(candidate.blockReason).toBeUndefined();
    expect(candidate.targets).toContainEqual({ modId: 'Rings/IncreasedMana', tierDisplay: 1 });
    const request = makeSolveRequest(engine, ring, candidate.targets, mods, DEFAULT_OPTIONS, 15_000, 0, false);
    expect(request.excluded).toContain('desecrate');
    expect(request.excluded).toContain('desecrate_ancient');
    expect(ring.prefixes.some((entry) => entry.desecrated)).toBe(true);
    const result = runSolve(engine, request);
    expect(result.markov.feasible, result.markov.reason).toBe(true);
    expect(Number.isFinite(result.markov.expectedCost)).toBe(true);
    expect(result.markov.nodes.some((node) => node.isStart)).toBe(true);
  }, 30_000);
});
