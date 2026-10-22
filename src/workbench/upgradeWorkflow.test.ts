import { expect, it } from 'vitest';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch';
import { loadGearTrade } from '../lib/gearTrade';
import { captureUpgradeSearch, comparisonSearchRows, upgradeSearchRows } from './upgradeWorkflow';
import { damageState, damageRing } from './fixtures/damageGoal';
import { parseEquipment } from './genericEquipment';
import { compareCandidate } from './loadout';

const data = loadShippedPatch('data/patches/0.5.0'), trade = await loadGearTrade();
it('carries edited market weights into comparison without changing or retaining mutable source rows', () => {
  const state = damageState(), context = { state, slot: 'ring1' as const, raw: damageRing }, item = parseEquipment(damageRing)!;
  const defaults = upgradeSearchRows(item, context, data, trade);
  const edited = defaults.map((row) => /Lightning/.test(row.scoringRef ?? '') ? { ...row, weight: '0' } : row);
  const snapshot = captureUpgradeSearch(context, edited)!;
  const candidate = parseEquipment(`${damageRing}\nAdds 20 to 30 Lightning Damage to Attacks`)!;
  expect(compareCandidate(state, 'ring1', candidate, { damageRows: defaults }).damageGoal?.status).toBe('candidate');
  const shared = comparisonSearchRows(snapshot, state, 'ring1');
  expect(compareCandidate(state, 'ring1', candidate, { damageRows: shared }).damageGoal?.status).toBe('unchanged');
  edited[0]!.ids.push('do-not-mutate-captured-rows');
  expect(snapshot.rows[0]!.ids).not.toContain('do-not-mutate-captured-rows');
  expect(comparisonSearchRows(snapshot, { ...state, quotes: {} }, 'ring1')).toBe(snapshot.rows);
});
it('discards captured search weights after a gear, skill, baseline or slot change', () => {
  const state = damageState(), context = { state, slot: 'ring1' as const, raw: damageRing };
  const snapshot = captureUpgradeSearch(context, upgradeSearchRows(parseEquipment(damageRing)!, context, data, trade));
  expect(comparisonSearchRows(snapshot, state, 'ring2')).toBeUndefined();
  expect(comparisonSearchRows(snapshot, { ...state, slots: { ...state.slots, ring2: damageRing } }, 'ring1')).toBeUndefined();
  expect(comparisonSearchRows(snapshot, { ...state, goals: { ...state.goals, mainSkill: { source: 'bd' } } }, 'ring1')).toBeUndefined();
  expect(comparisonSearchRows(snapshot, { ...state, character: undefined }, 'ring1')).toBeUndefined();
  expect(captureUpgradeSearch({ ...context, raw: 'stale item' }, [])).toBeUndefined();
});
