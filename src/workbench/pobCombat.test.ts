import { describe, expect, it } from 'vitest';
import { parsePobXml, pobImportSource, previewPob } from './pobImport';
import { activeGems, damageComposition, gemInfo, mainGem, readPobCombat } from './pobCombat';
import { combatRing, combatXml } from './fixtures/pobCombat';
import { deserializeLoadout, emptyLoadout, serializeLoadout } from './loadout';
import { equipmentComposition, supplementPobCombat } from './characterAnalysis';
import { equipmentSignature } from './characterPanel';

const document = () => parsePobXml(combatXml);
const state = () => {
  const parsed = document(), preview = previewPob(parsed, '1', false);
  return { ...emptyLoadout(), slots: preview.slots, source: pobImportSource(parsed, '1', false, preview.slots) };
};
describe('PoB2 skills and saved damage', () => {
  it('uses 1-based main group in active skill set including inactive/generated groups', () => {
    const combat = document().profile!.combat!;
    expect(combat.activeSet).toBe('2');
    expect(mainGem(combat)).toMatchObject({ name: 'Lightning Spear', level: 18, quality: 20 });
    const group = combat.sets[1]!.groups[2]!;
    expect(group.fullDps).toBe(false);
    expect(gemInfo(group.gems[0]!)).toMatchObject({ label: '闪电长矛', support: false, tags: expect.arrayContaining(['attack', 'lightning']) });
    expect(gemInfo(group.gems[1]!)).toMatchObject({ label: '元素武装 II', support: true });
    expect(activeGems(group, false).map((gem) => gem.name)).toEqual(['Lightning Spear', 'Elemental Armament II']);
    expect(activeGems(group, true).map((gem) => gem.name)).toEqual(['Elemental Armament II']);
    expect(activeGems(combat.sets[1]!.groups[0]!, false)).toEqual([]);
    expect(activeGems(combat.sets[1]!.groups[1]!, false)).toEqual([]);
    expect(activeGems(combat.sets[1]!.groups[1]!, true)).toHaveLength(1);
    expect(combat.sets[1]!.groups[3]!.source).toBe('tree');
  });
  it('keeps saved hit, total DoT and combined separate, without adding ignite twice or reading arbitrary stats', () => {
    const combat = document().profile!.combat!;
    expect(damageComposition(combat)).toMatchObject({ hit: 174.4095, dot: 0.0473, ignite: 0.0473, combined: 174.4568, full: 0 });
    expect(combat.stats).not.toHaveProperty('AccountSecret');
    expect(document().items['1']!.raw).toBe(combatRing);
  });
  it('does not associate saved damage with a nonactive equipment/weapon set', () => {
    const parsed = document();
    expect(pobImportSource(parsed, '1', true, {}).combat?.matchesEquipment).toBe(false);
    expect(pobImportSource(parsed, '2', false, {}).combat?.matchesEquipment).toBe(false);
  });
  it('round trips validated bounded combat metadata and rejects corrupt/huge trees', () => {
    const original = state();
    expect(deserializeLoadout(serializeLoadout(original)).state?.source?.combat).toEqual(original.source.combat);
    const combat = original.source.combat!;
    expect(readPobCombat({ ...combat, sets: Array(21).fill(combat.sets[0]) })).toBeUndefined();
    expect(readPobCombat({ ...combat, activeSet: 'missing' })).toBeUndefined();
    expect(readPobCombat({ ...combat, stats: { CombinedDPS: Infinity } })?.stats).toEqual({});
    expect(readPobCombat({ ...combat, sets: [{ ...combat.sets[1], groups: [{ ...combat.sets[1]!.groups[2], gems: [{ ...mainGem(combat), level: 1000 }] }] }] })).toBeUndefined();
  });
  it('supplements old imports without replacing worn gear, quotes, goals, calibrated values or source signature', () => {
    const old = { ...state(), quotes: {}, character: { values: { life: 1530 }, caps: {}, recordedAt: new Date().toISOString(), equipmentSignature: equipmentSignature(state().slots) } };
    old.source.combat = undefined;
    const next = supplementPobCombat(old, combatXml);
    expect(mainGem(next.source!.combat!)?.name).toBe('Lightning Spear');
    expect(next.source!.combat!.matchesEquipment).toBe(true);
    for (const key of ['slots', 'goals', 'quotes', 'character'] as const) expect(next[key]).toBe(old[key]);
    expect(next.source!.equipmentSignature).toBe(old.source.equipmentSignature);
    const changed = { ...old, slots: { ring1: combatRing.replace('+70', '+90') } };
    expect(supplementPobCombat(changed, combatXml).source!.combat!.matchesEquipment).toBe(false);
    expect(() => supplementPobCombat(emptyLoadout(), combatXml)).toThrow('先导入');
  });
  it('reports contribution by slot and excludes consumables from permanent stats', () => {
    const rows = equipmentComposition({ ...emptyLoadout(), slots: { ring1: combatRing, ring2: combatRing.replace('+70', '+90'), flask1: 'Rarity: NORMAL\nUltimate Life Flask\n--------\n+100 to maximum Life' } });
    expect(rows.find((row) => row.slot === 'ring1')?.values).toMatchObject({ life: 70, fireResistance: 20 });
    expect(rows.find((row) => row.slot === 'ring2')?.values.life).toBe(90);
    expect(rows.find((row) => row.slot === 'flask1')).toMatchObject({ consumable: true, values: {} });
  });
  it('groups offensive affixes in native English and keeps regeneration outside damage sources', () => {
    const raw = `${combatRing}\n10% increased Attack Speed\nRegenerate 8 Life per second\n24% increased Damage for each type of Elemental Ailment on Enemy`;
    const rows = equipmentComposition({ ...emptyLoadout(), slots: { ring1: raw } });
    expect(rows[0]!.offense.map((affix) => affix.family)).toEqual(['攻击／施法速度', '条件／机制']);
    expect(rows[0]!.offense.some((affix) => /每秒|Regenerate/.test(affix.label))).toBe(false);
  });
});
