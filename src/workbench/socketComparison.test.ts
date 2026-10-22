import { describe, expect, it } from 'vitest';
import { equipmentMetricDetails, parseEquipment } from './genericEquipment';
import { compareCandidate, emptyLoadout, equipRaw } from './loadout';
import { equipmentSignature } from './characterPanel';
import { parsePobXml, previewPob } from './pobImport';
import { MORIOR_INVICTUS_SAMPLE } from './fixtures/moriorInvictus';
describe('Morior Invictus clipboard comparison', () => {
  it('reads printed defence once and preserves occupied-socket uncertainty', () => {
    const item = parseEquipment(MORIOR_INVICTUS_SAMPLE)!;
    expect(item).toMatchObject({ slot: 'body', corrupted: true, sockets: { count: 5 }, warnings: [] });
    expect(item.sockets?.filled).toBeUndefined();
    expect(item.mods).toHaveLength(8);
    const details = equipmentMetricDetails(item);
    expect(details.values).toMatchObject({ armour: 1532, evasion: 1409, energyShield: 433 });
    expect(details.values.fireResistance).toBeUndefined();
    expect(details.values.globalEnergyShieldPercent).toBeUndefined();
    expect(details.pending).toEqual(expect.arrayContaining(['fireResistance', 'lifeRegeneration', 'globalEnergyShieldPercent']));
    expect(details.uncounted).toHaveLength(3);
  });
  it('expands actual five filled sockets without scaling local defence or replacing the per-socket trade scalar', () => {
    const item = parseEquipment(MORIOR_INVICTUS_SAMPLE)!;
    const full = equipmentMetricDetails(item, { filledSockets: 5 });
    expect(full.values).toEqual({ armour: 1532, evasion: 1409, energyShield: 433,
      fireResistance: 50, coldResistance: 50, lightningResistance: 50, lifeRegeneration: 41,
      globalArmourPercent: 60, globalEvasionPercent: 60, globalEnergyShieldPercent: 60 });
    expect(full.uncounted).toEqual([]); expect(full.pending).toEqual([]);
    expect(full.explanations.join()).toContain('8.2 × 5');
    expect(item.mods.find((mod) => mod.ref?.includes('all Elemental Resistances per Socket'))?.value).toBe(10);
    const empty = equipmentMetricDetails(item, { filledSockets: 0 });
    expect(empty.values).toMatchObject({ armour: 1532, energyShield: 433, fireResistance: 0, lifeRegeneration: 0, globalArmourPercent: 0 });
    expect(equipmentMetricDetails(item, { filledSockets: 6 }).pending).toContain('fireResistance');
  });
  it('identifies identical copied equipment while leaving unknown socket-dependent rows explicitly unknown', () => {
    const result = equipRaw(emptyLoadout(), 'body', MORIOR_INVICTUS_SAMPLE); if (!result.ok) throw new Error(result.error);
    const same = compareCandidate(result.state, 'body', parseEquipment(MORIOR_INVICTUS_SAMPLE.replace('2000 divine', '3000 divine'))!);
    expect(same).toMatchObject({ identical: true, status: 'equal', title: '装备文本相同，未发现升级差异' });
    expect(same.metrics.find((row) => row.key === 'fireResistance')).toMatchObject({ beforeUnknown: true, afterUnknown: true });
    const filled = compareCandidate(result.state, 'body', parseEquipment(MORIOR_INVICTUS_SAMPLE)!, { beforeFilledSockets: 4, afterFilledSockets: 5 });
    expect(filled).toMatchObject({ identical: false, status: 'upgrade' });
    expect(filled.metrics.find((row) => row.key === 'lifeRegeneration')).toMatchObject({ before: 32.8, after: 41, delta: 8.2 });
  });
  it('reports a defence tradeoff when more printed armour comes with a lower global multiplier', () => {
    const result = equipRaw(emptyLoadout(), 'body', MORIOR_INVICTUS_SAMPLE); if (!result.ok) throw new Error(result.error);
    const candidate = parseEquipment(MORIOR_INVICTUS_SAMPLE.replace('1532', '2000').replace('增加12(9-12)%全域', '增加11(9-12)%全域'))!;
    expect(compareCandidate(result.state, 'body', candidate).status).toBe('insufficient');
    const comparison = compareCandidate(result.state, 'body', candidate, { beforeFilledSockets: 5, afterFilledSockets: 5 });
    expect(comparison.status).toBe('tradeoff');
    expect(comparison.metrics.find((row) => row.key === 'armour')).toMatchObject({ delta: 468 });
    expect(comparison.metrics.find((row) => row.key === 'globalEnergyShieldPercent')).toMatchObject({ before: 60, after: 55, delta: -5 });
  });
  it('reads complete PoB Rune enumerations without assuming all listed sockets are filled', () => {
    const runeList = ['Rune: Perfect Iron Rune', 'Rune: Perfect Iron Rune', 'Rune: None', 'Rune: None', 'Rune: None'].join('\n');
    const text = MORIOR_INVICTUS_SAMPLE.replace('插槽: S S S S S', `Sockets: S S S S S\n${runeList}`);
    const item = parseEquipment(text)!;
    expect(item.sockets).toEqual({ count: 5, filled: 2 });
    expect(equipmentMetricDetails(item).values).toMatchObject({ fireResistance: 20, globalEnergyShieldPercent: 24 });
    expect(parseEquipment(text.replace('Rune: None\n', ''))?.sockets?.filled).toBeUndefined();
    const xml = `<PathOfBuilding2><Items activeItemSet="1"><Item id="1"><![CDATA[Rarity: UNIQUE\nMorior Invictus\nGrand Regalia\nItem Level: 84\nSockets: S S S S S\n${runeList}\n+10% to all Elemental Resistances per Socket filled]]></Item><ItemSet id="1"><Slot name="Body Armour" itemId="1"/></ItemSet></Items></PathOfBuilding2>`;
    const preview = previewPob(parsePobXml(xml), '1', false);
    expect(parseEquipment(preview.slots.body!)?.sockets).toEqual({ count: 5, filled: 2 });
  });
  it('projects only known elemental resistance contributions, keeping overcap separate from effective gains', () => {
    const result = equipRaw(emptyLoadout(), 'body', MORIOR_INVICTUS_SAMPLE); if (!result.ok) throw new Error(result.error);
    const state = result.state;
    state.character = { values: { fireResistance: 189, coldResistance: 139, lightningResistance: 113 }, caps: {}, recordedAt: '2026-10-22T00:00:00Z', equipmentSignature: equipmentSignature(state.slots) };
    const candidate = parseEquipment(MORIOR_INVICTUS_SAMPLE.replace('+10(8-10)%', '+9(8-10)%'))!;
    expect(compareCandidate(state, 'body', candidate).characterResistances).toEqual([]);
    const comparison = compareCandidate(state, 'body', candidate, { beforeFilledSockets: 5, afterFilledSockets: 5 });
    expect(comparison.characterResistances[0]).toMatchObject({ before: 189, after: 184, effectiveDelta: 0 });
    expect(comparison.status).toBe('equal');
  });
});
