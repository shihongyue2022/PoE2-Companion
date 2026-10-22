import { describe, expect, it } from 'vitest';
import { buildTradePseudoRows, tradePseudoKind, TRADE_PSEUDO_SOURCE } from './tradePseudo';
import type { TradeFilterRow } from './tradeSearch';

const row = (key: string, stat: string, value: number): TradeFilterRow => ({
  key, label: key, ids: ['explicit.' + stat, 'fractured.' + stat],
  enabled: true, min: String(value), max: '', origin: 'actual', actualValue: value,
});

describe('verified official trade pseudo filters', () => {
  it('compares the supplied Breach Ring by 78 total elemental resistance without quality multiplication', () => {
    const parts = [row('全抗', 'stat_2901986750', 15), row('冰抗', 'stat_4220027924', 33)];
    expect(buildTradePseudoRows(parts)).toMatchObject([{
      key: 'pseudo:elemental-resistance', ids: [TRADE_PSEUDO_SOURCE.elemental],
      actualValue: 78, min: '78', max: '', origin: 'pseudo', enabled: false,
    }]);
    expect(parts[0]?.enabled).toBe(true);
  });

  it('counts dual elemental resistance twice, mixed chaos once, and excludes pure chaos', () => {
    const parts = [row('双抗', 'stat_2915988346', 12), row('火混', 'stat_378817135', 9), row('混沌', 'stat_2923486259', 30)];
    expect(buildTradePseudoRows(parts)[0]?.actualValue).toBe(33);
  });

  it('adds all attributes three times and dual attributes twice without counting aliases', () => {
    const all = { ...row('全属性', 'stat_1379411836', 10), ids: ['explicit.stat_1379411836', 'explicit.stat_2897413282', 'fractured.stat_1379411836'] };
    const parts = [all, row('力量', 'stat_4080418644', 25), row('敏智', 'stat_2300185227', 8)];
    expect(buildTradePseudoRows(parts)).toMatchObject([{
      key: 'pseudo:attributes', ids: [TRADE_PSEUDO_SOURCE.attributes], actualValue: 71,
    }]);
  });

  it('preserves negative rolls instead of changing their sign', () => {
    expect(buildTradePseudoRows([row('火', 'stat_3372524247', -10), row('冰', 'stat_4220027924', 5)])[0]?.actualValue).toBe(-5);
  });

  it('leaves an incomplete total unset and explains missing actual values', () => {
    const unknown = { ...row('冰', 'stat_4220027924', 30), origin: 'tier' as const, actualValue: undefined };
    expect(buildTradePseudoRows([row('火', 'stat_3372524247', 20), unknown])[0]).toMatchObject({ min: '', warning: expect.stringContaining('缺少') });
    expect(buildTradePseudoRows([unknown])).toEqual([]);
  });

  it('does not aggregate mixed aliases, existing pseudos or duplicated source rows', () => {
    const fire = row('火', 'stat_3372524247', 20);
    const total = buildTradePseudoRows([fire, fire]);
    expect(total[0]?.actualValue).toBe(20);
    expect(buildTradePseudoRows(total)).toEqual([]);
    expect(buildTradePseudoRows([{ ...fire, ids: [...fire.ids, 'explicit.unknown'] }])).toEqual([]);
    expect(tradePseudoKind(fire)).toBe('elemental-resistance');
  });
});
