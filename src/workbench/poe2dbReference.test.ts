import { describe, expect, it } from 'vitest';
import { equipmentMetricDetails, matchEquipmentStat, parseEquipment } from './genericEquipment';
import { equipmentPoe2dbLinks, POE2DB_MODIFIERS } from './poe2dbReference';
import { equipmentTradeRows } from './genericEquipmentTrade';

describe('PoE2DB cross checks without invented trading or combat values', () => {
  it.each(['Grants Skill: Spear Throw', '賦予技能: 長矛投擲', 'local display grants spear throw skill [1]'])(
    'recognizes the confirmed display flag %s separately from trading support', (text) => {
      expect(matchEquipmentStat(text)).toMatchObject({ recognized: true, searchable: false, ids: [], values: [],
        statId: 'local_display_grants_spear_throw_skill', ref: 'Grants Skill: Spear Throw',
        referenceUrl: 'https://poe2db.tw/us/The_Ordained' });
      expect(matchEquipmentStat(text).value).toBeUndefined();
    });
  it('keeps unresolved rolls and unrelated text unrecognized', () => {
    for (const text of ['Grants Skill: Spear Throw [PoB数值待游戏文本核对]', 'local display grants spear throw skill [2]', '未核对的新技能']) {
      expect(matchEquipmentStat(text).recognized).not.toBe(true);
      expect(matchEquipmentStat(text).ids).toEqual([]);
    }
  });
  it('preserves local and global defence semantics when attaching the same item reference', () => {
    const item = parseEquipment(`Rarity: UNIQUE
Morior Invictus
Grand Regalia
--------
Armour: 1532
Evasion Rating: 1409
Energy Shield: 433
Sockets: S S S S S
--------
增加398%護甲值、閃避和能量護盾
每鑲嵌一個插槽，增加12%全域護甲、閃備與能量護盾`)!;
    expect(item.mods.every((mod) => mod.referenceUrl === 'https://poe2db.tw/us/Morior_Invictus')).toBe(true);
    expect(item.mods[0]!.ids).toContain('explicit.stat_3523867985');
    expect(item.mods[1]!.ids).toContain('explicit.stat_933768533');
    const metrics = equipmentMetricDetails(item, { filledSockets: 5 }).values;
    expect(metrics.armour).toBe(1532);
    expect(Object.values(metrics)).toContain(60);
  });
  it('keeps display-only skills out of generated trade rows and offers direct references', () => {
    const item = parseEquipment('Rarity: UNIQUE\nThe Ordained\nGrand Spear\n--------\nGrants Skill: Spear Throw\n220% increased Physical Damage')!;
    expect(equipmentTradeRows(item, 'upgrade')).toHaveLength(1);
    expect(item.warnings.join(' ')).toContain('效果已识别');
    expect(item.warnings.join(' ')).not.toContain('文字尚未');
    expect(equipmentPoe2dbLinks(item)).toEqual([
      { label: 'PoE2DB 词缀总表', url: POE2DB_MODIFIERS },
      { label: '这件传奇的词缀与机制', url: 'https://poe2db.tw/us/The_Ordained' },
      { label: '当前底座资料', url: 'https://poe2db.tw/us/Grand_Spear' },
    ]);
  });
});
