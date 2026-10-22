import { describe, expect, it } from 'vitest';
import type { Mod, PatchData } from '../../packages/engine/src/types.ts';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch.ts';
import type { GearTrade } from '../lib/gearTrade.ts';
import { loadGearTrade } from './market.ts';
import { buildFlexibleTrade, buildTradeFilterRows, type TradeFilterRow } from './tradeSearch.ts';

const data = loadShippedPatch('data/patches/0.5.0');
const trade = await loadGearTrade();

const row = (key: string, ids: readonly string[] = [`explicit.${key}`]): TradeFilterRow => ({
  key, label: key, ids, enabled: true, min: '', max: '', origin: 'actual',
});
const search = (rows: readonly TradeFilterRow[]) => ({ league: 'Example League', baseId: 'Rings', rows });

function fixture(text: string, ranges: readonly (readonly number[])[], mappings: GearTrade['mods'][string]) {
  const mod: Mod = {
    id: 'Rings/test', source: 'normal', type: 'prefix', family: 'test', tags: [], text,
    tiers: [{ name: 'test-tier', ilvl: 1, weight: 100, ranges }],
  };
  const patch: PatchData = { patch: 'test', bases: new Map(), mods: new Map([[mod.id, mod]]) };
  const mapping: GearTrade = {
    rows: mappings.map((_, i) => ({ ids: [`explicit.test${i}`] })), mods: { [mod.id]: mappings },
  };
  return { patch, mapping, entries: [{ modId: mod.id, tierDisplay: 1 }] };
}

describe('editable official trade rows', () => {
  it('uses the verified trade IDs and actual roll without requiring any stat by default', () => {
    const rows = buildTradeFilterRows(data, trade, [{ modId: 'Rings/IncreasedLife', tierDisplay: 1 }], [
      { modId: 'Rings/IncreasedLife', lineIndex: 0, value: 137, label: '+137 to maximum Life' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ enabled: false, min: '137', max: '', actualValue: 137, origin: 'actual' });
    expect(rows[0]!.ids).toContain('explicit.stat_3299347043');
    expect(rows[0]!.label).toContain('137');
  });

  it('splits hybrid printed lines and averages damage endpoints without rounding away half points', () => {
    const { patch, mapping, entries } = fixture('Adds # to # Physical Damage\n#% increased Attack Speed',
      [[3, 4], [8, 10], [12, 14]], [[0, 0, 2], [1, 2, 1]]);
    const rows = buildTradeFilterRows(patch, mapping, entries);
    expect(rows.map((r) => r.min)).toEqual(['5.5', '12']);
    expect(rows[0]!.key).not.toBe(rows[1]!.key);
    expect(rows.every((r) => r.origin === 'tier' && !r.enabled)).toBe(true);
    const actual = buildTradeFilterRows(patch, mapping, entries, [
      { modId: 'Rings/test', lineIndex: 0, value: 6.5 },
    ]);
    expect(actual[0]).toMatchObject({ min: '6.5', origin: 'actual' });
    expect(actual[1]).toMatchObject({ min: '12', origin: 'tier' });
  });

  it('preserves negative numeric semantics and does not guess an omitted reduced-stat direction', () => {
    const { patch, mapping, entries } = fixture('#% increased Damage\n#% reduced Light Radius',
      [[-20, -10], [5, 10]], [[0, 0, 1], [1, 1, 0]]);
    const rows = buildTradeFilterRows(patch, mapping, entries);
    expect(rows[0]!.min).toBe('-20');
    expect(rows[1]!.min).toBe('');
    expect(rows[1]!.warning).toContain('数值方向');
    const verified = buildTradeFilterRows(patch, mapping, entries, [
      { modId: 'Rings/test', lineIndex: 1, value: -7 },
    ]);
    expect(verified[1]).toMatchObject({ min: '-7', origin: 'actual' });
    expect(verified[1]!.warning).toBeUndefined();
  });

  it('corrects literal damage endpoints in shipped templates and the next hybrid line offset', () => {
    const { patch, mapping, entries } = fixture('Adds # to 3 Fire damage to Attacks\n#% increased Attack Speed',
      [[28, 30], [45, 50], [12, 14]], [[0, 0, 1], [1, 1, 1]]);
    const rows = buildTradeFilterRows(patch, mapping, entries);
    expect(rows.map((r) => r.min)).toEqual(['36.5', '12']);
    for (const modId of ['Rings/FireDamage', 'Rings/LightningDamage']) {
      const mod = data.mods.get(modId)!;
      const tier = mod.tiers.at(-1)!;
      const expected = (tier.ranges[0]![0]! + tier.ranges[1]![0]!) / 2;
      expect(buildTradeFilterRows(data, trade, [{ modId, tierDisplay: 1 }])[0]!.min).toBe(String(expected));
    }
  });

  it('keeps unmapped lines visible with warnings rather than silently losing them', () => {
    const { patch, mapping, entries } = fixture('# to maximum Life\nUnknown property', [[10, 20]], [[0, 0, 1], null]);
    const rows = buildTradeFilterRows(patch, mapping, entries);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ ids: [], enabled: false });
    expect(rows[1]!.warning).toContain('尚未映射');
    expect(() => buildFlexibleTrade(search([{ ...rows[1]!, enabled: true }]))).toThrow('取消勾选');
  });
});

