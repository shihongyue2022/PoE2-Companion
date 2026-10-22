import { describe, expect, it } from 'vitest';
import { loadPatch } from '../../packages/engine/src/loadPatch.ts';
import type { PatchData } from '../../packages/engine/src/types.ts';
import type { ExistingItem } from '../lib/engineTypes.ts';
import type { GearTrade } from '../lib/gearTrade.ts';
import gearStats from '../../data/trade/gear-stats.json';
import { EXAMPLE_RING, parseWorkbenchItem } from './itemImport.ts';
import { extractTradeActualStats } from './tradeActualValues.ts';
import { BREACH_RING_SAMPLE } from './fixtures/breachRing.ts';
import { buildFlexibleTrade, buildTradeFilterRows } from './tradeSearch.ts';

const data = loadPatch('data/patches/0.5.0');
const trade = gearStats as unknown as GearTrade;

function currentItem(raw: string, patch: PatchData = data): ExistingItem {
  const parsed = parseWorkbenchItem(patch, raw)!;
  expect(parsed).not.toBeNull();
  return {
    baseId: parsed.baseId!, level: parsed.level!, rarity: parsed.rarity as ExistingItem['rarity'],
    prefixes: parsed.prefixes, suffixes: parsed.suffixes,
  };
}

describe('actual item values for trade filters', () => {
  it('uses the actual printed rolls rather than tier minima', () => {
    const raw = EXAMPLE_RING.replace('+110最大生命', '+119最大生命');
    const result = extractTradeActualStats(data, trade, raw, currentItem(raw));
    expect(result.warnings).toEqual([]);
    expect(result.stats.map(({ modId, lineIndex, value }) => ({ modId, lineIndex, value }))).toEqual([
      { modId: 'Rings/IncreasedLife', lineIndex: 0, value: 119 },
      { modId: 'Rings/FireResistance', lineIndex: 0, value: 42 },
      { modId: 'Rings/Strength', lineIndex: 0, value: 31 },
    ]);
  });

  it('reads the user\'s advanced Hant Breach Ring without range hints or a second quality multiplier', () => {
    const current = currentItem(BREACH_RING_SAMPLE);
    expect(current.prefixes).toHaveLength(3);
    expect(current.suffixes).toHaveLength(3);
    const result = extractTradeActualStats(data, trade, BREACH_RING_SAMPLE, current);
    expect(result.warnings).toEqual([]);
    expect(result.stats.map(({ modId, value }) => ({ modId, value }))).toEqual([
      { modId: 'Rings/FireDamage', value: 36.5 },
      { modId: 'Rings/LightningDamage', value: 34 },
      { modId: 'Rings/IncreasedMana', value: 157 },
      { modId: 'Rings/ItemFoundRarityIncrease', value: 18 },
      { modId: 'Rings/AllResistances', value: 15 },
      { modId: 'Rings/ColdResistance', value: 33 },
    ]);
    expect(current.prefixes[1]?.desecrated).toBe(true);
    expect(current.suffixes[0]?.fractured).toBe(true);
  });

  it('produces a strict six-stat official query that accepts the same item across mixed stat sources', () => {
    const current = currentItem(BREACH_RING_SAMPLE);
    const { stats } = extractTradeActualStats(data, trade, BREACH_RING_SAMPLE, current);
    const rows = buildTradeFilterRows(data, trade, [...current.prefixes, ...current.suffixes], stats)
      .map((row) => ({ ...row, enabled: true }));
    const result = buildFlexibleTrade({
      league: 'Forbidden Rites', baseId: current.baseId, rows, matching: 'all',
    });
    expect(result.activeCount).toBe(6);
    expect(rows.every((row) => row.origin === 'actual')).toBe(true);
    // A real copied item uses explicit, desecrated and fractured stat namespaces together.
    // Each row's alternatives must remain OR, so the missing two namespaces cannot reject it.
    const sameItem = new Map([
      ['explicit.stat_1573130764', 36.5],
      ['desecrated.stat_1754445556', 34],
      ['explicit.stat_1050105434', 157],
      ['fractured.stat_3917489142', 18],
      ['explicit.stat_2901986750', 15],
      ['explicit.stat_4220027924', 33],
    ]);
    const scalarByAlias = new Map(rows.flatMap((row) =>
      row.ids.map((id): [string, number] => [id, row.actualValue!])));
    const groups = result.query.query.stats.filter((group) => group.filters.length > 0);
    expect(groups).toHaveLength(6);
    for (const group of groups) {
      expect(group.type).toBe('count');
      expect(group.value?.min).toBe(1);
      for (const filter of group.filters) {
        expect(scalarByAlias.has(filter.id)).toBe(true);
        expect(filter.value?.min).toBeLessThanOrEqual(scalarByAlias.get(filter.id)!);
        expect(filter.value?.max).toBeUndefined();
      }
      expect(group.filters.some((filter) => {
        const actual = sameItem.get(filter.id);
        return actual !== undefined && actual >= (filter.value?.min ?? -Infinity)
          && actual <= (filter.value?.max ?? Infinity);
      })).toBe(true);
    }
    expect(result.query.query.type).toBeUndefined();
    expect(result.query.query.filters.misc_filters).toBeUndefined();
    expect(JSON.parse(new URL(result.url).searchParams.get('q')!)).toEqual(result.query);
  });

  it('does not reuse old rolls after changing a tier, a modifier, or an item restriction', () => {
    const current = currentItem(EXAMPLE_RING);
    const mutations: ExistingItem[] = [
      { ...current, prefixes: [{ ...current.prefixes[0]!, tierDisplay: 2 }] },
      { ...current, suffixes: current.suffixes.slice(1) },
      { ...current, suffixes: current.suffixes.map((entry) => ({ ...entry, fractured: true })) },
      { ...current, level: 80 },
      { ...current, baseId: 'Amulets' },
    ];
    for (const mutation of mutations) {
      const result = extractTradeActualStats(data, trade, EXAMPLE_RING, mutation);
      expect(result.stats).toEqual([]);
      expect(result.warnings.join(' ')).toContain('不同于粘贴原文');
    }
  });

  it('does not mistake sorting the same modifiers for a changed item', () => {
    const current = currentItem(EXAMPLE_RING);
    const result = extractTradeActualStats(data, trade, EXAMPLE_RING, {
      ...current, suffixes: [...current.suffixes].reverse(),
    });
    expect(result.stats).toHaveLength(3);
    expect(result.warnings).toEqual([]);
  });

  it('retains a negative actual roll with its sign', () => {
    const mod = data.mods.get('Rings/FireResistance')!;
    const patch: PatchData = {
      ...data,
      mods: new Map(data.mods).set(mod.id, {
        ...mod, tiers: [{ ...mod.tiers[0]!, ranges: [[-30, -1]] }],
      }),
    };
    const raw = EXAMPLE_RING.replace('+42%火焰抗性', '-12%火焰抗性');
    const result = extractTradeActualStats(patch, trade, raw, currentItem(raw, patch));
    expect(result.stats.find((stat) => stat.modId === mod.id)?.value).toBe(-12);
  });

  it('uses presence-only fallback when the official numeric direction has not been verified', () => {
    const uncertainTrade: GearTrade = {
      ...trade, mods: { ...trade.mods, 'Rings/FireResistance': [[0, 0, 0]] },
    };
    const result = extractTradeActualStats(data, uncertainTrade, EXAMPLE_RING, currentItem(EXAMPLE_RING));
    expect(result.stats.some((stat) => stat.modId === 'Rings/FireResistance')).toBe(false);
    expect(result.stats).toHaveLength(2);
  });

  it('refuses a partial import instead of treating recognized lines as a complete match', () => {
    const raw = EXAMPLE_RING + '\n尚未识别的额外属性';
    const result = extractTradeActualStats(data, trade, raw, currentItem(raw));
    expect(result.stats).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });

  it('does not show a stale-text warning for manually assembled items with no pasted text', () => {
    expect(extractTradeActualStats(data, trade, '', currentItem(EXAMPLE_RING)))
      .toEqual({ stats: [], warnings: [] });
  });

  it('refuses unresolved affix ambiguity even when the remaining imported modifiers match', () => {
    const raw = EXAMPLE_RING.replace('+110最大生命', '增加16%找到的物品稀有度');
    const result = extractTradeActualStats(data, trade, raw, currentItem(raw));
    expect(result.stats).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });
});
