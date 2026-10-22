import { describe, expect, it } from 'vitest';
import { parseEquipment } from './genericEquipment';
import {
  compareCandidate, deserializeLoadout, emptyLoadout, equipRaw, loadoutTotals, loadoutWarnings,
  serializeLoadout, type LoadoutSlot, type LoadoutState,
} from './loadout';

const ring = (life = 70, fire = 25, extra = '') => `Item Class: Rings
Rarity: Rare
Cinder Band
Gold Ring
--------
Item Level: 82
--------
+${life} to maximum Life
+${fire}% to Fire Resistance
+20% to Cold Resistance
+12% to Lightning Resistance
${extra}`;
const weapon = (itemClass: string, base: string, damage = '100-200', extra = '') => `Item Class: ${itemClass}
Rarity: Normal
${base}
--------
Physical Damage: ${damage}
Attacks per Second: 1.50
--------
${extra}`;
const offhand = (itemClass: string, base: string) => `Item Class: ${itemClass}
Rarity: Normal
${base}
--------
Item Level: 70`;

function equip(state: LoadoutState, slot: LoadoutSlot, raw: string): LoadoutState {
  const result = equipRaw(state, slot, raw);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe('whole-character loadout boundaries', () => {
  it('keeps the two rings separate and refuses to force a ring into armour', () => {
    let state = equip(emptyLoadout(), 'ring1', ring(70));
    state = equip(state, 'ring2', ring(90));
    expect(parseEquipment(state.slots.ring1!)?.mods.some((mod) => mod.value === 70)).toBe(true);
    expect(parseEquipment(state.slots.ring2!)?.mods.some((mod) => mod.value === 90)).toBe(true);
    const result = equipRaw(state, 'body', ring(100));
    expect(result.ok).toBe(false);
    expect(state.slots.body).toBeUndefined();
    expect(state.slots.ring1).toBe(ring(70).trim());
  });

  it('rejects occupied offhands for two-handed weapons without deleting either item', () => {
    const shield = offhand('Shields', 'Splintered Tower Shield');
    const state = equip(emptyLoadout(), 'offHand', shield);
    const result = equipRaw(state, 'mainHand', weapon('Two Hand Maces', 'Felled Greatclub'));
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('双手武器') });
    expect(state.slots.offHand).toBe(shield);
    expect(state.slots.mainHand).toBeUndefined();
    expect(equipRaw(emptyLoadout(), 'offHand', weapon('Two Hand Maces', 'Felled Greatclub')).ok).toBe(false);
  });

  it('allows bow plus quiver, but refuses a quiver with a different main weapon', () => {
    const quiver = offhand('Quivers', 'Broadhead Quiver');
    const bow = weapon('Bows', 'Crude Bow');
    let state = equip(emptyLoadout(), 'mainHand', bow);
    state = equip(state, 'offHand', quiver);
    expect(state.slots.offHand).toBe(quiver);
    expect(loadoutWarnings(state)).toEqual([]);
    const mace = weapon('One Hand Maces', 'Crude Mace');
    expect(equipRaw(state, 'mainHand', mace).ok).toBe(false);
    expect(equipRaw(state, 'offHand', offhand('Shields', 'Splintered Tower Shield')).ok).toBe(false);
    const incomplete = equip(emptyLoadout(), 'offHand', quiver);
    expect(loadoutWarnings(incomplete).join('')).toContain('尚无主手');
  });

  it('round-trips an entire set and goals without accepting malformed or mismatched saves', () => {
    const state = equip(equip(emptyLoadout(), 'ring1', ring()), 'boots', `Item Class: Boots
Rarity: Rare
Path Road
Iron Greaves
--------
Armour: 200
--------
30% increased Movement Speed`);
    state.goals.minimums.fireResistance = 60;
    state.goals.priorities = ['life', 'movementSpeed'];
    expect(deserializeLoadout(serializeLoadout(state)).state).toEqual(state);
    expect(deserializeLoadout(JSON.stringify({ version: 1, slots: { body: ring() } })).state).toBeNull();
    expect(deserializeLoadout(JSON.stringify({ version: 1, slots: { unknown: ring() } })).state).toBeNull();
    expect(deserializeLoadout('{')).toMatchObject({ state: null });
    expect(deserializeLoadout(JSON.stringify({ version: 1, slots: [], goals: {} })).state).toBeNull();
  });

  it('checks hand compatibility during JSON import regardless of property order', () => {
    const result = deserializeLoadout(JSON.stringify({ version: 1, slots: {
      offHand: offhand('Shields', 'Splintered Tower Shield'),
      mainHand: weapon('Two Hand Maces', 'Felled Greatclub'),
    } }));
    expect(result.state).toBeNull();
    expect(result.error).toContain('双手武器');
  });

  it('adds only worn unconditional stats, keeping weapon DPS and flask/charm effects out of totals', () => {
    let state = equip(emptyLoadout(), 'ring1', ring(70));
    state = equip(state, 'ring2', ring(90));
    state = equip(state, 'mainHand', weapon('One Hand Maces', 'Crude Mace'));
    state = equip(state, 'body', `Item Class: Body Armours
Rarity: Rare
Stone Shelter
Plate Vest
--------
Armour: 900 (augmented)
Energy Shield: 100
--------
80% increased Armour
+80 to maximum Life`);
    state = equip(state, 'flask1', `Item Class: Life Flasks
Rarity: Magic
Ultimate Life Flask
--------
+500 to maximum Life`);
    expect(loadoutTotals(state)).toMatchObject({ life: 240, fireResistance: 50, armour: 900, energyShield: 100 });
    expect(loadoutTotals(state).totalDps).toBeUndefined();
  });
});

