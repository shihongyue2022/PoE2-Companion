import { describe, expect, it } from 'vitest';
import type { Mod, PatchData } from '../../packages/engine/src/types';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch';
import type { ExistingItem } from '../lib/engineTypes';
import type { GearTrade } from '../lib/gearTrade';
import { loadGearTrade } from './market';
import { parseWorkbenchItem } from './itemImport';
import { BREACH_RING_SAMPLE } from './fixtures/breachRing';
import { extractTradeActualStats } from './tradeActualValues';
import { buildFlexibleTrade, buildTradeFilterRows, type TradeFilterRow } from './tradeSearch';
import { buildTradePseudoRows, TRADE_PSEUDO_SOURCE } from './tradePseudo';
import { buildTopGearRows, type TopGearGrade } from './tradeTopGear';

const data = loadShippedPatch('data/patches/0.5.0');
const trade = await loadGearTrade();
const parsed = parseWorkbenchItem(data, BREACH_RING_SAMPLE)!;
const item: ExistingItem = {
  baseId: parsed.baseId!, level: parsed.level!, rarity: parsed.rarity as ExistingItem['rarity'],
  prefixes: parsed.prefixes, suffixes: parsed.suffixes,
};
const actual = extractTradeActualStats(data, trade, BREACH_RING_SAMPLE, item);
const explicit = buildTradeFilterRows(data, trade, [...item.prefixes, ...item.suffixes], actual.stats);
const rows = [...buildTradePseudoRows(explicit), ...explicit];
const get = (entries: readonly TradeFilterRow[], modId: string) => entries.find((row) => row.modId === modId)!;
const apply = (grade: TopGearGrade, keepCurrent = false, input = rows) => buildTopGearRows(data, trade, input, { grade, keepCurrent });

function fixture(text: string, ranges: readonly (readonly number[])[], mappings: GearTrade['mods'][string]) {
  const mod: Mod = {
    id: 'Rings/test', source: 'normal', type: 'prefix', family: 'test', tags: [], text,
    tiers: [{ name: 'test-tier', ilvl: 90, weight: 100, ranges }],
  };
  const patch: PatchData = { patch: 'test', bases: new Map(), mods: new Map([[mod.id, mod]]) };
  const mapping: GearTrade = {
    rows: mappings.map((_, i) => ({ ids: [`explicit.test${i}`] })), mods: { [mod.id]: mappings },
  };
  return { patch, mapping, input: buildTradeFilterRows(patch, mapping, [{ modId: mod.id, tierDisplay: 1 }]) };
}

