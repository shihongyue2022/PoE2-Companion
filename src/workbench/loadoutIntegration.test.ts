import { afterEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { BOOTS_SAMPLE, BOOTS_UPGRADE } from './fixtures/fullGear';
import { emptyLoadout, deserializeLoadout, serializeLoadout } from './loadout';
import { applyPobLoadout, chooseComparisonSlot, loadoutAssetInputs, loadoutChanges, loadoutUpgradeRows, sourceIsCurrent } from './loadoutIntegration';
import { parsePobXml, pobImportSource, previewPob } from './pobImport';
import { equipmentSignature } from './characterPanel';
import { canonicalQuoteCurrency, currentLoadoutQuotes } from './loadoutQuotes';
import { parseEquipment } from './genericEquipment';
import { equipmentTradeRows } from './genericEquipmentTrade';
import { addLoadoutAssets, emptyFinance, readFinance } from './finance';

const xml = `<PathOfBuilding2><Build level="87" className="Witch" ascendClassName="Lich" targetVersion="0_5">
<PlayerStat stat="Life" value="1530"/><PlayerStat stat="EnergyShield" value="4898"/><PlayerStat stat="FireResistTotal" value="189"/><PlayerStat stat="FireResistMax" value="75"/>
<PlayerStat stat="ColdResist" value="75"/><PlayerStat stat="FullDPS" value="123456"/><MinionStat stat="Life" value="9999999"/>
</Build><Items activeItemSet="1"><Item id="7"><![CDATA[Rarity: RARE
Dawn Loop
Amethyst Ring
Item Level: 82
Implicits: 1
+12% to Chaos Resistance
+80 to maximum Life]]></Item><ItemSet id="1" title="Current"><Slot name="Ring 1" itemId="7"/></ItemSet><ItemSet id="2" title="Other"><Slot name="Ring 1" itemId="7"/></ItemSet></Items></PathOfBuilding2>`;
afterEach(() => vi.unstubAllGlobals());
describe('shared character data integrations', () => {
  it('imports verified PoB profile and player outputs without using minion stats or capped resistances as totals', () => {
    const doc = parsePobXml(xml), preview = previewPob(doc, '1', false);
    const source = pobImportSource(doc, '1', false, preview.slots, { name: 'Character.xml', modifiedAt: '2026-10-22T10:00:00Z' });
    expect(source).toMatchObject({ level: 87, className: 'Witch', fileName: 'Character.xml', reference: { values: { life: 1530, energyShield: 4898, fireResistance: 189 }, caps: { fireResistance: 75 }, fullDps: 123456 } });
    expect(source.reference?.values.coldResistance).toBeUndefined();
    expect(pobImportSource(doc, '2', false, preview.slots).reference).toBeUndefined();
    expect(pobImportSource(doc, '1', true, preview.slots).reference).toBeUndefined();
    const imported = applyPobLoadout(emptyLoadout(), preview.slots, source);
    expect(sourceIsCurrent(imported)).toBe(true);
    expect(imported.character).toBeUndefined();
    expect(deserializeLoadout(serializeLoadout(imported)).state?.source).toEqual(source);
    expect(sourceIsCurrent({ ...imported, slots: {} })).toBe(false);
  });
  it('preserves goals and one prior import, clears game calibration and compares confirmed gear changes', () => {
    const old = { ...emptyLoadout(), slots: { boots: BOOTS_SAMPLE }, character: { values: { life: 1530 }, caps: {}, equipmentSignature: equipmentSignature({ boots: BOOTS_SAMPLE }), recordedAt: new Date().toISOString() } };
    const next = applyPobLoadout(old, { boots: BOOTS_UPGRADE });
    expect(next.previous?.slots).toEqual(old.slots); expect(next.character).toBeUndefined(); expect(next.goals).toEqual(old.goals);
    expect(loadoutChanges(old, next).metrics).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'life', delta: 20 })]));
    expect(deserializeLoadout(serializeLoadout(next)).state?.previous?.slots).toEqual(old.slots);
  });
  it('keeps ring-side choices and character priorities bound to the actual source item', () => {
    const raw = previewPob(parsePobXml(xml), '1', false).slots.ring1!;
    const state = { ...emptyLoadout(), slots: { ring1: raw, ring2: raw, boots: BOOTS_SAMPLE } };
    expect(chooseComparisonSlot(state, parseEquipment(raw)!, 'ring2')).toBe('ring2');
    const item = parseEquipment(BOOTS_SAMPLE)!, rows = equipmentTradeRows(item, 'upgrade');
    const context = { state, slot: 'boots' as const, raw: BOOTS_SAMPLE };
    expect(loadoutUpgradeRows(rows, item, context).find((row) => row.label.includes('生命'))?.weight).toBe('0');
    expect(loadoutUpgradeRows(rows, item, { ...context, state: { ...state, goals: { ...state.goals, objective: 'balanced' } } }).find((row) => row.label.includes('生命'))?.weight).toBe('3');
    expect(loadoutUpgradeRows(rows, item, { ...context, raw: BOOTS_UPGRADE })).toEqual(rows);
  });
  it('rejects stale/wrong-league quotes, deduplicates held assets and never generates transactions or overrides existing marks', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const quote = { itemText: BOOTS_SAMPLE, league: 'Test', amount: 10, currency: 'divine' as const, at: new Date().toISOString(), url: 'https://www.pathofexile.com/trade2', conditions: 'limited listing reference' };
    const state = { ...emptyLoadout(), slots: { boots: BOOTS_SAMPLE }, quotes: { boots: quote } };
    expect(currentLoadoutQuotes(state, 'Other')).toHaveLength(0);
    expect(currentLoadoutQuotes({ ...state, slots: { boots: BOOTS_UPGRADE } }, 'Test')).toHaveLength(0);
    const inputs = await loadoutAssetInputs(state, 'Test', 'exalted');
    expect(inputs[0]).toMatchObject({ price: 10, currency: 'divine', quantity: 1 });
    const first = addLoadoutAssets(emptyFinance(), 'Test', inputs);
    expect(first.added).toBe(1); expect(first.state.entries).toEqual([]); expect(first.state.valuations).toEqual([]);
    const second = addLoadoutAssets(first.state, 'Test', inputs.map((row) => ({ ...row, price: 999 })));
    expect(second.added).toBe(0); expect(second.state.assets[0]?.price).toBe(10);
    const refreshed = addLoadoutAssets({ ...second.state, assets: second.state.assets.map((asset) => ({ ...asset, quantity: 7 })) }, 'Test', inputs.map((row) => ({ ...row, price: 12 })), true);
    expect(refreshed.updated).toBe(1); expect(refreshed.state.assets[0]).toMatchObject({ quantity: 7, price: 12 });
    expect(refreshed.state.valuations).toEqual([]); expect(refreshed.state.entries).toEqual([]);
    expect(readFinance(JSON.stringify(second.state)).assets[0]?.source?.itemKey).toMatch(/^[a-f0-9]{64}$/);
    expect(addLoadoutAssets(second.state, 'Other', inputs).added).toBe(1);
    expect(canonicalQuoteCurrency('constructor')).toBeUndefined();
    expect(canonicalQuoteCurrency('perfect-exalted-orb')).toBe('exalt_perfect');
  });
});