describe('flexible official trade query', () => {
  it('defaults to category and nonunique with any status, without locking base, level or affixes', () => {
    const result = buildFlexibleTrade(search([{ ...row('unchecked'), enabled: false }]));
    expect(result.activeCount).toBe(0);
    expect(result.query.query).toMatchObject({
      status: { option: 'any' },
      filters: { type_filters: { filters: { category: { option: 'accessory.ring' }, rarity: { option: 'nonunique' } } } },
    });
    expect(result.query.query.type).toBeUndefined();
    expect(result.query.query.filters.misc_filters).toBeUndefined();
    expect(result.query.query.stats.flatMap((g) => g.filters)).toEqual([]);
    const url = new URL(result.url);
    expect(url.origin).toBe('https://www.pathofexile.com');
    expect(decodeURIComponent(url.pathname)).toBe('/trade2/search/poe2/Example League');
    expect(JSON.parse(url.searchParams.get('q')!)).toEqual(result.query);
  });

  it('includes only enabled stats and supports independent lower, upper and presence conditions', () => {
    const result = buildFlexibleTrade(search([
      { ...row('life'), min: '100', max: '150' },
      { ...row('reduced'), max: '-2.5' }, row('presence'),
      { ...row('disabled'), enabled: false, min: 'broken' },
    ]));
    expect(result.activeCount).toBe(3);
    expect(result.query.query.stats[0]!.filters).toEqual([
      { id: 'explicit.life', value: { min: 100, max: 150 }, disabled: false },
      { id: 'explicit.reduced', value: { max: -2.5 }, disabled: false },
      { id: 'explicit.presence', disabled: false },
    ]);
  });

  it('treats aliases as alternatives inside a row and requires each selected row in all mode', () => {
    const result = buildFlexibleTrade(search([
      { ...row('life', ['explicit.life', 'fractured.life', 'explicit.life']), min: '90' },
      row('resistance', ['explicit.res', 'desecrated.res']),
    ]));
    const or = result.query.query.stats.filter((group) => group.type === 'count');
    expect(or).toHaveLength(2);
    expect(or.every((group) => group.value?.min === 1)).toBe(true);
    expect(or[0]!.filters.map((filter) => filter.id)).toEqual(['explicit.life', 'fractured.life']);
    expect(or[0]!.filters.every((filter) => filter.value?.min === 90)).toBe(true);
  });

  it('applies base, level range, status and rarity only when explicitly requested', () => {
    const result = buildFlexibleTrade({
      ...search([]), baseId: 'Amulets', baseName: '恒星项链', status: 'securable', rarity: 'rare',
      itemLevelMin: 79, itemLevelMax: 85,
    });
    expect(result.query.query.type).toBe('Stellar Amulet');
    expect(result.query.query.status.option).toBe('securable');
    expect(result.query.query.filters.misc_filters?.filters.ilvl).toEqual({ min: 79, max: 85 });
    expect(result.query.query.filters.type_filters.filters.rarity?.option).toBe('rare');
    expect(buildFlexibleTrade({ ...search([]), status: 'online' }).query.query.status.option).toBe('online');
  });

  it('reports invalid ranges and unknown categories in Chinese', () => {
    const input = search([]);
    expect(() => buildFlexibleTrade({ ...input, league: ' ' })).toThrow('赛季');
    expect(() => buildFlexibleTrade({ ...input, baseId: 'Bows' })).toThrow('戒指和项链');
    expect(() => buildFlexibleTrade({ ...input, itemLevelMin: 1.5 })).toThrow('等级');
    expect(() => buildFlexibleTrade({ ...input, itemLevelMin: 90, itemLevelMax: 80 })).toThrow('下限');
    expect(() => buildFlexibleTrade({ ...input, baseName: 'Stellar Amulet' })).toThrow('类别');
    expect(() => buildFlexibleTrade(search([{ ...row('life'), min: '100', max: '90' }]))).toThrow('下限');
    expect(() => buildFlexibleTrade(search([{ ...row('life'), min: 'Infinity' }]))).toThrow('有效数字');
    expect(() => buildFlexibleTrade(search([{ ...row('life'), min: '0x10' }]))).toThrow('有效数字');
  });
});

