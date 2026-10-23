import { describe, expect, it } from 'vitest';
import { equipmentRevision } from './equipmentRevision';
import { applyPobLoadout, loadoutChanges } from './loadoutIntegration';
import { deserializeLoadout, emptyLoadout, serializeLoadout } from './loadout';
import { BOOTS_SAMPLE } from './fixtures/fullGear';
import { dualWeaponsXml, secondWeapon } from './fixtures/dualWeapons';
import { parsePobXml, pobImportSource, previewPob } from './pobImport';
import { switchWeaponSet } from './weaponSets';

const spear = 'Rarity: Unique\nThe Ordained\nSolemn Spear\n--------\nQuality: +20%\nPhysical Damage: 100-200 (augmented)\nAttacks per Second: 1.50\n--------\nItem Level: 84\n--------\n220% increased Physical Damage\nLife Leech recovers based on your Lightning damage as well as Physical damage';
function imported() {
  const doc = parsePobXml(dualWeaponsXml), preview = previewPob(doc, '1', false);
  return applyPobLoadout(emptyLoadout(), preview.slots, pobImportSource(doc, '1', false, preview.slots));
}
describe('semantic equipment refresh comparisons', () => {
  it('explains same-name rolls and displayed weapon DPS instead of only showing the same unique name twice', () => {
    const before = { ...emptyLoadout(), slots: { mainHand: spear } }, after = { ...before, slots: { mainHand: spear.replace('220%', '303%').replace('100-200', '150-250') } };
    const change = loadoutChanges(before, after), row = change.slots[0]!;
    expect(row.before).toBe('The Ordained'); expect(row.after).toBe('The Ordained');
    expect(row.revision.status).toBe('modified');
    expect(row.revision.lines).toEqual(expect.arrayContaining([expect.objectContaining({ before: '增加220%物理伤害', after: '增加303%物理伤害', delta: 83 })]));
    expect(row.metrics).toContainEqual(expect.objectContaining({ key: 'physicalDps', before: 225, after: 300, delta: 75 }));
    expect(change.metrics).toEqual([]); // A weapon DPS is compared per item, never summed into character DPS.
  });
  it('ignores affix headers, range annotations, review markers and modifier ordering', () => {
    const simpler = BOOTS_SAMPLE.replace(/\{[^}]+\}\n/g, '').replace(/\(\d+-\d+\)/g, '').replace(/ \(augmented\)/g, '');
    expect(equipmentRevision(BOOTS_SAMPLE, simpler)).toMatchObject({ status: 'unchanged', formatOnly: true, lines: [] });
    const modFirst = spear.replace('220% increased Physical Damage\nLife Leech recovers based on your Lightning damage as well as Physical damage', 'Life Leech recovers based on your Lightning damage as well as Physical damage\n220% increased Physical Damage');
    expect(equipmentRevision(spear, modFirst).status).toBe('unchanged');
    expect(equipmentRevision(spear.replace('220% increased Physical Damage', '220% increased Physical Damage [PoB数值待游戏文本核对]'), spear).status).toBe('unchanged');
  });
  it('detects conditional, unknown and origin changes even with no additive metric delta', () => {
    const belt = 'Rarity: Unique\nMidnight Braid\nRawhide Belt\n--------\n50% of Damage taken Recouped as Mana';
    expect(equipmentRevision(belt, belt.replace('50%', '60%')).lines).toContainEqual(expect.objectContaining({ delta: 10 }));
    expect(equipmentRevision(spear + '\nUncatalogued 10 mechanic', spear + '\nUncatalogued 20 mechanic').lines).toContainEqual(expect.objectContaining({ before: 'Uncatalogued 10 mechanic', after: 'Uncatalogued 20 mechanic' }));
    const a = BOOTS_SAMPLE + '\n+10% to Fire Resistance (rune)', b = BOOTS_SAMPLE + '\n+10% to Fire Resistance';
    expect(equipmentRevision(a, b).lines).toHaveLength(2);
  });
  it('removes equal duplicate stat lines before presenting the changed roll', () => {
    const ring = 'Rarity: Unique\nThe Taming\nPrismatic Ring\n--------\n+12% to all Elemental Resistances\n+26% to all Elemental Resistances';
    const lines = equipmentRevision(ring, ring.replace('+26%', '+30%')).lines;
    expect(lines).toHaveLength(1); expect(lines[0]).toMatchObject({ before: '26%全元素抗性', after: '30%全元素抗性', delta: 4 });
  });
  it('compares both weapon pairs by identity, not whichever pair is selected in the UI', () => {
    const before = imported(), after = switchWeaponSet(before, 2);
    expect(loadoutChanges(before, after).slots).toEqual([]);
    expect(loadoutChanges(before, after).sameWeaponSet).toBe(false);
    after.weaponSets = { ...after.weaponSets!, second: { ...after.weaponSets!.second, mainHand: secondWeapon.replace('+20 to maximum Life', '+30 to maximum Life') } };
    // The active slots are authoritative; modify the item the user is viewing.
    after.slots = { ...after.slots, mainHand: after.weaponSets.second.mainHand };
    const rows = loadoutChanges(before, after).slots;
    expect(rows).toHaveLength(1); expect(rows[0]?.label).toBe('武器组 II · 主手');
    expect(rows[0]?.revision.lines).toContainEqual(expect.objectContaining({ delta: 10 }));
    const legacy = { ...before, weaponSets: undefined, source: { ...before.source!, weaponSets: undefined } };
    expect(loadoutChanges(legacy, before).slots.every((row) => row.revision.status === 'newly-read')).toBe(true);
  });
  it('preserves the last actual update across identical refreshes and freezes its after snapshot across later manual changes', () => {
    const before = { ...emptyLoadout(), slots: { mainHand: spear } }, changed = spear.replace('220%', '303%');
    const first = applyPobLoadout(before, { mainHand: changed });
    expect(first.lastImport?.equipmentChanges).toBe(1);
    const repeat = applyPobLoadout(first, { mainHand: changed.replace('303% increased Physical Damage', '{ Prefix Modifier }\n303% increased Physical Damage') });
    expect(repeat.lastImport).toMatchObject({ equipmentChanges: 0, formatOnly: 1 });
    expect(repeat.previous).toEqual(first.previous);
    repeat.slots.mainHand = changed.replace('303%', '350%');
    expect(repeat.previous?.after?.slots.mainHand).toBe(changed);
    const restored = deserializeLoadout(serializeLoadout(repeat)).state!;
    expect(restored.previous?.after?.slots.mainHand).toBe(changed);
    expect(restored.lastImport?.equipmentChanges).toBe(0);
  });
  it('treats missing fields as newly read information, without inventing an old zero value', () => {
    const noPanel = spear.replace('Physical Damage: 100-200 (augmented)\n', '');
    const diff = equipmentRevision(noPanel, spear);
    expect(diff.status).toBe('information');
    expect(diff.lines).toContainEqual(expect.objectContaining({ key: 'property:physicalDamage', before: '未记录', information: true }));
  });
});