describe('same-direction top gear references', () => {
  it('uses global T1 even when the imported item is too low-level to roll it', () => {
    expect(item.level).toBe(79);
    const selected = rows.map((row) => ({ ...row, enabled: row.modId === 'Rings/IncreasedMana' || row.modId === 'Rings/ColdResistance' }));
    const result = apply('t1', true, selected);
    expect(get(result.rows, 'Rings/IncreasedMana').min).toBe('165');
    expect(get(result.rows, 'Rings/ColdResistance').min).toBe('41');
    const document = buildFlexibleTrade({ league: 'Example', baseId: 'Rings', rows: result.rows }).query;
    expect(document.query.type).toBeUndefined();
    expect(document.query.filters.misc_filters).toBeUndefined();
    expect(document.query.stats.flatMap((group) => group.filters).map((filter) => filter.value?.min)).toContain(41);
  });

  it.each([
    ['t2', 150, 36, 26.5], ['t1', 165, 41, 31],
    ['high', 176.2, 44.2, 35.8], ['perfect', 179, 45, 37],
  ] as const)('derives %s numeric references from the requested tier and roll position', (grade, mana, cold, fire) => {
    const result = apply(grade);
    expect(Number(get(result.rows, 'Rings/IncreasedMana').min)).toBe(mana);
    expect(Number(get(result.rows, 'Rings/ColdResistance').min)).toBe(cold);
    expect(Number(get(result.rows, 'Rings/FireDamage').min)).toBe(fire);
    expect(result.rows.every((row) => row.max === '')).toBe(true);
  });

  it('protects good actual rolls without applying quality again or calling references actual values', () => {
    const snapshot = JSON.stringify(rows);
    const result = apply('t1', true);
    const fire = get(result.rows, 'Rings/FireDamage');
    const rarity = get(result.rows, 'Rings/ItemFoundRarityIncrease');
    expect(fire).toMatchObject({ min: '36.5', actualValue: 36.5, origin: 'actual' });
    // The shipped rarity mapping includes a nearby conditional rarity filter, so top mode
    // deliberately withholds a numeric claim until that ambiguous mapping is refined.
    expect(rarity).toMatchObject({ min: '', actualValue: 18, origin: 'actual' });
    expect(result.references.get(fire.key)).toMatchObject({ value: 31, label: 'T1 下限' });
    expect(result.references.get(rarity.key)?.value).toBeUndefined();
    expect(result.references.get(rarity.key)?.note).toContain('近似');
    for (let i = 0; i < rows.length; i++) {
      expect(result.rows[i]!.label).toBe(rows[i]!.label);
      expect(result.rows[i]!.enabled).toBe(rows[i]!.enabled);
    }
    expect(JSON.stringify(rows)).toBe(snapshot);
    // Reapplying a grade reads the original actual baseline, not the previous upgraded minimum.
    const lower = apply('t2', true, result.rows);
    expect(get(lower.rows, 'Rings/IncreasedMana').min).toBe('157');
    expect(apply('t1', false, result.rows).rows.find((row) => row.key === fire.key)?.min).toBe('31');
  });

  it('protects the actual top-tier roll when the trade mapping is verified', () => {
    const { patch, mapping, input } = fixture('#% increased Rarity of Items found', [[15, 18]], [[0, 0, 1]]);
    const actual = [{ ...input[0]!, actualValue: 18, origin: 'actual' as const }];
    const result = buildTopGearRows(patch, mapping, actual, { grade: 't1', keepCurrent: true });
    expect(result.rows[0]!.min).toBe('18');
    expect(result.references.get(input[0]!.key)?.value).toBe(15);
  });

  it('averages both damage endpoints and preserves following hybrid line offsets', () => {
    const { patch, mapping, input } = fixture('Adds # to 3 Fire damage to Attacks\n#% increased Attack Speed',
      [[28, 30], [45, 50], [12, 14]], [[0, 0, 1], [1, 1, 1]]);
    const high = buildTopGearRows(patch, mapping, input, { grade: 'high', keepCurrent: false });
    expect(high.rows.map((row) => row.min)).toEqual(['39.3', '13.6']);
    const perfect = buildTopGearRows(patch, mapping, input, { grade: 'perfect', keepCurrent: false });
    expect(perfect.rows.map((row) => row.min)).toEqual(['40', '14']);
    // The shipped lightning template also hard-codes the first worst-tier endpoint.
    expect(get(apply('t1').rows, 'Rings/LightningDamage').min).toBe('30.5');
  });

  it('uses the best existing tier and labels the fallback when T2 does not exist', () => {
    const { patch, mapping, input } = fixture('+# to maximum Life', [[90, 100]], [[0, 0, 1]]);
    const result = buildTopGearRows(patch, mapping, input, { grade: 't2', keepCurrent: false });
    expect(result.rows[0]!.min).toBe('90');
    expect(result.references.get(input[0]!.key)?.label).toBe('T1 下限（无 T2）');
  });

  it('aggregates top resistance references without requiring their original affix layout', () => {
    const selected = rows.map((row) => ({ ...row, enabled: row.key === 'pseudo:elemental-resistance' }));
    const result = apply('t1', true, selected);
    const pseudo = result.rows.find((row) => row.origin === 'pseudo')!;
    expect(pseudo).toMatchObject({ min: '86', actualValue: 78, origin: 'pseudo', enabled: true });
    expect(apply('high').rows.find((row) => row.key === pseudo.key)?.min).toBe('91.6');
    expect(apply('perfect').rows.find((row) => row.key === pseudo.key)?.min).toBe('93');
    expect(result.references.get(pseudo.key)?.value).toBe(86);
    const filters = buildFlexibleTrade({ league: 'Example', baseId: 'Rings', rows: result.rows }).query.query.stats.flatMap((group) => group.filters);
    expect(filters).toEqual([{ id: TRADE_PSEUDO_SOURCE.elemental, value: { min: 86 }, disabled: false }]);
    const duplicate = apply('t1', false, [...rows, ...explicit]);
    expect(duplicate.references.get(pseudo.key)?.value).toBe(86);
  });

  it('can protect a high actual pseudo total without changing its tier reference', () => {
    const input = rows.map((row) => row.origin === 'pseudo' ? { ...row, actualValue: 200 } : row);
    const result = apply('t1', true, input);
    const pseudo = result.rows.find((row) => row.origin === 'pseudo')!;
    expect(pseudo.min).toBe('200');
    expect(result.references.get(pseudo.key)?.value).toBe(86);
  });

  it('does not invent numeric upgrades for ambiguous, unmapped or unverified-direction rows', () => {
    const { patch, mapping, input } = fixture('#% reduced Light Radius\nUnknown property', [[5, 10]], [[0, 0, 0], null]);
    const selected = input.map((row) => ({ ...row, enabled: true, min: '7', max: '20' }));
    const result = buildTopGearRows(patch, mapping, selected, { grade: 'perfect', keepCurrent: true });
    expect(result.rows.every((row) => row.min === '' && row.max === '')).toBe(true);
    expect(result.rows.every((row) => row.enabled)).toBe(true);
    expect(result.warnings).toHaveLength(2);
    const ambiguous = { ...explicit[0]!, enabled: true, ambiguous: true };
    const ambiguousResult = apply('perfect', true, [ambiguous]);
    expect(ambiguousResult.rows[0]!.min).toBe('');
    expect(ambiguousResult.references.get(ambiguous.key)?.note).toContain('近似');
    expect(apply('perfect', true, [{ ...ambiguous, enabled: false }]).warnings).toEqual([]);
  });

  it('withholds pseudo references if any contributing component cannot be upgraded safely', () => {
    const input = rows.map((row) => row.modId === 'Rings/ColdResistance' ? { ...row, ambiguous: true } : row);
    const result = apply('t1', true, input);
    const pseudo = result.rows.find((row) => row.origin === 'pseudo')!;
    expect(pseudo.min).toBe('');
    expect(result.references.get(pseudo.key)).toMatchObject({ note: expect.stringContaining('组成属性') });
  });

  it('preserves signed reference semantics without taking absolute values', () => {
    const { patch, mapping, input } = fixture('#% increased Damage', [[-20, -10]], [[0, 0, 1]]);
    const selected = [{ ...input[0]!, enabled: true, actualValue: -15, origin: 'actual' as const }];
    const result = buildTopGearRows(patch, mapping, selected, { grade: 't1', keepCurrent: true });
    expect(result.rows[0]!.min).toBe('-15');
    expect(result.references.get(input[0]!.key)?.value).toBe(-20);
    expect(result.warnings[0]).toContain('有符号');
    expect(buildTopGearRows(patch, mapping, selected, { grade: 'perfect', keepCurrent: false }).rows[0]!.min).toBe('-10');
  });

  it('keeps empty inputs empty', () => {
    const result = apply('t1', true, []);
    expect(result.rows).toEqual([]);
    expect(result.references.size).toBe(0);
    expect(result.warnings).toEqual([]);
  });
});