describe('partial matching counts rows rather than aliases', () => {
  it('uses a simple official count group when every row has one ID', () => {
    const result = buildFlexibleTrade({ ...search([row('a'), row('b'), row('c')]), matching: 'count', minMatches: 2 });
    expect(result.query.query.stats).toHaveLength(1);
    expect(result.query.query.stats[0]).toMatchObject({ type: 'count', value: { min: 2 } });
  });

  it('matches the complete alias truth table for every minimum on four rows', () => {
    const rows = Array.from({ length: 4 }, (_, i) => row(`row${i}`, [`explicit.${i}`, `fractured.${i}`]));
    for (let minimum = 1; minimum <= rows.length; minimum++) {
      const result = buildFlexibleTrade({ ...search(rows), matching: 'count', minMatches: minimum });
      // 256 combinations include listings containing both aliases of the same row. Those may only
      // satisfy one row, so a flattened count>=k across all eight aliases would fail this test.
      for (let mask = 0; mask < 256; mask++) {
        const present = new Set(rows.flatMap((r) => r.ids).filter((_, bit) => mask & (1 << bit)));
        const expected = rows.filter((r) => r.ids.some((id) => present.has(id))).length >= minimum;
        const actual = result.query.query.stats.every((group) => {
          const count = group.filters.filter((filter) => present.has(filter.id)).length;
          return group.type === 'and' ? count === group.filters.length : count >= group.value!.min;
        });
        expect(actual, `minimum=${minimum}, aliases=${mask}`).toBe(expected);
      }
    }
  });

  it('rejects invalid thresholds and oversized alias combinations instead of changing the meaning', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`row${i}`, [`explicit.${i}`, `fractured.${i}`]));
    expect(() => buildFlexibleTrade({ ...search(rows), matching: 'count', minMatches: 0 })).toThrow('整数');
    expect(() => buildFlexibleTrade({ ...search(rows), matching: 'count', minMatches: 13 })).toThrow('整数');
    expect(() => buildFlexibleTrade({ ...search(rows), matching: 'count', minMatches: 6 })).toThrow('组合过多');
  });
});
