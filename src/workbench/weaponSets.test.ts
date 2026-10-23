import { describe, expect, it } from 'vitest';
import { parsePobXml, pobImportSource, previewPob } from './pobImport';
import { applyPobLoadout, sourceIsCurrent } from './loadoutIntegration';
import { deserializeLoadout, emptyLoadout, equipRaw, loadoutTotals, removeSlot, serializeLoadout } from './loadout';
import { activeWeaponSet, switchWeaponSet } from './weaponSets';
import { dualWeaponsXml, firstWeapon, secondWeapon, secondOffhand, sharedRing } from './fixtures/dualWeapons';
import { resistanceBaseline } from './resistanceModel';
import { equipmentSignature, validCharacterPanel } from './characterPanel';
import { mainSkillChoices, skillPlan } from './skillRecommendation';
import { supplementPobWeaponSets } from './pobWeaponSets';
import { captureUpgradeSearch, comparisonSearchRows } from './upgradeWorkflow';
import { supplementPobCombat } from './characterAnalysis';

function imported(xml = dualWeaponsXml) {
  const document = parsePobXml(xml), preview = previewPob(document, '1', document.sets[0]!.secondWeapons);
  return applyPobLoadout(emptyLoadout(), preview.slots, pobImportSource(document, '1', document.sets[0]!.secondWeapons, preview.slots));
}
describe('two independent weapon pairs', () => {
  it('imports both pairs and leaves common armour/accessories shared, summing only the selected pair', () => {
    const state = imported();
    expect(state.weaponSets).toEqual({ active: 1, first: { mainHand: firstWeapon }, second: { mainHand: secondWeapon, offHand: secondOffhand } });
    expect(loadoutTotals(state).life).toBe(50);
    const second = switchWeaponSet(state, 2);
    expect(second.slots).toEqual({ mainHand: secondWeapon, offHand: secondOffhand, ring1: sharedRing });
    expect(loadoutTotals(second)).toMatchObject({ life: 60, chaosResistance: 15, fireResistance: 20 });
    expect(switchWeaponSet(second, 1).slots).toEqual(state.slots);
    expect(switchWeaponSet(second, 1).slots.offHand).toBeUndefined();
  });
  it('persists changes and removals only in the active pair and roundtrips both pairs and the prior snapshot', () => {
    const state = switchWeaponSet(imported(), 2), changed = secondWeapon.replace('+20 to maximum Life', '+30 to maximum Life');
    const equipped = equipRaw(state, 'mainHand', changed); expect(equipped.ok).toBe(true); if (!equipped.ok) return;
    const removed = removeSlot(equipped.state, 'offHand');
    const first = switchWeaponSet(removed, 1), restored = deserializeLoadout(serializeLoadout(first)).state!;
    expect(restored.weaponSets?.first.mainHand).toBe(firstWeapon);
    expect(switchWeaponSet(restored, 2).slots.mainHand).toBe(changed);
    expect(switchWeaponSet(restored, 2).slots.offHand).toBeUndefined();
    expect(applyPobLoadout(restored, {}, undefined).previous?.weaponSets).toEqual(restored.weaponSets);
    const broken = { ...restored, weaponSets: { active: 1, first: { mainHand: firstWeapon }, second: { offHand: firstWeapon } } };
    expect(deserializeLoadout(JSON.stringify(broken)).state).toBeNull(); // Cannot put a bow in the offhand.
  });
  it('keeps saved damage and character totals tied to their weapon group, even when weapon texts are equal', () => {
    const state = imported(); expect(sourceIsCurrent(state)).toBe(true);
    expect(resistanceBaseline(state).values.chaosResistance).toBe(75);
    const second = switchWeaponSet(state, 2);
    expect(sourceIsCurrent(second)).toBe(false);
    expect(resistanceBaseline(second).values).toEqual({});
    const enriched = supplementPobCombat(second, dualWeaponsXml);
    expect(sourceIsCurrent(enriched)).toBe(false);
    expect(switchWeaponSet(enriched, 1).source?.combat?.matchesEquipment).toBe(true);
    second.character = { weaponSet: 2, values: { chaosResistance: 90 }, caps: { chaosResistance: 75 }, equipmentSignature: equipmentSignature(second.slots), recordedAt: new Date().toISOString() };
    expect(validCharacterPanel(second)).toBe(true);
    expect(resistanceBaseline(second).values.chaosResistance).toBe(90);
    expect(resistanceBaseline(switchWeaponSet(second, 1)).values.chaosResistance).toBe(75); // Original PoB group I anchor remains intact.
    const same = { ...state, weaponSets: { active: 1 as const, first: { mainHand: firstWeapon }, second: { mainHand: firstWeapon } } };
    expect(equipmentSignature(switchWeaponSet(same, 2).slots)).toBe(equipmentSignature(same.slots));
    expect(sourceIsCurrent(switchWeaponSet(same, 2))).toBe(false);
  });
  it('offers only currently enabled weapon-group skills and does not reuse another group crit output', () => {
    const state = imported(); expect(mainSkillChoices(state).map((choice) => choice.label).join()).toContain('闪电长矛');
    const second = switchWeaponSet(state, 2), choices = mainSkillChoices(second);
    expect(choices.map((choice) => choice.label).join()).not.toContain('闪电长矛');
    expect(choices.map((choice) => choice.label).join()).toContain('火球');
    expect(skillPlan(second)).toBeUndefined();
    second.goals = { ...second.goals, mainSkill: choices[0]!.selection };
    expect(skillPlan(second)).toMatchObject({ name: 'Fireball', crit: false });
  });
  it('restores the discarded pair from a matching legacy snapshot without reverting current edits', () => {
    const state = imported(); delete state.weaponSets; delete state.source!.weaponSets;
    state.slots.mainHand = firstWeapon.replace('+10 to maximum Life', '+11 to maximum Life');
    const next = supplementPobWeaponSets(state, dualWeaponsXml);
    expect(next.slots).toEqual(state.slots);
    expect(next.weaponSets?.first.mainHand).toContain('+11 to maximum Life');
    expect(switchWeaponSet(next, 2).slots.offHand).toBe(secondOffhand);
    expect(() => supplementPobWeaponSets(state, dualWeaponsXml.replace('+10 to maximum Life', '+99 to maximum Life'))).toThrow('原存档的装备已变化');
  });
  it('also imports when PoB saved group II as active, and expires a captured search when switching groups', () => {
    const state = imported(dualWeaponsXml.replace('useSecondWeaponSet="false"', 'useSecondWeaponSet="true"'));
    expect(activeWeaponSet(state)).toBe(2); expect(state.slots.offHand).toBe(secondOffhand);
    const snapshot = captureUpgradeSearch({ state, slot: 'ring1', raw: sharedRing }, []);
    expect(comparisonSearchRows(snapshot, switchWeaponSet(state, 1), 'ring1')).toBeUndefined();
  });
  it('keeps manually confirmed cap overrides separate for each weapon group', () => {
    const state = imported(); state.goals.resistanceCaps = { fireResistance: 80 };
    const second = switchWeaponSet(state, 2); expect(second.goals.resistanceCaps).toBeUndefined();
    second.goals.resistanceCaps = { fireResistance: 75 };
    const restored = deserializeLoadout(serializeLoadout(second)).state!;
    expect(switchWeaponSet(restored, 1).goals.resistanceCaps).toEqual({ fireResistance: 80 });
    expect(switchWeaponSet(switchWeaponSet(restored, 1), 2).goals.resistanceCaps).toEqual({ fireResistance: 75 });
  });
});
