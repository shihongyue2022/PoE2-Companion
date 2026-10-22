import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePobXml, previewPob } from './pobImport';
import { applyPobItemRepair, POB_REVIEW_MARKER, readOriginalLocalPob, repairPobEquipment } from './pobRepair';
import { ORDAINED_POB_ITEM, ordainedPobXml } from './fixtures/ordainedPob';
import { parseEquipment } from './genericEquipment';
import { buildEquipmentTrade, equipmentTradeRows } from './genericEquipmentTrade';
import { scoreUpgrade, upgradeComponents } from './upgradeRanking';
import type { PobSource } from './loadoutSource';
import { emptyLoadout } from './loadout';
import { equipmentSignature } from './characterPanel';

const xml = ordainedPobXml();
const current = previewPob(parsePobXml(xml), '1', false).slots.mainHand!;
function markLegacy(raw: string) {
  const mods = parseEquipment(raw)!.mods.map((mod) => mod.raw);
  return raw.split('\n').map((line) => !mods.includes(line) ? line : /\s+\((?:implicit|enchant|rune)\)$/.test(line)
    ? line.replace(/(\s+\((?:implicit|enchant|rune)\))$/, ` ${POB_REVIEW_MARKER}$1`) : `${line} ${POB_REVIEW_MARKER}`).join('\n');
}
const legacy = markLegacy(current);
const source: PobSource = { kind: 'pob', fileName: 'Original.xml', importedAt: '2026-10-22T00:00:00Z', equipmentSignature: '', setId: '1', setTitle: 'Current', secondWeapons: false };
afterEach(() => vi.unstubAllGlobals());
describe('repairing old PoB review markers from their original source', () => {
  it('restores real fixed rolls from the reported weapon and produces a nonempty weighted search', () => {
    expect(legacy.split(POB_REVIEW_MARKER)).toHaveLength(10);
    const repaired = repairPobEquipment(xml, legacy, { slot: 'mainHand', source });
    expect(repaired).toMatchObject({ remaining: 0, raw: current });
    const item = parseEquipment(repaired.raw)!;
    expect(item.mods.find((mod) => mod.ref === '#% increased Physical Damage')?.value).toBe(220);
    expect(item.mods.find((mod) => mod.ref?.includes('Critical Hit Chance'))?.value).toBe(7.2);
    const rows = equipmentTradeRows(item, 'upgrade');
    const components = upgradeComponents(rows); expect(components.length).toBeGreaterThan(1);
    expect(scoreUpgrade(item, components).score).toBeCloseTo(100);
    const query = buildEquipmentTrade({ equipment: item, league: 'Test', rows, ranking: true, exactBase: false, sameCorruption: false }).query;
    expect(query.sort).toEqual({ 'statgroup.0': 'desc' });
    expect(query.query.name).toBe('The Ordained');
    expect(query.query.stats[0]?.filters.length).toBeGreaterThan(1);
    expect(query.query.filters.misc_filters?.filters.corrupted).toBeUndefined();
  });
  it('refuses changed item rolls, changed groups and changed equipment instead of silently overwriting', () => {
    expect(() => repairPobEquipment(ordainedPobXml(ORDAINED_POB_ITEM.replace('220%', '240%')), legacy, { slot: 'mainHand', source })).toThrow('装备与当前记录不同');
    expect(() => repairPobEquipment(xml, legacy, { slot: 'mainHand', source: { ...source, setId: 'missing' } })).toThrow('装备组');
    expect(() => repairPobEquipment(xml, legacy, { slot: 'offHand', source })).toThrow('栏位');
    expect(() => repairPobEquipment(xml, current)).toThrow('没有旧版');
  });
  it('keeps genuinely uncertain catalyst and unresolved range values excluded', () => {
    const result = repairPobEquipment(ordainedPobXml(ORDAINED_POB_ITEM.replace('Quality: 21', 'Quality: 21\nCatalystQuality: 20')), legacy, { slot: 'mainHand', source });
    expect(result.remaining).toBe(9);
    expect(upgradeComponents(equipmentTradeRows(parseEquipment(result.raw)!, 'upgrade'))).toHaveLength(0);
    const unresolved = ordainedPobXml(ORDAINED_POB_ITEM.replace('220% increased Physical Damage', '(200-250)% increased Physical Damage'));
    expect(() => repairPobEquipment(unresolved, legacy)).toThrow('装备与当前记录不同');
  });
  it('allows other rarities only when the user deliberately releases the unique identity during upgrading', () => {
    const equipment = parseEquipment(current)!; const rows = equipmentTradeRows(equipment, 'upgrade');
    const broad = buildEquipmentTrade({ equipment, league: 'Test', rows, ranking: true, exactBase: false, exactUnique: false }).query;
    expect(broad.query.name).toBeUndefined(); expect(broad.query.filters.type_filters.filters.rarity).toBeUndefined();
    const price = buildEquipmentTrade({ equipment, league: 'Test', rows, exactUnique: false }).query;
    expect(price.query.filters.type_filters.filters.rarity?.option).toBe('unique');
  });
  it('reads the recorded source ID only, refusing ambiguous names and unmatched files', async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, builds: [{ id: 'a'.repeat(64), name: 'Original.xml' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, xml })));
    vi.stubGlobal('fetch', network);
    expect(await readOriginalLocalPob(source, new AbortController().signal)).toBe(xml);
    expect(JSON.parse(network.mock.calls[1]![1]!.body as string)).toEqual({ id: 'a'.repeat(64) });
    network.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, builds: [{ id: 'a'.repeat(64), name: 'folder-a/Original.xml' }, { id: 'b'.repeat(64), name: 'folder-b/Original.xml' }] })));
    await expect(readOriginalLocalPob(source, new AbortController().signal)).rejects.toThrow('唯一匹配');
  });
  it('repairs one slot without replacing goals or invalidating equivalent valid baselines', () => {
    const state = { ...emptyLoadout(), slots: { mainHand: legacy, ring1: 'untouched ring record' }, source: { ...source, equipmentSignature: '' },
      character: { values: { life: 1530 }, caps: {}, equipmentSignature: '', recordedAt: '2026-10-22T00:00:00Z' } };
    const old = equipmentSignature(state.slots); state.source.equipmentSignature = old; state.character.equipmentSignature = old;
    const next = applyPobItemRepair(state, 'mainHand', legacy, current);
    expect(next.slots.ring1).toBe(state.slots.ring1); expect(next.goals).toBe(state.goals);
    expect(next.source?.equipmentSignature).toBe(equipmentSignature(next.slots));
    expect(next.character?.equipmentSignature).toBe(equipmentSignature(next.slots));
    expect(next.character?.values.life).toBe(1530);
    expect(applyPobItemRepair({ ...state, character: { ...state.character, equipmentSignature: 'already stale' } }, 'mainHand', legacy, current).character?.equipmentSignature).toBe('already stale');
    expect(() => applyPobItemRepair(state, 'mainHand', 'changed', current)).toThrow('来源装备已变化');
  });
});
