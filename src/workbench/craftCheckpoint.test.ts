import { describe, expect, it } from 'vitest';
import type { ExistingItem } from '../lib/engineTypes';
import { evaluateCheckpoint, type CraftCheckpoint } from './craftCheckpoint';

const LIFE = 'Rings/IncreasedLife';
const COLD = 'Rings/ColdResistance';
const RARITY = 'Rings/ItemFoundRarityIncrease';
const MANA = 'Rings/IncreasedMana';
const before: ExistingItem = {
  baseId: 'Rings', level: 82, rarity: 'rare',
  prefixes: [{ modId: LIFE, tierDisplay: 2 }],
  suffixes: [{ modId: COLD, tierDisplay: 3 }, { modId: RARITY, tierDisplay: 1, fractured: true }],
};
const anchor: CraftCheckpoint = {
  id: 'step-1', createdAt: '2026-10-22T06:00:00.000Z', baseName: 'Breach Ring', before,
  action: 'Annulment', mode: 'remove', removeModIds: [COLD], preserveModIds: [LIFE], targets: [],
};
const withoutCold: ExistingItem = { ...before, suffixes: [before.suffixes[1]!] };
const evaluate = (item: ExistingItem, change: Partial<CraftCheckpoint> = {}, complete = true, baseName = 'Breach Ring') =>
  evaluateCheckpoint({ ...anchor, ...change }, { item, baseName, complete });

