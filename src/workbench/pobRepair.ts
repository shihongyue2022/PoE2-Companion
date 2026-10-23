import { parseEquipment, type Equipment } from './genericEquipment';
import { requireLocalService } from './workbenchRuntime';
import { parsePobXml, previewPob } from './pobImport';
import type { LoadoutSlot, LoadoutState } from './loadout';
import type { PobSource } from './loadoutSource';
import { equipmentSignature } from './characterPanel';
import { syncWeaponSets } from './weaponSets';

export const POB_REVIEW_MARKER = '[PoB数值待游戏文本核对]';
const withoutMarker = (raw: string) => raw.split(POB_REVIEW_MARKER).join('').trim();
/** Compare item facts, never trust an old review marker alone as permission to remove it.
 * Rune names may be restored metadata, but printed properties, rolls and placements must agree. */
function identity(item: Equipment) {
  return JSON.stringify({ name: item.nameEnglish ?? item.name, base: item.baseNameEnglish ?? item.baseName,
    rarity: item.rarity, category: item.category, level: item.itemLevel, quality: item.quality,
    identified: item.identified, corrupted: item.corrupted, twice: !!item.doubleCorrupted, sanctified: !!item.sanctified,
    sockets: item.sockets?.count,
    properties: item.properties.map((row) => `${row.name}:${row.values.join(',')}`).sort(),
    mods: item.mods.map((row) => JSON.stringify({ text: row.text, source: /\((rune|implicit|enchant|fractured|desecrated)\)/i.exec(row.raw)?.[1]?.toLowerCase() })).sort(),
  });
}
export function samePobEquipmentFacts(left: string, right: string): boolean {
  if (!left || !right) return left === right;
  const before = parseEquipment(withoutMarker(left)), after = parseEquipment(withoutMarker(right));
  return !!before && !!after && identity(before) === identity(after);
}
export function repairPobEquipment(xml: string, originalRaw: string, context?: { slot: LoadoutSlot; source?: PobSource }): { raw: string; remaining: number } {
  if (!originalRaw.includes(POB_REVIEW_MARKER)) throw new Error('当前物品没有旧版 PoB 待核对标记。');
  const original = parseEquipment(withoutMarker(originalRaw));
  if (!original) throw new Error('当前装备文本无法识别，请重新复制游戏物品。');
  const document = parsePobXml(xml);
  let raws: string[];
  if (context?.source) {
    const preview = previewPob(document, context.source.setId, context.source.secondWeapons);
    const raw = preview.slots[context.slot];
    if (!raw) throw new Error('原装备组或栏位已变化，请回到角色装备预览整套导入。');
    raws = [raw];
  } else raws = Object.values(document.items).map((item) => item.raw);
  const matching = [...new Set(raws)].filter((raw) => {
    const candidate = parseEquipment(withoutMarker(raw));
    return candidate && identity(candidate) === identity(original);
  });
  if (matching.length !== 1) throw new Error(matching.length ? '原文件有多件相似装备，请回到角色装备选择准确的装备组重新导入。' : '原 PoB2 中的装备与当前记录不同，未覆盖。请先在角色装备页预览更新，或重新复制游戏物品。');
  const raw = matching[0]!;
  return { raw, remaining: raw.split(POB_REVIEW_MARKER).length - 1 };
}

/** A verified reparse changes text, not worn equipment. Keep valid measured/saved baselines
 * attached to the equivalent item; already stale baselines remain stale. */
export function applyPobItemRepair(state: LoadoutState, slot: LoadoutSlot, expectedRaw: string, raw: string): LoadoutState {
  if (state.slots[slot] !== expectedRaw) throw new Error('来源装备已变化，请重新打开此栏搜索。');
  const before = parseEquipment(withoutMarker(expectedRaw)), after = parseEquipment(withoutMarker(raw));
  if (!before || !after || identity(before) !== identity(after)) throw new Error('重新识别结果与原装备不符，未覆盖。');
  const slots = { ...state.slots, [slot]: raw }, quotes = { ...state.quotes }; delete quotes[slot];
  const previous = equipmentSignature(state.slots), signature = equipmentSignature(slots);
  return syncWeaponSets({ ...state, slots, quotes,
    source: state.source?.equipmentSignature === previous ? { ...state.source, equipmentSignature: signature } : state.source,
    character: state.character?.equipmentSignature === previous ? { ...state.character, equipmentSignature: signature } : state.character,
  });
}

export async function readOriginalLocalPob(source: PobSource, signal: AbortSignal, requireSameSnapshot = false): Promise<string> {
  requireLocalService();
  if (!source.fileName) throw new Error('未记录原文件名，请选择原 PoB2 XML 文件进行核对。');
  const response = await fetch('/api/workbench/pob/builds', { signal });
  if (!response.ok) throw new Error('无法读取本机 PoB2，请保持工坊后台运行，或选择原 XML 文件。');
  const value: unknown = await response.json();
  const object = (item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item);
  if (!object(value) || value.ok !== true || !Array.isArray(value.builds) || value.builds.length > 100) throw new Error('本机 PoB2 列表格式不正确。');
  const basename = (name: string) => name.split(/[\\/]/).pop()!;
  const builds = value.builds.filter((entry): entry is { id: string; name: string } => object(entry) && typeof entry.id === 'string' && /^[a-f0-9]{64}$/.test(entry.id)
    && typeof entry.name === 'string' && entry.name.length <= 500 && (entry.name === source.fileName || basename(entry.name) === source.fileName));
  if (builds.length !== 1) throw new Error('没有找到唯一匹配的本机原文件，请选择原 PoB2 XML 文件进行核对。');
  const build = await fetch('/api/workbench/pob/build', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: builds[0]!.id }) });
  if (!build.ok) throw new Error('原 PoB2 文件无法读取，请刷新角色列表或选择 XML。');
  const data: unknown = await build.json();
  if (!object(data) || data.ok !== true || typeof data.xml !== 'string' || data.xml.length > 3_000_000) throw new Error('原 PoB2 XML 格式不正确或超过大小限制。');
  if (requireSameSnapshot && (!source.savedAt || typeof data.modifiedAt !== 'string' || Date.parse(source.savedAt) !== Date.parse(data.modifiedAt))) throw new Error('原 PoB2 存档已更新或缺少保存时间，请点击“保存后重新读取”，预览并确认角色更新。');
  return data.xml;
}
