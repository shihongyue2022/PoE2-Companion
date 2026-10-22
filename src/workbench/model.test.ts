import { describe, expect, it } from 'vitest';
import { indexPatch } from '../../packages/engine/src/indexPatch';
import { indexPrices } from '../../packages/optimizer/src/cost';
import modsFile from '../../data/patches/0.5.0/mods.json';
import basesFile from '../../data/patches/0.5.0/base_items.json';
import pricesFile from '../../data/patches/0.5.0/prices.json';
import { listDesecrated, listMods, listPerfectEssences, type ExistingItem } from '../lib/engine';
import { DEFAULT_OPTIONS, excludedCurrencies, makeSolveRequest, regularAlternative, targetAvailability, validateCraft, withProtectedFractures } from './model';
import { parseWorkbenchItem } from './itemImport';
import { BREACH_RING_SAMPLE } from './fixtures/breachRing';

const engine = { data: indexPatch(modsFile as never, basesFile as never), prices: indexPrices(pricesFile) };
const list = listMods(engine.data, 'Rings');
const modMap = new Map([...list.prefixes, ...list.suffixes, ...listPerfectEssences(engine.data, 'Rings'), ...listDesecrated(engine.data, 'Rings')]
  .map((mod) => [mod.id, mod]));
const bare: ExistingItem = { baseId: 'Rings', level: 82, rarity: 'normal', prefixes: [], suffixes: [] };
const goals = [{ modId: 'Rings/IncreasedLife', tierDisplay: 3 }, { modId: 'Rings/FireResistance', tierDisplay: 3 }];

describe('workbench planner contract', () => {
  it('leaves unspecified slots free instead of demanding an unnaturally clean item', () => {
    const request = makeSolveRequest(engine, bare, goals, modMap, DEFAULT_OPTIONS, 5_000, 12, true);
    expect(request.kind).toBe('lab');
    expect(request.spare).toEqual({ prefixes: 2, suffixes: 2 });
    expect(request.kind === 'lab' && request.baseCost).toBe(12);
    expect(request.playOut).toBe(true);
  });
  it('never silently grants a held item a free restart', () => {
    const request = makeSolveRequest(engine, { ...bare, rarity: 'rare', prefixes: [goals[0]!] }, goals, modMap, DEFAULT_OPTIONS, 5_000, 12, false);
    expect(request.kind).toBe('item');
    expect('baseCost' in request).toBe(false);
  });
  it('rejects mutually exclusive targets and unavailable tiers', () => {
    expect(validateCraft(bare, [goals[0]!, goals[0]!], modMap)).toContain('互斥');
    expect(validateCraft({ ...bare, level: 1 }, [{ modId: goals[0]!.modId, tierDisplay: 1 }], modMap)).toContain('等级不足');
  });
  it('checks input rarity and slot counts', () => {
    expect(validateCraft({ ...bare, prefixes: [goals[0]!] }, goals, modMap)).toContain('普通装备');
    expect(validateCraft({ ...bare, rarity: 'magic', prefixes: [goals[0]!, { modId: 'Rings/IncreasedMana', tierDisplay: 3 }] }, goals, modMap)).toContain('最多');
  });
  it('routes around omitted mechanics rather than offering their materials', () => {
    const excluded = excludedCurrencies(engine, { strengths: false, omens: false, essences: false, desecration: false });
    expect(excluded).toContain('exalt_perfect');
    expect(excluded).toContain('desecrate');
    expect(excluded).toContain(Object.keys(engine.prices.omens)[0]);
    expect(excluded).not.toContain('exalt');
    expect(excluded.some((key) => key.startsWith('essence:'))).toBe(true);
  });
});

