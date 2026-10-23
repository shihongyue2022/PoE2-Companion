import { describe, expect, it } from 'vitest';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch';
import { loadGearTrade } from '../lib/gearTrade';
import { parseEquipment } from './genericEquipment';
import { addResistanceAffixRows, affixStructure, availableAffixes, rareAlternative } from './equipmentAffixes';
import { damageState } from './fixtures/damageGoal';
import { equipmentSignature } from './characterPanel';
import { upgradeSearchRows } from './upgradeWorkflow';
import { buildEquipmentTrade } from './genericEquipmentTrade';
import { rollGuides } from './searchGuidance';
import { affixSearchChoices } from './AffixSearchChoice';

const data = loadShippedPatch('data/patches/0.5.0'), trade = await loadGearTrade();
export const rareBelt = 'Rarity: Rare\nSynthetic Belt\nRawhide Belt\n--------\nItem Level: 84\n--------\n+20% to Chaos Resistance\n+60 to maximum Life';
export function beltContext(raw = rareBelt) {
  const state = damageState(); state.slots = { belt: raw };
  state.source!.equipmentSignature = state.character!.equipmentSignature = equipmentSignature(state.slots);
  state.character!.values = { fireResistance: 150, coldResistance: 150, lightningResistance: 150, chaosResistance: 70 };
  return { state, slot: 'belt' as const, raw };
}
describe('base-specific recommended affixes and occupancy', () => {
  it('looks up real belt chaos suffix tiers and adds the missing item requirement, keeping four resist totals separate', () => {
    const context = beltContext(), item = parseEquipment(rareBelt)!;
    const catalogue = availableAffixes(item, data, trade), chaos = catalogue.find((entry) => entry.mod.ref === '#% to Chaos Resistance')!;
    expect(chaos.type).toBe('suffix');
    expect(chaos.reference).toMatchObject({ roll: { min: 24, max: 27 }, requiredLevel: 81 });
    expect(chaos.reference.tiers).toHaveLength(6);
    const rows = upgradeSearchRows(item, context, data, trade);
    const goal = rows.find((row) => row.key === 'goal:chaosResistance')!;
    expect(goal).toMatchObject({ enabled: true, locked: true, min: '25', weight: '0' }); // 75 - 70 + 20 from the removed old belt.
    expect(rows.filter((row) => row.key.startsWith('goal:'))).toHaveLength(1);
    const suggested = rows.find((row) => row.recommendation?.startsWith('补混沌抗性：'))!;
    expect(suggested).toMatchObject({ affixType: 'suffix', targetRange: { min: 24, max: 27 } });
    expect(suggested.targetTiers).toHaveLength(6);
    const query = buildEquipmentTrade({ equipment: item, league: 'Test', rows, ranking: true, constraintOnly: true }).query;
    expect(JSON.stringify(query)).toContain('pseudo.pseudo_total_chaos_resistance');
    expect(JSON.stringify(query)).not.toMatch(/[\u3400-\u9fff]/u);
  });
  it('adds absent chaos without falsely requiring a single affix and exposes tier choices when enabled', () => {
    const raw = rareBelt.replace('+20% to Chaos Resistance\n', ''), context = beltContext(raw), item = parseEquipment(raw)!;
    context.state.character!.values.chaosResistance = 57;
    const rows = upgradeSearchRows(item, context, data, trade), suggested = rows.find((row) => row.key === 'need:chaosResistance')!;
    expect(suggested).toMatchObject({ enabled: false, actualValue: 0, affixType: 'suffix', weight: '0' });
    expect(rows.find((row) => row.key === 'goal:chaosResistance')?.min).toBe('18');
    const guides = rollGuides(item, null, undefined, rows), choices = affixSearchChoices(suggested, guides.get(suggested.key));
    expect(choices.find((row) => row.id === 't1')?.min).toBe('24');
    expect(choices.find((row) => row.id === 'max')?.min).toBe('27');
    expect(choices.some((row) => row.id === 'current')).toBe(false);
    expect(addResistanceAffixRows(rows, item, context, availableAffixes(item, data, trade), data.patch).filter((row) => row.key === suggested.key)).toHaveLength(1);
  });
  it('never fabricates tiers for unique/unknown bases and excludes unique mechanisms from explicitly requested rare alternatives', () => {
    const unique = parseEquipment('Rarity: Unique\nMidnight Braid\nRawhide Belt\n--------\n+41 to maximum Mana\n50% of Damage taken Recouped as Mana')!;
    expect(availableAffixes(unique, data, trade)).toEqual([]);
    const rare = rareAlternative(unique, data, trade);
    expect(rare.mods.some((mod) => /Recouped/.test(mod.ref ?? ''))).toBe(false);
    expect(availableAffixes(rare, data, trade).some((row) => row.mod.ref === '#% to Chaos Resistance')).toBe(true);
    expect(availableAffixes({ ...rare, baseNameEnglish: 'Unknown Belt' }, data, trade)).toEqual([]);
    expect(affixStructure(unique, data).title).toContain('传奇固定');
  });
  it('counts modifier blocks rather than printed lines, and refuses to infer full affixes from ordinary copy', () => {
    const raw = 'Rarity: Rare\nSynthetic Loop\nGold Ring\n--------\n{ Prefix Modifier }\n+50 to maximum Life\n+20 to maximum Mana\n{ Suffix Modifier }\n+20% to Fire Resistance\n+20% to Cold Resistance';
    const item = parseEquipment(raw)!;
    expect(item.mods).toHaveLength(4);
    expect(affixStructure(item, data)).toMatchObject({ prefixes: 1, suffixes: 1, complete: true });
    expect(affixStructure(parseEquipment(raw.replace(/\{[^}]+\}\n/g, ''))!, data).complete).toBe(false);
    expect(affixStructure(parseEquipment(raw)!, data).title).toContain('空余 2 前缀 / 2 后缀');
  });
  it('does not invent a missing resistance requirement when the panel baseline is unknown', () => {
    const context = beltContext(); delete context.state.character!.values.chaosResistance;
    expect(upgradeSearchRows(parseEquipment(rareBelt)!, context, data, trade).some((row) => row.key === 'need:chaosResistance' || row.key === 'goal:chaosResistance')).toBe(false);
  });
});
