import type { PatchData } from '../../packages/engine/src/types';
import type { GearTrade } from '../lib/gearTrade';
import { availableAffixes, affixTargetMetadata } from './equipmentAffixes';
import { matchEquipmentStat, type Equipment } from './genericEquipment';
import type { EquipmentTradeRow } from './genericEquipmentTrade';

const beltLabels: Record<string, string> = {
  '# to maximum Life': '最大生命', '# to maximum Mana': '最大魔力', '# to Armour': '护甲值',
  '# to Strength': '力量', '#% to Fire Resistance': '火焰抗性', '#% to Cold Resistance': '冰冷抗性',
  '#% to Lightning Resistance': '闪电抗性', '#% to Chaos Resistance': '混沌抗性',
  '# Life Regeneration per second': '每秒生命回复', '# to Stun Threshold': '晕眩门槛',
  '#% increased Flask Life Recovery rate': '药剂生命恢复速度', '#% increased Flask Mana Recovery rate': '药剂魔力恢复速度',
  '#% increased Flask Charges gained': '药剂充能获取', '#% reduced Flask Charges used': '减少药剂充能消耗',
  '#% increased Charm Charges gained': '护符充能获取', '#% reduced Charm Charges used': '减少护符充能消耗',
  '#% increased Charm Effect Duration': '护符效果持续时间', '# to # Physical Thorns damage': '物理荆棘伤害',
};

/** Candidate filters are separate from owned rolls. Tier bounds come exclusively
 * from the matched base's versioned pool and native official stat mapping. */
export function equipmentSearchOptions(item: Equipment, rows: readonly EquipmentTradeRow[], data?: PatchData, trade?: GearTrade | null, requestedRefs: readonly string[] = [], allowedRunes: readonly string[] = []): EquipmentTradeRow[] {
  const result = [...rows];
  result.push({ key: 'property:itemLevel', label: '物品等级', ids: [], enabled: false, min: '', max: '',
    actualValue: item.itemLevel, equipmentFilter: 'ilvl', filterGroup: 'misc_filters',
    searchPresets: [...new Set([...(item.itemLevel ? [item.itemLevel] : []), 60, 65, 75, 80, 81, 82, 84, 85, 86])].map((level) => ({
      id: `level:${level}`, label: `≥ ${level}${level === item.itemLevel ? ' · 当前物等' : ''}`, min: level,
    })) });
  if (item.slot !== 'belt' && !requestedRefs.length) return result;

  const charm = matchEquipmentStat('Has 3 Charm Slots');
  if (item.slot === 'belt' && charm.searchable) {
    const old = result.findIndex((row) => item.mods.some((mod) => row.key === `mod:${mod.key}` && mod.ref === charm.ref));
    const presets = [1, 2, 3].map((count) => ({ id: `slots:${count}`, label: `≥ ${count} 个护符栏位`, min: count }));
    if (old >= 0) result[old] = { ...result[old]!, searchPresets: presets };
    else result.push({ key: 'belt:charmSlots', label: '护符栏位', ids: charm.ids, enabled: false, min: '', max: '', suggested: true, searchPresets: presets });
  }
  for (const affix of availableAffixes(item, data, trade, allowedRunes)) {
    const { reference, mod } = affix;
    if (item.slot !== 'belt' && !requestedRefs.includes(mod.ref ?? '')) continue;
    if (!reference.tiers?.length || !mod.ref || reference.max !== undefined) continue;
    const presets = reference.tiers.filter((tier) => tier.tier <= 3).sort((a, b) => b.tier - a.tier).map((tier) => ({
      id: `tier:${tier.tier}`, label: `T${tier.tier} · ≥ ${tier.min} · 需物等 ${tier.requiredLevel}`,
      ...(tier.min === undefined ? {} : { min: tier.min }), ...(tier.max === undefined ? {} : { max: tier.max }),
    }));
    const top = reference.roll!.max;
    presets.push({ id: 'top', label: `T1 满 roll · ≥ ${top}`, min: top });
    const old = result.findIndex((row) => item.mods.some((entry) => row.key === `mod:${entry.key}` && entry.ref === mod.ref));
    const metadata = { ...affixTargetMetadata(affix, data?.patch), searchPresets: presets };
    if (old >= 0) result[old] = { ...metadata, ...result[old]!, searchPresets: presets, scoringRef: mod.ref };
    else result.push({ key: `affix:${affix.type}:${affix.family}:${mod.ref}`, label: beltLabels[mod.ref] ?? mod.label.replace(/[+-]?\d+(?:\.\d+)?/g, '#'),
      ids: mod.ids, scoringRef: mod.ref, enabled: false, min: '', max: '', suggested: true, ...metadata });
  }
  return result;
}