describe('target availability from an existing item', () => {
  const rare: ExistingItem = { ...bare, rarity: 'rare' };
  const enabled = { ...DEFAULT_OPTIONS, essences: true, desecration: true };
  const essence = modMap.get('Rings/Essence_ColdResistance')!;
  const regular = modMap.get('Rings/ColdResistance')!;

  it('rejects the screenshot’s ordinary-Essence cold resistance on a Rare before solving', () => {
    const target = { modId: essence.id, tierDisplay: 1 };
    const availability = targetAvailability(rare, essence, 1, enabled);
    expect(availability.allowed).toBe(false);
    expect(availability.kind).toBe('unreachable');
    expect(availability.reason).toContain('普通精华只能用于魔法');
    expect(validateCraft(rare, [target], modMap, enabled)).toBe(availability.reason);
    expect(() => makeSolveRequest(engine, rare, [target], modMap, enabled, 5_000, 0, false))
      .toThrow('当前装备已是稀有');
    expect(targetAvailability(rare, regular, 3, DEFAULT_OPTIONS).allowed).toBe(true);
  });

  it.each(['normal', 'magic'] as const)('allows planning an Essence target from %s when enabled', (rarity) => {
    const item = { ...bare, rarity };
    const target = { modId: essence.id, tierDisplay: 1 };
    expect(targetAvailability(item, essence, 1, enabled)).toEqual({ allowed: true });
    expect(validateCraft(item, [target], modMap, enabled)).toBeNull();
    expect(targetAvailability(item, essence, 1, DEFAULT_OPTIONS)).toMatchObject({ allowed: false, kind: 'disabled' });
  });

  it('keeps an already-satisfied Essence target even with Essence use disabled', () => {
    const item = { ...rare, suffixes: [{ modId: essence.id, tierDisplay: 2 }] };
    expect(targetAvailability(item, essence, 2, DEFAULT_OPTIONS)).toEqual({ allowed: true });
    expect(targetAvailability(item, essence, 3, DEFAULT_OPTIONS)).toEqual({ allowed: true });
    expect(validateCraft(item, [{ modId: essence.id, tierDisplay: 2 }], modMap, DEFAULT_OPTIONS)).toBeNull();
    expect(targetAvailability(item, essence, 1, enabled)).toMatchObject({ allowed: false, kind: 'unreachable' });
  });

  it.each(['perfect', 'alloy', 'desecrated'] as const)('requires an enabled source only for an unmet %s target', (source) => {
    const mod = [...modMap.values()].find((entry) => entry.source === source)!;
    expect(mod).toBeDefined();
    const tier = mod.tiers.find((entry) => entry.ilvl <= rare.level)!;
    expect(tier).toBeDefined();
    expect(targetAvailability(rare, mod, tier.display, DEFAULT_OPTIONS)).toMatchObject({ allowed: false, kind: 'disabled' });
    expect(targetAvailability(rare, mod, tier.display, enabled)).toEqual({ allowed: true });
    const held = { ...rare, [mod.type === 'prefix' ? 'prefixes' : 'suffixes']: [{ modId: mod.id, tierDisplay: tier.display }] };
    expect(targetAvailability(held, mod, tier.display, DEFAULT_OPTIONS)).toEqual({ allowed: true });
  });

  it('never treats a fractured lower tier as upgradeable', () => {
    const held = { ...rare, suffixes: [{ modId: regular.id, tierDisplay: 3, fractured: true }] };
    expect(targetAvailability(held, regular, 1, enabled)).toMatchObject({ allowed: false, kind: 'unreachable' });
    expect(validateCraft(held, [{ modId: regular.id, tierDisplay: 1 }], modMap, enabled)).toContain('破裂锁定');
    expect(validateCraft(held, [{ modId: regular.id, tierDisplay: 3 }], modMap, enabled)).toBeNull();
    // Same statistical family, different source: a rolled mod and an Essence mod can coexist.
    const essenceHeld = { ...rare, suffixes: [{ modId: essence.id, tierDisplay: 2, fractured: true }] };
    expect(validateCraft(essenceHeld, [{ modId: regular.id, tierDisplay: 3 }], modMap, enabled)).toBeNull();
  });

  it('does not offer a same-family target that requires removing another fractured modifier', () => {
    const sibling = { ...regular, id: 'Rings/TestSiblingColdResistance' };
    const mods = new Map([...modMap, [sibling.id, sibling]]);
    const held = { ...rare, suffixes: [{ modId: regular.id, tierDisplay: 3, fractured: true }] };
    expect(validateCraft(held, [{ modId: sibling.id, tierDisplay: 3 }], mods, enabled)).toContain('已破裂锁定的词缀互斥');
  });

  it('suggests a unique ordinary counterpart without changing the source or inventing a tier mapping', () => {
    expect(regularAlternative(essence, modMap)?.id).toBe(regular.id);
    expect(regularAlternative(regular, modMap)).toBeUndefined();
    const sameFamily = { ...regular, id: 'Rings/OtherColdResistance' };
    expect(regularAlternative(essence, new Map([...modMap, [sameFamily.id, sameFamily]]))).toBeUndefined();
    expect(essence.source).toBe('essence');
    expect(essence.tiers).toHaveLength(3);
  });
});

