import { describe, expect, it } from 'vitest';
import { indexPatch } from '../../packages/engine/src/indexPatch';
import { indexPrices } from '../../packages/optimizer/src/cost';
import modsFile from '../../data/patches/0.5.0/mods.json';
import basesFile from '../../data/patches/0.5.0/base_items.json';
import pricesFile from '../../data/patches/0.5.0/prices.json';
import type { Engine, ExistingItem, TargetInput } from '../lib/engine';
import { assessCraftPotential } from './craftPotential';
import { BREACH_RING_SAMPLE } from './fixtures/breachRing';
import { parseWorkbenchItem } from './itemImport';
import { DEFAULT_OPTIONS } from './model';

const engine: Engine = { data: indexPatch(modsFile as never, basesFile as never), prices: indexPrices(pricesFile) };
const parsed = parseWorkbenchItem(engine.data, BREACH_RING_SAMPLE)!;
const breach: ExistingItem = {
  baseId: parsed.baseId!, level: parsed.level!, rarity: 'rare', prefixes: parsed.prefixes, suffixes: parsed.suffixes,
};
const bare: ExistingItem = { baseId: 'Rings', level: 82, rarity: 'normal', prefixes: [], suffixes: [] };
const assess = (item = breach, extra: Partial<Parameters<typeof assessCraftPotential>[0]> = {}) => assessCraftPotential({
  engine, item, baseName: 'Breach Ring', options: DEFAULT_OPTIONS, ...extra,
});

