import { expect, it } from 'vitest';
import { parsePobXml, pobImportSource, previewPob } from './pobImport';
import { combatXml } from './fixtures/pobCombat';
import { deserializeLoadout, emptyLoadout, serializeLoadout } from './loadout';
import { needsPobResistanceRepair, supplementPobResistances } from './pobResistanceRepair';
import { currentResistanceGate } from './resistanceModel';

const snapshot = (chaos: number) => combatXml.replace('<Build level="87" mainSocketGroup="3">', `<Build level="87" mainSocketGroup="3">
<PlayerStat stat="FireResist" value="75"/><PlayerStat stat="FireResistOverCap" value="116"/>
<PlayerStat stat="ColdResist" value="75"/><PlayerStat stat="ColdResistOverCap" value="35"/>
<PlayerStat stat="LightningResist" value="75"/><PlayerStat stat="LightningResistOverCap" value="47"/>
<PlayerStat stat="ChaosResist" value="${chaos}"/><PlayerStat stat="ChaosResistOverCap" value="0"/>
<MinionStat stat="ChaosResistTotal" value="999"/>`);
function imported(xml: string) {
  const doc = parsePobXml(xml), { slots } = previewPob(doc, '1', false);
  return { ...emptyLoadout(), slots, source: pobImportSource(doc, '1', false, slots) };
}
it('reads the native saved stat layout, including zero and negative uncapped chaos, without borrowing elemental caps or minion totals', () => {
  for (const chaos of [28, 0, -60, 75]) {
    const state = imported(snapshot(chaos));
    expect(state.source.reference?.values).toMatchObject({ fireResistance: 191, coldResistance: 110, lightningResistance: 122, chaosResistance: chaos });
    expect(state.source.reference?.caps.chaosResistance).toBeUndefined();
    const restored = deserializeLoadout(serializeLoadout(state)).state!;
    expect(currentResistanceGate(restored)?.rows.find((r) => r.key === 'chaosResistance')?.after).toBe(chaos);
  }
  expect(imported(snapshot(-200)).source.reference?.values.chaosResistance).toBeUndefined();
});
it('repairs the legacy reference without replacing worn gear, settings, measurements, socket evidence or its original anchor', () => {
  const xml = snapshot(28), old = imported(xml);
  delete old.source.reference!.values.chaosResistance;
  old.slots = { ...old.slots, ring1: old.slots.ring1!.replace('+70', '+90') };
  expect(needsPobResistanceRepair(old)).toBe(true);
  const next = supplementPobResistances(old, xml);
  for (const key of ['slots', 'goals', 'quotes', 'character', 'socketEvidence'] as const) expect(next[key]).toBe(old[key]);
  expect(next.source!.equipmentSignature).toBe(old.source.equipmentSignature);
  expect(next.source!.reference!.values.chaosResistance).toBe(28);
  expect(needsPobResistanceRepair(next)).toBe(false);
  expect(() => supplementPobResistances(old, xml.replace('+70', '+100'))).toThrow('装备已变化');
});