describe('mandatory protection for held fractured modifiers', () => {
  const fracture = { modId: 'Rings/ColdResistance', tierDisplay: 3, fractured: true };
  const held: ExistingItem = { ...bare, rarity: 'rare', suffixes: [fracture] };

  it('protects the real imported Breach Ring rarity while upgrading only mana', () => {
    const imported = parseWorkbenchItem(engine.data, BREACH_RING_SAMPLE)!;
    const item: ExistingItem = {
      baseId: imported.baseId!, level: imported.level!, rarity: 'rare',
      prefixes: imported.prefixes, suffixes: imported.suffixes,
    };
    const selected = [{ modId: 'Rings/IncreasedMana', tierDisplay: 1 }];
    const request = makeSolveRequest(engine, item, selected, modMap, DEFAULT_OPTIONS, 5_000, 0, false);
    expect(request.kind).toBe('item');
    expect(request.targets).toEqual([
      { modId: 'Rings/IncreasedMana', tierDisplay: 1 },
      { modId: 'Rings/ItemFoundRarityIncrease', tierDisplay: 1 },
    ]);
    expect(request.spare).toEqual({ prefixes: 2, suffixes: 2 });
    expect(selected).toEqual([{ modId: 'Rings/IncreasedMana', tierDisplay: 1 }]);
    expect(item.suffixes[0]).toMatchObject({ modId: 'Rings/ItemFoundRarityIncrease', fractured: true });
  });

  it('counts unselected fractures against available slots without requiring nonlocked junk', () => {
    const targets = [
      { modId: 'Rings/Strength', tierDisplay: 3 },
      { modId: 'Rings/Dexterity', tierDisplay: 3 },
    ];
    const request = makeSolveRequest(engine, held, targets, modMap, DEFAULT_OPTIONS, 5_000, 0, false);
    expect(request.targets).toHaveLength(3);
    expect(request.spare).toEqual({ prefixes: 3, suffixes: 0 });
    expect(validateCraft(held, [...targets, { modId: 'Rings/Intelligence', tierDisplay: 3 }], modMap))
      .toContain('每侧最多允许 3 条');
  });

  it('preserves a requested higher-tier fracture goal so validation rejects the impossible upgrade', () => {
    const requested = [{ modId: fracture.modId, tierDisplay: 1 }];
    expect(withProtectedFractures(held, requested)).toEqual(requested);
    expect(validateCraft(held, requested, modMap)).toContain('破裂锁定');
    expect(() => makeSolveRequest(engine, held, requested, modMap, DEFAULT_OPTIONS, 5_000, 0, false))
      .toThrow('破裂锁定');
  });

  it('deduplicates an explicitly selected fracture without changing its requested tier', () => {
    const requested = [{ modId: fracture.modId, tierDisplay: 5 }];
    expect(withProtectedFractures(held, requested)).toEqual(requested);
    expect(validateCraft(held, requested, modMap)).toBeNull();
    const request = makeSolveRequest(engine, held, requested, modMap, DEFAULT_OPTIONS, 5_000, 0, false);
    expect(request.targets).toHaveLength(1);
    expect(request.targets[0]?.tierDisplay).toBe(5);
    expect(request.spare).toEqual({ prefixes: 3, suffixes: 2 });
  });

  it('still requires the player to choose a goal when the item only contributes protected fractures', () => {
    expect(withProtectedFractures(held, [])).toEqual([{ modId: fracture.modId, tierDisplay: 3 }]);
    expect(validateCraft(held, [], modMap)).toContain('至少一个目标');
    expect(() => makeSolveRequest(engine, held, [], modMap, DEFAULT_OPTIONS, 5_000, 0, false))
      .toThrow('至少一个目标');
  });

  it('keeps frozen input lists unchanged when adding prefix and suffix anchors', () => {
    const item: ExistingItem = {
      ...held, prefixes: Object.freeze([{ modId: 'Rings/IncreasedLife', tierDisplay: 3, fractured: true }]),
      suffixes: Object.freeze([Object.freeze({ ...fracture })]),
    };
    const requested = Object.freeze([Object.freeze({ modId: 'Rings/IncreasedMana', tierDisplay: 3 })]);
    expect(withProtectedFractures(item, requested)).toEqual([
      { modId: 'Rings/IncreasedMana', tierDisplay: 3 },
      { modId: 'Rings/IncreasedLife', tierDisplay: 3 },
      { modId: 'Rings/ColdResistance', tierDisplay: 3 },
    ]);
    expect(requested).toHaveLength(1);
    expect(item.prefixes).toHaveLength(1);
    expect(item.suffixes).toHaveLength(1);
    expect(makeSolveRequest(engine, item, requested, modMap, DEFAULT_OPTIONS, 5_000, 0, false).spare)
      .toEqual({ prefixes: 1, suffixes: 2 });
  });
});
