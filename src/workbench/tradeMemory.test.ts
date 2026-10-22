import { describe, expect, it, vi } from 'vitest';
import { rememberTrade, readTradeMemory, removeTradeMemory, clearTradeHistory, tradeMemoryUrl, TRADE_MEMORY_KEY } from './tradeMemory';
import { buildEquipmentTrade, equipmentTradeRows } from './genericEquipmentTrade';
import { parseEquipment } from './genericEquipment';
import { BOOTS_SAMPLE } from './fixtures/fullGear';

const equipment = parseEquipment(BOOTS_SAMPLE)!;
const query = buildEquipmentTrade({ equipment, league: 'Test', rows: equipmentTradeRows(equipment, 'strict') }).query;
const input = { query, league: 'Test', raw: BOOTS_SAMPLE, title: '冰法靴子' };
const observation = { at: '2026-10-22T10:00:00.000Z', message: '参考 2–4 神圣石', detail: '挂牌样本，非成交价', failed: false };

describe('local trade search memory', () => {
  it('preserves exact conditions and original league in official links, including weighted sort and budget', () => {
    const weighted = buildEquipmentTrade({ equipment, league: 'Old League', rows: equipmentTradeRows(equipment, 'upgrade'), ranking: true, budget: '30', budgetCurrency: 'divine' }).query;
    expect(rememberTrade({ ...input, query: weighted, league: 'Old League' }, { save: true, folder: '升级' })).toBe('');
    const stored = readTradeMemory()[0]!;
    const url = new URL(tradeMemoryUrl(stored));
    expect(url.origin).toBe('https://www.pathofexile.com');
    expect(url.pathname).toContain('Old%20League');
    expect(JSON.parse(url.searchParams.get('q')!)).toEqual(weighted);
    expect(stored.query.sort).toEqual({ 'statgroup.0': 'desc' });
    expect(stored.query.query.filters.trade_filters?.filters.price.max).toBe(30);
  });
  it('deduplicates identical queries and keeps names, folders and failures when refreshing history', () => {
    rememberTrade(input, { save: true, folder: '冰法' });
    rememberTrade({ ...input, title: '自动标题' }, { observation });
    const first = readTradeMemory()[0]!;
    expect(first.title).toBe('冰法靴子'); expect(first.folder).toBe('冰法');
    rememberTrade(input, { observation: { ...observation, message: '需要登录', failed: true } });
    expect(readTradeMemory()).toHaveLength(1);
    expect(readTradeMemory()[0]!.observation).toMatchObject({ message: '需要登录', failed: true });
    expect(readTradeMemory()[0]!.id).toBe(first.id);
  });
  it('clears only unsaved history and reads latest storage for every mutation', () => {
    rememberTrade(input, { observation });
    const second = { ...input, league: 'Another' };
    rememberTrade(second, { save: true, folder: '保留' });
    clearTradeHistory();
    expect(readTradeMemory().map((entry) => entry.league)).toEqual(['Another']);
    removeTradeMemory(readTradeMemory()[0]!.id);
    expect(readTradeMemory()).toEqual([]);
  });
  it('bounds history and bookmarks, rejects corrupted entries and reports storage failures', () => {
    for (let i = 0; i < 90; i++) rememberTrade({ ...input, league: `L${i}` }, { observation });
    expect(readTradeMemory()).toHaveLength(80);
    localStorage.clear();
    for (let i = 0; i < 40; i++) expect(rememberTrade({ ...input, league: `L${i}` }, { save: true })).toBe('');
    expect(rememberTrade(input, { save: true })).toContain('最多收藏 40');
    expect(readTradeMemory()).toHaveLength(40);
    const valid = readTradeMemory()[0]!;
    localStorage.setItem(TRADE_MEMORY_KEY, JSON.stringify([null, { ...valid, query: { query: {} } }, { ...valid, observation: { message: {} } }, valid]));
    expect(readTradeMemory()).toHaveLength(1);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
    try { expect(rememberTrade(input)).toContain('无法保存查价记录'); } finally { spy.mockRestore(); }
  });
});
