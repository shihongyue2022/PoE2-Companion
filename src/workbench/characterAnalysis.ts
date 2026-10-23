import { equipmentDisplayName, equipmentMetricDetails, parseEquipment } from './genericEquipment';
import { LOADOUT_SLOTS, type LoadoutState } from './loadout';
import { parsePobXml, pobImportSource, previewPob } from './pobImport';
import { samePobEquipmentFacts } from './pobRepair';
import { activeSecondWeapons } from './weaponSets';

/** Read-only contribution table: printed local defences are already included once. */
export function equipmentComposition(state: LoadoutState) {
  return LOADOUT_SLOTS.flatMap((slot) => {
    const item = parseEquipment(state.slots[slot.id] ?? '');
    if (!item) return [];
    const detail = equipmentMetricDetails(item);
    const consumable = item.slot === 'flask' || item.slot === 'charm';
    const offense = consumable ? [] : item.mods.flatMap((mod) => {
      const english = mod.englishText ?? mod.text;
      if (!/(?:damage|attack speed|cast speed|critical|penetrat|exposure|convert|grants skill|level.*(?:skill|gem))/i.test(english)) return [];
      const family = /(?:per |for each |while |against |if |when |based on|count as)/i.test(english) ? '条件／机制'
        : /(?:convert|gained as|extra .*damage)/i.test(english) ? '转化／额外伤害'
        : /(?:level.*(?:skill|gem)|grants skill)/i.test(english) ? '技能等级／赋予技能'
        : /(?:penetrat|exposure)/i.test(english) ? '穿透／曝晒'
        : /critical/i.test(english) ? '暴击'
        : /(?:attack|cast) speed/i.test(english) ? '攻击／施法速度'
        : /(?:adds? .+damage|damage .+to attacks)/i.test(english) ? '附加伤害'
        : /damage/i.test(english) ? '伤害增幅' : undefined;
      return family ? [{ family, label: mod.label || mod.raw }] : [];
    });
    return [{ slot: slot.id, label: slot.label, name: equipmentDisplayName(item), rarity: item.rarity,
      consumable, values: item.identified && !consumable ? detail.values : {},
      uncounted: detail.uncounted.length + detail.pending.length,
      effects: detail.effects.map((effect) => effect.label),
      offense,
    }];
  });
}

/** Enrich metadata only. Keep worn gear, goals, quotes and calibrated game values intact. */
export function supplementPobCombat(state: LoadoutState, xml: string): LoadoutState {
  if (!state.source) throw new Error('请先导入 PoB2 装备方案。');
  const document = parsePobXml(xml), source = state.source;
  const preview = previewPob(document, source.setId, source.secondWeapons);
  const imported = pobImportSource(document, source.setId, source.secondWeapons, preview.slots);
  if (!imported.combat?.sets.some((set) => set.groups.length)) throw new Error('文件中没有技能组，请在 PoB2 导入 Items and Skills 后保存。');
  let baseline = state.slots;
  if (activeSecondWeapons(state) !== source.secondWeapons) {
    try { baseline = Object.fromEntries(JSON.parse(source.equipmentSignature) as [string, string][]); }
    catch { baseline = {}; }
  }
  const sameGear = LOADOUT_SLOTS.every((slot) => samePobEquipmentFacts(baseline[slot.id] ?? '', preview.slots[slot.id] ?? ''));
  return { ...state, source: { ...source,
    reference: sameGear && imported.reference ? imported.reference : source.reference,
    combat: { ...imported.combat, matchesEquipment: imported.combat.matchesEquipment && sameGear } } };
}
