import { equipmentDisplayName, equipmentMetricDetails, localizeEquipmentName, parseEquipment, simplifyEquipmentText, type Equipment, type EquipmentMod } from './genericEquipment';
import type { LoadoutState } from './loadout';
import { activeWeaponSet, syncWeaponSets, type WeaponPair } from './weaponSets';

export interface RevisionLine { key: string; label: string; before: string; after: string; delta?: number; information?: boolean }
export interface EquipmentRevision {
  status: 'added' | 'removed' | 'modified' | 'newly-read' | 'information' | 'unchanged';
  before: Equipment | null; after: Equipment | null; lines: RevisionLine[];
  formatOnly: boolean;
}
const normalize = (text: string) => simplifyEquipmentText(text).replace(/\s*\[PoB数值待游戏文本核对\]/g, '').toLowerCase().replace(/[\s，、,：:]/g, '');
function placement(mod: EquipmentMod) {
  return /\((implicit|enchant|rune|fractured|crafted|desecrated)\)/i.exec(mod.raw)?.[1]?.toLowerCase()
    ?? ['implicit', 'enchant', 'rune', 'fractured', 'desecrated'].find((source) => mod.ids.length && mod.ids.every((id) => id.startsWith(`${source}.`))) ?? 'explicit';
}
function fact(mod: EquipmentMod) {
  return mod.ref ? JSON.stringify({ ref: mod.ref, values: mod.values.length === 1 && mod.value !== undefined ? [mod.value] : mod.values, value: mod.value, variant: mod.ref.includes('#') ? undefined : normalize(mod.englishText ?? mod.ref) }) : normalize(mod.text);
}
function modifierGroups(item: Equipment | null) {
  const groups = new Map<string, EquipmentMod[]>();
  for (const mod of item?.mods ?? []) {
    const key = `${placement(mod)}:${mod.statId ?? mod.ref ?? normalize(mod.text).replace(/[+-]?\d+(?:\.\d+)?/g, '#')}`;
    groups.set(key, [...groups.get(key) ?? [], mod]);
  }
  return groups;
}
/** Read actual printed values and modifier meaning; ignore headers, ordering,
 * ranges, layout, translations of known stats and old display-only review marks. */
