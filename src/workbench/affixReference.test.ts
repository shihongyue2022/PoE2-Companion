import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchEquipmentStat, parseEquipment } from './genericEquipment';
import { mergeReferenceRows, readAffixReference, referenceLabel, referenceStat, type AffixReferenceResult } from './affixReference';
import { buildEquipmentTrade, equipmentTradeRows } from './genericEquipmentTrade';
import { REPLACEMENT_AFTER, REPLACEMENT_BEFORE } from './fixtures/weaponReplacement';

afterEach(() => vi.unstubAllGlobals());
describe('English facts, simplified Chinese presentation and optional missing affix conditions', () => {
  it('normalizes Chinese and English copies to the same native English affixes', () => {
    const before = parseEquipment(REPLACEMENT_BEFORE)!, after = parseEquipment(REPLACEMENT_AFTER)!;
    for (const mod of before.mods.filter((entry) => entry.ref !== '#% increased Physical Damage')) {
      const counterpart = after.mods.find((entry) => entry.ref === mod.ref)!;
      expect(counterpart.englishText).toBe(mod.englishText);
      expect(counterpart.englishText).not.toMatch(/[\u3400-\u9fff]/u);
      expect(counterpart.label).toMatch(/[\u3400-\u9fff]/u);
    }
    expect(matchEquipmentStat('可被元素地面強化的疾風技能視為\n受到點燃、感電、和冰緩地面強化').englishText).toContain('Ignited, Shocked, and Chilled Ground');
  });
  it('adds verified missing references as unchecked presence conditions, never as owned rolls', () => {
    const item = parseEquipment('Rarity: UNIQUE\nIgniferis\nCrimson Amulet\n--------\n+17% to Fire Resistance')!;
    const reference: AffixReferenceResult = { name: 'Igniferis', url: 'https://poe2db.tw/us/Igniferis', checkedAt: new Date().toISOString(), cached: false,
      modifiers: [{ english: '+(10—20)% to Fire Resistance', origin: 'explicit' }, { english: '(20—30)% increased Mana Regeneration Rate', origin: 'explicit' }] };
    const rows = equipmentTradeRows(item, 'strict'), merged = mergeReferenceRows(rows, reference);
    expect(merged).toHaveLength(rows.length + 1);
    const added = merged.find((row) => row.referenceOnly)!;
    expect(added).toMatchObject({ enabled: false, presenceOnly: true, min: '', max: '' });
    expect(added.actualValue).toBeUndefined(); expect(added.label).toContain('20—30');
    expect(mergeReferenceRows(merged, reference)).toEqual(merged);
    const query = buildEquipmentTrade({ equipment: item, league: 'Test', rows: merged.map((row) => row.referenceOnly ? { ...row, enabled: true } : row) }).query;
    const condition = query.query.stats.flatMap((group) => group.filters).find((filter) => filter.id === added.ids[0]);
    expect(condition).toEqual({ id: added.ids[0], disabled: false });
    expect(JSON.stringify(query)).not.toMatch(/[\u3400-\u9fff]/u);
    expect(item.mods).toHaveLength(1);
    expect(referenceLabel({ english: 'Adds 1 to (200—300) Lightning Damage', origin: 'explicit' })).toContain('200—300');
    expect(referenceStat({ english: 'Unverified invented effect', origin: 'explicit' }).ids).toEqual([]);
  });
  it('sends only the official English name when falling back to external references', async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, name: 'The Taming', url: 'https://poe2db.tw/us/The_Taming', checkedAt: new Date().toISOString(), cached: false,
      modifiers: [{ english: '+(10—20)% to all Elemental Resistances', origin: 'explicit' }] })));
    vi.stubGlobal('fetch', network);
    const item = parseEquipment('物品種類: 戒指\n稀有度: 傳奇\n元素之章\n三相戒指\n--------\n+26%全元素抗性')!;
    await readAffixReference(item, new AbortController().signal);
    expect(JSON.parse(network.mock.calls[0]![1]!.body as string)).toEqual({ name: 'The Taming' });
    expect(network.mock.calls[0]![1]!.body).not.toContain('26');
  });
});
