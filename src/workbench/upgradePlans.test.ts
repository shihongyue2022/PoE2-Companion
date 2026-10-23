import { expect, it } from 'vitest';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch';
import { loadGearTrade } from '../lib/gearTrade';
import { equipmentSignature } from './resistanceModel';
import { assessUpgradePlan, buildUpgradePlans, planBasis } from './upgradePlans';
import { readCandidatePool } from './upgradePlanStore';
import { pairFixture } from './fixtures/upgradePlans';

const data = loadShippedPatch('data/patches/0.5.0'), trade = await loadGearTrade();
it('checks the final loadout across two slots and adds real purchase prices without spending overflow resistance twice', () => {
  const { state, ring, boots } = pairFixture(), original = JSON.stringify(state);
  expect(assessUpgradePlan(state, [ring], data, trade).gate!.status).toBe('unmet');
  const pair = assessUpgradePlan(state, [ring, boots], data, trade);
  expect(pair.gate!.status).toBe('met'); expect(pair.total).toBe(10); expect(pair.status).toBe('feasible');
  expect(pair.gate!.rows.find((row) => row.key === 'chaosResistance')!.effectiveAfter).toBe(75);
  expect(pair.directionDelta).toBeGreaterThan(0);
  expect(JSON.stringify(state)).toBe(original);
  const plans = buildUpgradePlans(state, { version: 1, basis: planBasis(state), candidates: [ring, boots] }, data, trade);
  expect(plans[0]!.candidates).toHaveLength(2); expect(plans[0]!.status).toBe('feasible');
});
it('rejects over-budget and duplicate market items, keeps missing/different currencies unknown, and never invents chaos from elemental resists', () => {
  const { state, ring, boots } = pairFixture();
  state.goals.workflow!.budget = 9;
  expect(assessUpgradePlan(state, [ring, boots], data, trade).status).toBe('rejected');
  state.goals.workflow!.budget = 10;
  expect(assessUpgradePlan(state, [ring, { ...boots, quote: { ...ring.quote!, amount: 4 } }], data, trade).status).toBe('rejected');
  const missing = assessUpgradePlan(state, [ring, { ...boots, quote: undefined }], data, trade);
  expect(missing.total).toBeUndefined(); expect(missing.status).toBe('review');
  const different = assessUpgradePlan(state, [ring, { ...boots, quote: { ...boots.quote!, currency: 'exalted' } }], data, trade);
  expect(different.total).toBeUndefined();
  expect(assessUpgradePlan(state, [ring, { ...boots, raw: boots.raw.replace('\n+12% to Chaos Resistance', '') }], data, trade).gate!.status).toBe('unmet');
});
it('invalidates the pool on equipment or character changes and preserves unique identity until explicitly unlocked', () => {
  const { state, ring, boots } = pairFixture(), basis = planBasis(state);
  expect(readCandidatePool(JSON.stringify({ version: 1, basis, candidates: [ring, boots] }))!.candidates).toHaveLength(2);
  state.character!.values.chaosResistance = 74;
  expect(buildUpgradePlans(state, { version: 1, basis, candidates: [ring, boots] }, data, trade)).toEqual([]);
  state.slots.ring1 = 'Rarity: Unique\nThe Taming\nPrismatic Ring\n--------\n+30% to all Elemental Resistances';
  state.character!.equipmentSignature = state.source!.equipmentSignature = equipmentSignature(state.slots);
  const locked = assessUpgradePlan(state, [ring], data, trade);
  expect(locked.reasons.join(' ')).toContain('受保护');
  state.goals.workflow!.unlockedSlots = ['ring1'];
  expect(assessUpgradePlan(state, [ring], data, trade).reasons.join(' ')).not.toContain('受保护');
});