export function equipmentRevision(beforeRaw: string | undefined, afterRaw: string | undefined, beforeKnown = true, afterKnown = true): EquipmentRevision {
  const parse = (raw?: string) => parseEquipment((raw ?? '').replace(/\s*\[PoB数值待游戏文本核对\]/g, ''));
  const before = parse(beforeRaw), after = parse(afterRaw), lines: RevisionLine[] = [];
  const add = (key: string, label: string, a: string | number | boolean | undefined, b: string | number | boolean | undefined, information = false) => {
    if (a === b) return;
    const format = (value: typeof a) => value === undefined ? '未记录' : typeof value === 'boolean' ? value ? '是' : '否' : String(value);
    lines.push({ key, label, before: format(a), after: format(b), information,
      ...(typeof a === 'number' && typeof b === 'number' ? { delta: Number((b - a).toFixed(6)) } : {}) });
  };
  if (!before || !after) {
    if (beforeRaw && !before || afterRaw && !after) add('raw', '未解析物品文字', beforeRaw?.trim(), afterRaw?.trim());
    else if (before || after) add('item', beforeKnown ? '装备' : '新增读取（无旧快照）', before ? equipmentDisplayName(before) : beforeKnown ? '未装备' : '未读取', after ? equipmentDisplayName(after) : afterKnown ? '未装备' : '本次未读取', !afterKnown);
  } else {
    if ((before.nameEnglish ?? normalize(before.name)) !== (after.nameEnglish ?? normalize(after.name))) add('name', '名称原文', localizeEquipmentName(before.name), localizeEquipmentName(after.name));
    if ((before.baseNameEnglish ?? before.baseName) !== (after.baseNameEnglish ?? after.baseName)) add('base', '底座', localizeEquipmentName(before.baseName), localizeEquipmentName(after.baseName));
    add('rarity', '稀有度', ({ normal: '普通', magic: '魔法', rare: '稀有', unique: '传奇', currency: '通货', gem: '宝石', card: '卡片' })[before.rarity], ({ normal: '普通', magic: '魔法', rare: '稀有', unique: '传奇', currency: '通货', gem: '宝石', card: '卡片' })[after.rarity]);
    for (const [key, label, a, b] of [
      ['quality', '品质', before.quality, after.quality], ['level', '物品等级', before.itemLevel, after.itemLevel],
      ['sockets', '插槽数量', before.sockets?.count, after.sockets?.count], ['filled', '已镶嵌数量', before.sockets?.filled, after.sockets?.filled],
    ] as const) add(key, label, a, b, a === undefined || b === undefined);
    for (const [key, label] of [['corrupted', '已腐化'], ['doubleCorrupted', '双重腐化'], ['identified', '已鉴定'], ['sanctified', '已圣化']] as const) add(key, label, !!before[key], !!after[key]);
    const propertyNames = new Set([...before.properties, ...after.properties].map((entry) => entry.name));
    for (const key of propertyNames) {
      if (/quality|socket/i.test(key)) continue;
      const a = before.properties.find((entry) => entry.name === key), b = after.properties.find((entry) => entry.name === key);
      add(`property:${key}`, b?.label ?? a!.label, a?.values.join(' / '), b?.values.join(' / '), !a || !b);
    }
    const a = modifierGroups(before), b = modifierGroups(after);
    const sources: Record<string, string> = { explicit: '词缀', implicit: '固定词缀', enchant: '附魔', rune: '符文', fractured: '破裂词缀', crafted: '工艺词缀', desecrated: '亵渎词缀' };
    for (const key of new Set([...a.keys(), ...b.keys()])) {
      const old = [...a.get(key) ?? []], next = [...b.get(key) ?? []];
      for (let index = old.length - 1; index >= 0; index--) {
        const match = next.findIndex((mod) => fact(mod) === fact(old[index]!));
        if (match >= 0) { old.splice(index, 1); next.splice(match, 1); }
      }
      if (!old.length && !next.length) continue;
      const oldValue = old[0]?.value, nextValue = next[0]?.value;
      lines.push({ key: `mod:${key}`, label: `${sources[key.split(':')[0]!] ?? '词缀'}${[...old, ...next].some((mod) => !mod.ref) ? '（未识别原文）' : ''}`,
        before: old.map((mod) => mod.label).sort().join('；') || '无此词缀', after: next.map((mod) => mod.label).sort().join('；') || '无此词缀',
        ...(old.length === 1 && next.length === 1 && oldValue !== undefined && nextValue !== undefined ? { delta: Number((nextValue - oldValue).toFixed(6)) } : {}) });
    }
  }
  const changed = lines.some((line) => !line.information);
  return { before, after, lines, status: !beforeKnown && (after || afterRaw) ? 'newly-read' : !afterKnown && before ? 'information' : !before && after ? 'added' : before && !after ? 'removed' : changed ? 'modified' : lines.length ? 'information' : 'unchanged',
    formatOnly: beforeRaw !== afterRaw && !lines.length };
}
export function revisionMetrics(before: Equipment | null, after: Equipment | null, beforeKnown = true) {
  const a = before ? equipmentMetricDetails(before) : undefined, b = after ? equipmentMetricDetails(after) : undefined;
  return { before: a?.values ?? {}, after: b?.values ?? {}, beforePending: a?.pending ?? [], afterPending: b?.pending ?? [], beforeKnown };
}
/** Comparing pair I to pair I avoids reporting a weapon switch as a purchase. */
export function revisionWeaponPair(state: LoadoutState, number: 1 | 2): WeaponPair | undefined {
  const sets = syncWeaponSets(state).weaponSets;
  if (sets) return number === 1 ? sets.first : sets.second;
  if (activeWeaponSet(state) === number) return { ...(state.slots.mainHand ? { mainHand: state.slots.mainHand } : {}), ...(state.slots.offHand ? { offHand: state.slots.offHand } : {}) };
  return state.source?.weaponSets?.[number === 1 ? 'first' : 'second'];
}