describe('a crafting checkpoint compared with a fresh actual item', () => {
  it('accepts exactly the selected annul result with every other modifier intact', () => {
    expect(evaluate(withoutCold)).toMatchObject({ status: 'met', canContinue: true });
  });

  it('does not advance when a random annul removed another modifier', () => {
    const wrong = { ...before, prefixes: [] };
    expect(evaluate(wrong)).toMatchObject({ status: 'missed', canContinue: false });
    expect(evaluate(wrong, { preserveModIds: [] })).toMatchObject({ status: 'missed', canContinue: false });
  });

  it('always protects fractures even when a stored preserve list omits them', () => {
    expect(evaluate({ ...before, suffixes: [before.suffixes[0]!] }, { preserveModIds: [] }))
      .toMatchObject({ status: 'missed', canContinue: false });
    expect(evaluate({ ...withoutCold, suffixes: [{ ...before.suffixes[1]!, fractured: false }] }))
      .toMatchObject({ status: 'missed', canContinue: false });
  });

  it('rejects another concrete base or another item level before checking goal matches', () => {
    expect(evaluate(withoutCold, {}, true, 'Ruby Ring')).toMatchObject({ status: 'mismatch', canContinue: false });
    expect(evaluate({ ...withoutCold, level: 83 })).toMatchObject({ status: 'mismatch', canContinue: false });
    expect(evaluate(withoutCold, {}, true, '裂痕戒指').status).toBe('met');
  });

  it('does not call unchanged or reordered snapshots completed actions', () => {
    expect(evaluate(before)).toMatchObject({ status: 'unchanged', canContinue: false });
    expect(evaluate({ ...before, suffixes: [...before.suffixes].reverse() })).toMatchObject({ status: 'unchanged', canContinue: false });
    const goals: Partial<CraftCheckpoint> = { mode: 'goals', targets: [{ modId: LIFE, tierDisplay: 2 }] };
    expect(evaluate(before, goals).status).toBe('unchanged');
  });

  it('never certifies a partial or unresolved parse', () => {
    expect(evaluate(withoutCold, {}, false)).toMatchObject({ status: 'unresolved', canContinue: false });
  });

  it('rejects tier changes or additions masquerading as one annul', () => {
    expect(evaluate({ ...withoutCold, prefixes: [{ modId: LIFE, tierDisplay: 1 }] }).status).toBe('mismatch');
    expect(evaluate({ ...withoutCold, prefixes: [...before.prefixes, { modId: MANA, tierDisplay: 1 }] }).status).toBe('mismatch');
  });

  it('accepts one selected addition at the requested tier or better', () => {
    const add: Partial<CraftCheckpoint> = { mode: 'add', action: 'Exalted', targets: [{ modId: MANA, tierDisplay: 2 }], removeModIds: [] };
    const after = { ...before, prefixes: [...before.prefixes, { modId: MANA, tierDisplay: 1 }] };
    expect(evaluate(after, add)).toMatchObject({ status: 'met', canContinue: true });
    expect(evaluate({ ...after, prefixes: [...before.prefixes, { modId: MANA, tierDisplay: 3 }] }, add).status).toBe('missed');
    expect(evaluate({ ...before, suffixes: [...before.suffixes, { modId: 'Rings/Strength', tierDisplay: 1 }] }, add).status).toBe('missed');
  });

  it('rejects a removal-plus-addition in add-only mode', () => {
    const after = { ...withoutCold, prefixes: [...before.prefixes, { modId: MANA, tierDisplay: 1 }] };
    expect(evaluate(after, { mode: 'add', targets: [{ modId: MANA, tierDisplay: 1 }] }).status).toBe('mismatch');
  });

  it('checks all selected add goals rather than any unrelated successful goal', () => {
    const after = { ...before, prefixes: [...before.prefixes, { modId: MANA, tierDisplay: 1 }] };
    expect(evaluate(after, { mode: 'add', targets: [{ modId: MANA, tierDisplay: 1 }, { modId: COLD, tierDisplay: 1 }] }).status).toBe('missed');
  });

  it('allows one chaos-like swap in goals mode while preserving protected modifiers', () => {
    const after = { ...withoutCold, prefixes: [...before.prefixes, { modId: MANA, tierDisplay: 1 }] };
    expect(evaluate(after, { mode: 'goals', targets: [{ modId: MANA, tierDisplay: 2 }] }))
      .toMatchObject({ status: 'met', canContinue: true });
    expect(evaluate(after, { mode: 'goals', targets: [{ modId: MANA, tierDisplay: 1 }, { modId: COLD, tierDisplay: 1 }] }).status).toBe('missed');
  });

  it('allows a same-family tier upgrade in goals mode but not a claimed upgrade of a fracture', () => {
    const after = { ...before, suffixes: [{ modId: COLD, tierDisplay: 1 }, before.suffixes[1]!] };
    expect(evaluate(after, { mode: 'goals', targets: [{ modId: COLD, tierDisplay: 1 }] }).status).toBe('met');
    const lowerFracture = { ...before, suffixes: [{ modId: RARITY, tierDisplay: 2, fractured: true }] };
    const impossible = { ...lowerFracture, suffixes: [{ modId: RARITY, tierDisplay: 1, fractured: true }] };
    expect(evaluate(impossible, { before: lowerFracture, mode: 'goals', targets: [{ modId: RARITY, tierDisplay: 1 }] }).status).toBe('missed');
  });

  it('does not accept a wholesale replacement item solely because goals happen to match', () => {
    const other: ExistingItem = { ...before, prefixes: [{ modId: MANA, tierDisplay: 1 }], suffixes: [{ modId: 'Rings/Strength', tierDisplay: 1 }, before.suffixes[1]!] };
    expect(evaluate(other, { mode: 'goals', preserveModIds: [], targets: [{ modId: MANA, tierDisplay: 1 }] }).status).toBe('mismatch');
    const twoMoves: ExistingItem = { ...withoutCold, prefixes: [{ modId: LIFE, tierDisplay: 1 }, { modId: MANA, tierDisplay: 1 }] };
    expect(evaluate(twoMoves, { mode: 'goals', preserveModIds: [], targets: [{ modId: MANA, tierDisplay: 1 }] }).status).toBe('mismatch');
  });

  it('requires meaningful explicit conditions and valid immutable state', () => {
    expect(evaluate(withoutCold, { removeModIds: [] }).status).toBe('unresolved');
    expect(evaluate(withoutCold, { removeModIds: [RARITY] }).status).toBe('unresolved');
    expect(evaluate(withoutCold, { mode: 'goals', targets: [] }).status).toBe('unresolved');
    expect(evaluate(withoutCold, { preserveModIds: ['missing'] }).status).toBe('unresolved');
    expect(evaluate({ ...before, prefixes: [before.prefixes[0]!, before.prefixes[0]!] }).status).toBe('unresolved');
  });
});