describe('same-slot replacement comparisons', () => {
  it('reports a supported paper upgrade and preserves user resistance targets', () => {
    const state = equip(emptyLoadout(), 'ring1', ring());
    state.goals.minimums.fireResistance = 30;
    const result = compareCandidate(state, 'ring1', parseEquipment(ring(90, 35))!);
    expect(result.status).toBe('upgrade');
    expect(result.priorityDirection).toBe('优先属性提升');
    expect(result.metrics.find((metric) => metric.key === 'life')).toMatchObject({ before: 70, after: 90, delta: 20 });
    expect(result.targets).toContainEqual(expect.objectContaining({ key: 'fireResistance', before: 25, after: 35, minimum: 30, met: true }));
    expect(state.slots.ring1).toBe(ring().trim());
  });

  it('reports a tradeoff and a missed resistance threshold rather than calling more life an upgrade', () => {
    const state = equip(emptyLoadout(), 'ring1', ring());
    state.goals.minimums.fireResistance = 25;
    const result = compareCandidate(state, 'ring1', parseEquipment(ring(100, 15))!);
    expect(result.status).toBe('tradeoff');
    expect(result.targets[0]).toMatchObject({ after: 15, met: false });
  });

  it('reports lower paper values as a downgrade', () => {
    const state = equip(emptyLoadout(), 'ring1', ring());
    expect(compareCandidate(state, 'ring1', parseEquipment(ring(50, 15))!).status).toBe('downgrade');
  });

  it('does not treat unidentified, unsupported effects, empty slots, or wrong item slots as a zero-power baseline', () => {
    const state = equip(emptyLoadout(), 'ring1', ring());
    expect(compareCandidate(state, 'ring1', parseEquipment(`${ring(100)}\nUnidentified`)!).status).toBe('insufficient');
    expect(compareCandidate(state, 'ring1', parseEquipment(ring(100, 35, 'Your Hits permanently confuse all nearby ducks'))!).status).toBe('insufficient');
    expect(compareCandidate(emptyLoadout(), 'ring1', parseEquipment(ring())!).status).toBe('insufficient');
    const mismatch = compareCandidate(state, 'body', parseEquipment(ring())!);
    expect(mismatch.status).toBe('insufficient');
    expect(mismatch.canEquip).toBe(false);
  });

  it('uses printed local weapon DPS without adding raw damage rolls twice', () => {
    const state = equip(emptyLoadout(), 'mainHand', weapon('One Hand Maces', 'Crude Mace', '100-200'));
    const result = compareCandidate(state, 'mainHand', parseEquipment(weapon('One Hand Maces', 'Crude Mace', '150-250'))!);
    expect(result.metrics.find((metric) => metric.key === 'physicalDps')).toMatchObject({ before: 225, after: 300, delta: 75 });
    expect(result.metrics.find((metric) => metric.key === 'totalDps')).toMatchObject({ before: 225, after: 300 });
  });
});
