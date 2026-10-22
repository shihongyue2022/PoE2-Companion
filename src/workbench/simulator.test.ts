import { describe, expect, it } from 'vitest';
import type { ItemBase, Mod, PatchData } from '../../packages/engine/src/types.ts';
import type { Engine, ExistingItem } from '../lib/engine.ts';
import { getCraftActions, simulateCraft } from './simulator.ts';

function fixture(): Engine {
  const mods: Mod[] = [
    ...['P1', 'P2', 'P3'].map((id): Mod => ({
      id, type: 'prefix', family: id, source: 'normal', tags: [], text: id,
      tiers: [
        { name: `${id} Low`, ilvl: 1, weight: 100, ranges: [[1, 5]] },
        { name: `${id} High`, ilvl: 60, weight: 300, ranges: [[6, 10]] },
      ],
    })),
    ...['S1', 'S2', 'S3'].map((id): Mod => ({
      id, type: 'suffix', family: id, source: 'normal', tags: [], text: id,
      tiers: [{ name: id, ilvl: 1, weight: 200, ranges: [[1, 5]] }],
    })),
  ];
  const base: ItemBase = {
    id: 'Rings', name: 'Ring', category: 'Rings', pools: {
      normal: { prefixes: ['P1', 'P2', 'P3'], suffixes: ['S1', 'S2', 'S3'] },
      essence: { prefixes: [], suffixes: [] }, desecrated: { prefixes: [], suffixes: [] },
    },
  };
  const data: PatchData = { patch: 'test', mods: new Map(mods.map((mod) => [mod.id, mod])), bases: new Map([[base.id, base]]) };
  return { data, prices: { currency: { transmute: 0.1, augment: 0.1, regal: 0.5, exalt: 1, annul: 2, chaos: 3, alchemy: 0.2, transmute_perfect: 4, exalt_greater: 5 }, omens: {} } };
}

const white = (): ExistingItem => ({ baseId: 'Rings', level: 80, rarity: 'normal', prefixes: [], suffixes: [] });
const mod = (modId: string, tierDisplay = 1) => ({ modId, tierDisplay });
const action = (engine: Engine, item: ExistingItem, id: string) => getCraftActions(engine, item).find((entry) => entry.id === id)!;

