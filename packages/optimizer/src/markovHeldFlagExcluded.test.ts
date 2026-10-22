import { describe, expect, it } from 'vitest';
import { loadShippedPatch } from '../../engine/src/loadPatch';
import type { ItemState } from '../../engine/src/types';
import pricesFile from '../../../data/patches/0.5.0/prices.json';
import { indexPrices } from './cost';
import { boneRole, markovFromItem } from './markovFromItem';

const data = loadShippedPatch('data/patches/0.5.0');
const prices = indexPrices(pricesFile);
const base = data.bases.get('Rings')!;
const placed = (modId: string, display: number) => {
  const mod = data.mods.get(modId)!;
  return { modId, tierName: mod.tiers[mod.tiers.length - display]!.name };
};
// The actual advanced-copy ring: level 79, Lightning placed by a bone, T1 rarity fractured.
const ring: ItemState = {
  base, level: 79, rarity: 'rare',
  prefixes: [placed('Rings/FireDamage', 1), { ...placed('Rings/LightningDamage', 1), desecrated: true }, placed('Rings/IncreasedMana', 2)],
  suffixes: [{ ...placed('Rings/ItemFoundRarityIncrease', 1), fractured: true }, placed('Rings/AllResistances', 1), placed('Rings/ColdResistance', 3)],
};
const targets = ['Rings/IncreasedMana', 'Rings/AllResistances', 'Rings/ItemFoundRarityIncrease']
  .map((modId) => ({ modId, minTierIndex: data.mods.get(modId)!.tiers.length - 1 }));
const excluded = new Set([
  ...Object.keys(prices.currency).filter((key) => /essence|alloy|^desecrate/i.test(key)),
  ...Object.keys(prices.omens),
]);
const policy = { excluded };

describe('a held desecration flag with new bones excluded', () => {
  it('retains the existing flag axis without enabling a desired but unavailable new desecration', () => {
    expect(boneRole(data, prices, ring, targets, policy)).toBe('required');
    const empty: ItemState = { ...ring, prefixes: [], suffixes: [] };
    expect(boneRole(data, prices, empty, targets, policy)).toBeUndefined();
    const desiredCarved = [{ modId: base.pools.desecrated.prefixes[0]!, minTierIndex: 0 }];
    expect(boneRole(data, prices, empty, desiredCarved, policy)).toBeUndefined();
  });

  it('finishes the real ring with the same cost as the flag-free control and never plays a new bone', () => {
    const options = { solver: 'policy' as const, policy, spare: { prefixes: 2, suffixes: 1 }, keepRoutes: true, maxMillis: 15_000 };
    const marked = markovFromItem(data, prices, ring, targets, options);
    expect(marked.feasible, marked.reason).toBe(true);
    expect(marked.bound).toBe('exact');
    expect(Number.isFinite(marked.expectedCost)).toBe(true);
    expect(marked.nodes.some((node) => node.isStart)).toBe(true);
    expect([...marked.policy.values()].some((action) => action.currency === 'desecrate')).toBe(false);
    const unmarked: ItemState = { ...ring, prefixes: ring.prefixes.map((entry) => ({ ...entry, desecrated: false })) };
    const control = markovFromItem(data, prices, unmarked, targets, options);
    expect(control).toMatchObject({ feasible: true, bound: 'exact' });
    expect(marked.expectedCost).toBeCloseTo(control.expectedCost, 5);
  }, 35_000);
});