describe('craft potential from the actual held item', () => {
  it('exposes the concrete level-79 ring ceiling instead of calling it an all-T1 crafting base', () => {
    const result = assess();
    expect(result.status).toBe('limited');
    expect(result.replacementLevel).toBe(82);
    expect(result.ceilings.find((row) => row.modId === 'Rings/IncreasedMana')).toMatchObject({ currentTier: 2, bestTier: 1, topRequiredLevel: 75 });
    expect(result.ceilings.find((row) => row.modId === 'Rings/ColdResistance')).toMatchObject({ currentTier: 3, bestTier: 2, topRequiredLevel: 82 });
    const ceiling = result.candidates.find((row) => row.id === 'ceiling')!;
    expect(ceiling.blockReason).toBeUndefined();
    expect(ceiling.targets).toContainEqual({ modId: 'Rings/IncreasedMana', tierDisplay: 1 });
    expect(ceiling.targets).toContainEqual({ modId: 'Rings/ColdResistance', tierDisplay: 2 });
    expect(result.candidates.find((row) => row.id === 't1')?.blockReason).toContain('82');
    expect(result.notes.join(' ')).toContain('六个词缀槽已满');
    expect(result.notes.join(' ')).toContain('品质');
  });

  it('builds a small improvement with every fracture protected and names allowed losses', () => {
    const repair = assess().candidates.find((row) => row.id === 'repair')!;
    expect(repair.targets).toHaveLength(3);
    expect(repair.improvementCount).toBe(1);
    expect(repair.blockReason).toBeUndefined();
    expect(repair.preservedFractureIds).toEqual(['Rings/ItemFoundRarityIncrease']);
    expect(repair.targets).toContainEqual({ modId: 'Rings/ItemFoundRarityIncrease', tierDisplay: 1 });
    expect(repair.droppedCurrentLabels).toHaveLength(3);
    expect(assess().candidates.every((candidate) => candidate.targets.some((target) => target.modId === 'Rings/ItemFoundRarityIncrease'))).toBe(true);
  });

  it('preserves an impossible selected tier and explains the block rather than lowering it', () => {
    const targets: TargetInput[] = [{ modId: 'Rings/ColdResistance', tierDisplay: 1 }];
    const selected = assess(breach, { targets }).candidates.find((row) => row.id === 'selected')!;
    expect(selected.targets).toContainEqual(targets[0]);
    expect(selected.blockReason).toContain('82');
    expect(targets).toEqual([{ modId: 'Rings/ColdResistance', tierDisplay: 1 }]);
  });

  it('does not advertise upgrading a lower-tier fractured modifier', () => {
    const item: ExistingItem = { ...bare, rarity: 'rare', suffixes: [{ modId: 'Rings/ColdResistance', tierDisplay: 3, fractured: true }] };
    const result = assess(item);
    expect(result.ceilings[0]).toMatchObject({ currentTier: 3, bestTier: 3, fractured: true });
    expect(result.ceilings[0]?.reason).toContain('破裂锁定');
    expect(result.candidates.find((row) => row.id === 'repair')).toBeUndefined();
    expect(result.candidates.find((row) => row.id === 't1')?.blockReason).toContain('破裂锁定');
    const selected = assess(item, { targets: [{ modId: 'Rings/ColdResistance', tierDisplay: 1 }] }).candidates[0]!;
    expect(selected.targets).toContainEqual({ modId: 'Rings/ColdResistance', tierDisplay: 1 });
    expect(selected.blockReason).toContain('破裂锁定');
  });

  it('counts non-target fractures against suffix slots before asking the solver', () => {
    const item: ExistingItem = { ...bare, rarity: 'rare', suffixes: [{ modId: 'Rings/ItemFoundRarityIncrease', tierDisplay: 1, fractured: true }] };
    const targets = ['Rings/FireResistance', 'Rings/ColdResistance', 'Rings/LightningResistance'].map((modId) => ({ modId, tierDisplay: 1 }));
    const selected = assess(item, { targets }).candidates.find((row) => row.id === 'selected')!;
    expect(selected.targets).toHaveLength(4);
    expect(selected.blockReason).toContain('最多允许');
  });

  it('rejects a selected same-family competitor of a retained fracture', () => {
    const ordinary = engine.data.mods.get('Rings/ColdResistance')!;
    const sibling = { ...ordinary, id: 'Rings/TestSiblingColdResistance' };
    const category = engine.data.bases.get('Rings')!;
    const synthetic: Engine = { ...engine, data: { ...engine.data,
      mods: new Map([...engine.data.mods, [sibling.id, sibling]]),
      bases: new Map([...engine.data.bases, ['Rings', { ...category, pools: { ...category.pools, normal: { ...category.pools.normal, suffixes: [...category.pools.normal.suffixes, sibling.id] } } }]]),
    } };
    const item: ExistingItem = { ...bare, rarity: 'rare', suffixes: [{ modId: ordinary.id, tierDisplay: 3, fractured: true }] };
    const selected = assess(item, { engine: synthetic, targets: [{ modId: sibling.id, tierDisplay: 1 }] }).candidates[0]!;
    expect(selected.targets.some((target) => target.modId === ordinary.id)).toBe(true);
    expect(selected.blockReason).toContain('互斥');
  });

  it('keeps higher ordinary-Essence goals unreachable on a Rare, even when Essence use is enabled', () => {
    const item: ExistingItem = { ...bare, rarity: 'rare', suffixes: [{ modId: 'Rings/Essence_ColdResistance', tierDisplay: 2 }] };
    const result = assess(item, { options: { ...DEFAULT_OPTIONS, essences: true } });
    expect(result.ceilings[0]).toMatchObject({ bestTier: 2 });
    expect(result.candidates.find((row) => row.id === 't1')?.blockReason).toContain('普通精华');
  });

  it.each(['Dusk Ring', 'Grasping Ring'])('shows visible ceilings but blocks every unsupported %s candidate', (baseName) => {
    const result = assess(breach, { baseName });
    expect(result.status).toBe('blocked');
    expect(result.ceilings).toHaveLength(6);
    expect(result.candidates.every((candidate) => Boolean(candidate.blockReason))).toBe(true);
  });

  it('keeps import or corruption restrictions independent of usable-looking tiers', () => {
    const result = assess(breach, { restriction: '装备已污染，不能继续制作。' });
    expect(result.status).toBe('blocked');
    expect(result.constraints).toContain('装备已污染，不能继续制作。');
    expect(result.candidates.every((candidate) => candidate.blockReason?.includes('已污染'))).toBe(true);
  });

  it('does not invent an arbitrary build for an empty base, but accepts an explicit white-base target', () => {
    expect(assess(bare)).toMatchObject({ status: 'empty', candidates: [], ceilings: [] });
    const targets = [{ modId: 'Rings/IncreasedLife', tierDisplay: 2 }];
    const result = assess(bare, { targets });
    expect(result.status).toBe('open');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ id: 'selected', targets, improvementCount: 1 });
    expect(result.candidates[0]?.blockReason).toBeUndefined();
  });

  it('deduplicates identical targets without hiding a distinct blocked full-T1 option', () => {
    const top: ExistingItem = { ...bare, rarity: 'rare', prefixes: [{ modId: 'Rings/IncreasedMana', tierDisplay: 1 }] };
    const result = assess(top, { targets: [{ modId: 'Rings/IncreasedMana', tierDisplay: 1 }] });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.id).toBe('selected');
    expect(assess().candidates.map((candidate) => candidate.id)).toContain('t1');
  });

  it('does not mutate imported modifiers, targets, or options', () => {
    const before = JSON.stringify({ breach, options: DEFAULT_OPTIONS });
    assess();
    expect(JSON.stringify({ breach, options: DEFAULT_OPTIONS })).toBe(before);
  });
});