describe('manual crafting simulator', () => {
  it('transmutes a white item using tier weights, retaining its base and level without mutating input', () => {
    const engine = fixture();
    const item = white();
    const result = simulateCraft(engine, item, 'transmute', () => 0.1);
    expect(result.item).toEqual({ ...item, rarity: 'magic', prefixes: [mod('P1')], suffixes: [] });
    expect(result.probability).toBeCloseTo(300 / 1800);
    expect(result.cost).toBe(0.1);
    expect(item).toEqual(white());
  });

  it('excludes tiers above item level and enforces each currency strength floor', () => {
    const engine = fixture();
    const low = { ...white(), level: 10 };
    const result = simulateCraft(engine, low, 'transmute', () => 0);
    expect(result.item.prefixes).toEqual([mod('P1', 2)]);
    expect(action(engine, white(), 'transmute_perfect').feasible).toBe(false);
    expect(action(engine, { ...white(), rarity: 'rare' }, 'exalt_greater').feasible).toBe(true);
    const high = simulateCraft(engine, { ...white(), rarity: 'rare' }, 'exalt_greater', () => 0.9);
    expect(high.item.prefixes).toEqual([mod('P3')]);
    expect(high.item.suffixes).toHaveLength(0);
    expect(high.cost).toBe(5);
  });

  it('augmentation respects the magic one-prefix one-suffix limit, while regal can add another prefix', () => {
    const engine = fixture();
    const item: ExistingItem = { ...white(), rarity: 'magic', prefixes: [mod('P1')] };
    expect(simulateCraft(engine, item, 'augment', () => 0).item.suffixes).toEqual([mod('S1')]);
    const regal = simulateCraft(engine, item, 'regal', () => 0);
    expect(regal.item.prefixes).toEqual([mod('P1'), mod('P2', 2)]);
    expect(regal.item.rarity).toBe('rare');
    const full: ExistingItem = { ...item, suffixes: [mod('S1')] };
    expect(action(engine, full, 'augment').feasible).toBe(false);
  });

  it('annul removes a random removable affix and protects fractured affixes', () => {
    const engine = fixture();
    const item: ExistingItem = {
      ...white(), rarity: 'rare', prefixes: [{ ...mod('P1'), fractured: true }, mod('P2')], suffixes: [mod('S1')],
    };
    const result = simulateCraft(engine, item, 'annul', () => 0);
    expect(result.item.prefixes).toEqual([{ ...mod('P1'), fractured: true }]);
    expect(result.item.suffixes).toEqual([mod('S1')]);
    expect(result.removed).toEqual([mod('P2')]);
    expect(result.probability).toBe(0.5);
    expect(item.prefixes).toHaveLength(2);
    expect(action(engine, { ...item, prefixes: [{ ...mod('P1'), fractured: true }], suffixes: [] }, 'annul').feasible).toBe(false);
  });

  it('chaos swaps only one modifier and preserves fractured modifiers, even on a full item', () => {
    const engine = fixture();
    const item: ExistingItem = {
      ...white(), rarity: 'rare', prefixes: [{ ...mod('P1'), fractured: true }, mod('P2'), mod('P3')],
      suffixes: [mod('S1'), mod('S2'), mod('S3')],
    };
    expect(action(engine, item, 'exalt').feasible).toBe(false);
    const result = simulateCraft(engine, item, 'chaos', () => 0);
    expect(result.removed).toEqual([mod('P2')]);
    expect(result.added).toEqual([mod('P2', 2)]);
    expect(result.item.prefixes).toContainEqual({ ...mod('P1'), fractured: true });
    expect(result.item.prefixes.length + result.item.suffixes.length).toBe(6);
  });

  it('alchemy rolls four mutually compatible affixes without exceeding side limits', () => {
    const engine = fixture();
    const result = simulateCraft(engine, white(), 'alchemy', () => 0);
    expect(result.item.rarity).toBe('rare');
    expect(result.item.prefixes).toHaveLength(3);
    expect(result.item.suffixes).toHaveLength(1);
    expect(new Set([...result.item.prefixes, ...result.item.suffixes].map((entry) => entry.modId)).size).toBe(4);
    expect(result.probabilityKind).toBe('sampled-path');
  });

  it('returns explanatory legality results and rejects corrupted or malformed inputs', () => {
    const engine = fixture();
    expect(action(engine, white(), 'exalt').reason).toContain('稀有');
    expect(() => simulateCraft(engine, white(), 'chaos')).toThrow('稀有');
    const corrupted = { ...white(), corrupted: true };
    expect(getCraftActions(engine, corrupted).every((entry) => !entry.feasible)).toBe(true);
    expect(() => simulateCraft(engine, corrupted, 'alchemy')).toThrow('腐化');
    expect(() => simulateCraft(engine, { ...white(), rarity: 'magic', prefixes: [mod('P1', 0)] }, 'regal')).toThrow('阶级');
    expect(() => simulateCraft(engine, { ...white(), prefixes: [mod('P1')] }, 'transmute')).toThrow('槽位');
    expect(() => simulateCraft(engine, white(), 'unknown')).toThrow('不支持');
    expect(() => simulateCraft(engine, white(), 'transmute', () => 1)).toThrow('随机数');
  });

  it('does not treat absent currency prices as a free craft or placeholder weights as verified', () => {
    const engine = fixture();
    const withoutPrice = { ...engine, prices: { currency: {}, omens: {} } };
    expect(simulateCraft(withoutPrice, white(), 'transmute', () => 0).priceKnown).toBe(false);
    const mods = new Map([...engine.data.mods].map(([id, entry]) => [id, { ...entry, tiers: entry.tiers.map((tier) => ({ ...tier, weight: 1 })) }]));
    const assumed = { ...engine, data: { ...engine.data, mods } };
    expect(simulateCraft(assumed, white(), 'transmute', () => 0).assumedOdds).toBe(true);
  });

  it('rejects multiple crafted affixes even when they belong to different families', () => {
    const engine = fixture();
    const essence: Mod = { ...engine.data.mods.get('P1')!, id: 'Essence', family: 'CraftedLife', source: 'essence' };
    const perfect: Mod = { ...engine.data.mods.get('S1')!, id: 'Perfect', family: 'CraftedResistance', source: 'perfect_essence' };
    const base = engine.data.bases.get('Rings')!;
    const withCrafted: Engine = {
      ...engine,
      data: {
        ...engine.data,
        mods: new Map([...engine.data.mods, [essence.id, essence], [perfect.id, perfect]]),
        bases: new Map([['Rings', { ...base, pools: { ...base.pools, essence: { prefixes: [essence.id], suffixes: [perfect.id] } } }]]),
      },
    };
    const item: ExistingItem = { ...white(), rarity: 'rare', prefixes: [mod('Essence')], suffixes: [mod('Perfect')] };
    expect(getCraftActions(withCrafted, item).every((entry) => !entry.feasible)).toBe(true);
    expect(() => simulateCraft(withCrafted, item, 'exalt')).toThrow('最多允许 1 条');
    const raised: Engine = {
      ...withCrafted,
      data: { ...withCrafted.data, bases: new Map([['Rings', { ...withCrafted.data.bases.get('Rings')!, limits: { prefixes: 3, suffixes: 3, crafted: 2 } }]]) },
    };
    expect(action(raised, item, 'exalt').feasible).toBe(true);
  });

  it('rejects off-pool current affixes and accepts legitimate essence and desecrated pool affixes', () => {
    const engine = fixture();
    const base = engine.data.bases.get('Rings')!;
    const offPool: Mod = { ...engine.data.mods.get('P1')!, id: 'OffPool', family: 'OffPool' };
    const essence: Mod = { ...engine.data.mods.get('P1')!, id: 'Essence', family: 'CraftedLife', source: 'essence' };
    const desecrated: Mod = { ...engine.data.mods.get('S1')!, id: 'Desecrated', family: 'DesecratedResistance', source: 'desecrated' };
    const snapshot: Engine = {
      ...engine,
      data: {
        ...engine.data,
        mods: new Map([...engine.data.mods, [offPool.id, offPool], [essence.id, essence], [desecrated.id, desecrated]]),
        bases: new Map([['Rings', { ...base, pools: {
          ...base.pools, essence: { prefixes: [essence.id], suffixes: [] },
          desecrated: { prefixes: [], suffixes: [desecrated.id] },
        } }]]),
      },
    };
    const item: ExistingItem = { ...white(), rarity: 'rare', prefixes: [mod('OffPool')] };
    expect(() => simulateCraft(snapshot, item, 'annul')).toThrow('不属于');
    expect(getCraftActions(snapshot, item).every((entry) => !entry.feasible)).toBe(true);
    const special: ExistingItem = { ...item, prefixes: [mod('Essence')], suffixes: [mod('Desecrated')] };
    expect(action(snapshot, special, 'annul').feasible).toBe(true);
    const result = simulateCraft(snapshot, special, 'annul', () => 0);
    expect(result.item.suffixes).toEqual([mod('Desecrated')]);
  });
});
