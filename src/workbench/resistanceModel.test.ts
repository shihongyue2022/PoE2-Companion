import { expect, it } from 'vitest';
import { resistanceGate, resistanceBaseline, equipmentSignature } from './resistanceModel';
import { emptyLoadout, equipRaw, serializeLoadout, deserializeLoadout, compareCandidate, type LoadoutState } from './loadout';
import { parseEquipment, equipmentMetricDetails } from './genericEquipment';
import { MORIOR_INVICTUS_SAMPLE } from './fixtures/moriorInvictus';

const body = 'Item Class: Body Armours\nRarity: Rare\nChaos Plate\nGrand Regalia\n--------\n+50% to Chaos Resistance';
const nextBody = 'Item Class: Body Armours\nRarity: Rare\nElement Plate\nGrand Regalia\n--------\n+45% to all Elemental Resistances';
const boots = 'Item Class: Boots\nRarity: Rare\nOld Boots\nSilk Slippers\n--------\n+30% to Fire Resistance\n31% increased Movement Speed\n10% increased Attack Speed';
const nextBoots = 'Item Class: Boots\nRarity: Rare\nNew Boots\nSilk Slippers\n--------\n+38% to Cold Resistance\n+20% to Chaos Resistance\n30% increased Attack Speed';
function state(): LoadoutState {
  const slots = { body, boots };
  return { ...emptyLoadout(), slots, source: { kind: 'pob', setId: '1', setTitle: 'Current', secondWeapons: false, importedAt: '2026-10-23T00:00:00Z', equipmentSignature: equipmentSignature(slots),
    reference: { values: { fireResistance: 120, coldResistance: 110, lightningResistance: 100, chaosResistance: 90 }, caps: { fireResistance: 75, coldResistance: 75, lightningResistance: 75, chaosResistance: 75 } } } };
}
it('uses a PoB-only whole-character baseline and keeps elemental resistance separate from chaos', () => {
  const current = state(), item = parseEquipment(nextBody)!;
  expect(equipmentMetricDetails(item).values).toMatchObject({ fireResistance: 45, coldResistance: 45, lightningResistance: 45 });
  expect(equipmentMetricDetails(item).values.chaosResistance).toBeUndefined();
  const comparison = compareCandidate(current, 'body', item);
  expect(comparison.characterResistances.find((row) => row.key === 'chaosResistance')).toMatchObject({ before: 90, after: 40, effectiveBefore: 75, effectiveAfter: 40 });
  expect(comparison.damageGoal?.gate.status).toBe('unmet');
});
it('tracks cumulative changes after adopting the body and does not penalize a safe fire-resistance reduction', () => {
  const changed = equipRaw(state(), 'body', nextBody); if (!changed.ok) throw new Error(changed.error);
  const restored = deserializeLoadout(serializeLoadout(changed.state)).state!;
  expect(resistanceBaseline(restored).values).toMatchObject({ fireResistance: 165, coldResistance: 155, lightningResistance: 145, chaosResistance: 40 });
  const comparison = compareCandidate(restored, 'boots', parseEquipment(nextBoots)!);
  expect(comparison.characterResistances.find((row) => row.key === 'fireResistance')).toMatchObject({ before: 165, after: 135, effectiveBefore: 75, effectiveAfter: 75, effectiveDelta: 0 });
  expect(comparison.characterResistances.find((row) => row.key === 'chaosResistance')).toMatchObject({ before: 40, after: 60, effectiveAfter: 60 });
  expect(comparison.damageGoal?.status).toBe('rejected');
  const second = equipRaw(restored, 'boots', nextBoots); if (!second.ok) throw new Error(second.error);
  expect(resistanceBaseline(second.state).values.chaosResistance).toBe(60);
  expect(resistanceBaseline(second.state).values.fireResistance).toBe(135);
});
it('retains confirmed filled sockets across adoption and reload without granting chaos from all elemental resistance', () => {
  const current = state();
  const oldBody = MORIOR_INVICTUS_SAMPLE.replace('全元素抗性+10(8-10)%', '混沌抗性+10(8-10)%');
  current.slots.body = oldBody; current.source!.equipmentSignature = equipmentSignature(current.slots);
  expect(equipmentMetricDetails(parseEquipment(oldBody)!, { filledSockets: 5 }).values.chaosResistance).toBe(50);
  const changed = equipRaw(current, 'body', MORIOR_INVICTUS_SAMPLE, { beforeFilledSockets: 5, afterFilledSockets: 5 });
  if (!changed.ok) throw new Error(changed.error);
  const restored = deserializeLoadout(serializeLoadout(changed.state)).state!;
  expect(restored.socketEvidence).toHaveLength(2);
  expect(resistanceBaseline(restored).values.chaosResistance).toBe(40);
  expect(resistanceGate(restored, 'boots', parseEquipment(nextBoots)!).rows.find((row) => row.key === 'chaosResistance')).toMatchObject({ after: 60, met: false });
});
it('allows a second slot to complete the whole-loadout target after the first replacement loses chaos resistance', () => {
  const first = equipRaw(state(), 'body', nextBody); if (!first.ok) throw new Error(first.error);
  expect(resistanceGate(first.state, 'body', parseEquipment(nextBody)!).status).toBe('unmet');
  const combinedBoots = nextBoots.replace('+20% to Chaos Resistance', '+35% to Chaos Resistance');
  const combined = resistanceGate(first.state, 'boots', parseEquipment(combinedBoots)!);
  expect(combined.status).toBe('met');
  expect(combined.rows.find((row) => row.key === 'chaosResistance')).toMatchObject({ before: 40, after: 75, met: true });
  const second = equipRaw(first.state, 'boots', combinedBoots); if (!second.ok) throw new Error(second.error);
  const restored = deserializeLoadout(serializeLoadout(second.state)).state!;
  expect(resistanceBaseline(restored).values).toMatchObject({ chaosResistance: 75, fireResistance: 135, coldResistance: 193, lightningResistance: 145 });
});
it('accepts explicitly confirmed caps for an unsaturated effective value but does not invent saturated overflow', () => {
  const current = state(); current.source!.reference = { values: {}, caps: {}, effective: { fireResistance: 75, chaosResistance: 57 } };
  current.goals.resistanceCaps = { fireResistance: 75, coldResistance: 75, lightningResistance: 75, chaosResistance: 75 };
  const gate = resistanceGate(current, 'boots', parseEquipment(boots)!);
  expect(gate.rows.find((row) => row.key === 'chaosResistance')).toMatchObject({ before: 57, after: 57, cap: 75, met: false });
  expect(gate.rows.find((row) => row.key === 'fireResistance')?.before).toBeUndefined();
});
