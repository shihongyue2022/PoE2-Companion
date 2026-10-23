import { emptyLoadout, equipRaw, slotLabel, type LoadoutSlot, type LoadoutState } from './loadout';
import { equipmentDisplayName, parseEquipment } from './genericEquipment';
import type { PobSource } from './loadoutSource';
import { equipmentSignature } from './characterPanel';
import { parsePobCombat } from './pobCombat';
import { weaponPair } from './weaponSets';

const MAX_XML = 3_000_000;
const MAX_CODE = 1_500_000;
export interface PobItem { id: string; raw: string; warnings: string[] }
export interface PobSet { id: string; title: string; secondWeapons: boolean; slots: { name: string; itemId: string }[] }
export interface PobDocument { items: Record<string, PobItem>; sets: PobSet[]; activeSet: string; profile?: Pick<PobSource, 'className' | 'ascendancy' | 'level' | 'version' | 'reference' | 'combat'> }
export interface PobPreview { slots: LoadoutState['slots']; imported: string[]; warnings: string[] }
const slotMap: Record<string, LoadoutSlot> = {
  'Weapon 1': 'mainHand', 'Weapon 2': 'offHand', Helmet: 'helmet', 'Body Armour': 'body',
  Gloves: 'gloves', Boots: 'boots', Amulet: 'amulet', 'Ring 1': 'ring1', 'Ring 2': 'ring2', Belt: 'belt',
  'Flask 1': 'flask1', 'Flask 2': 'flask2', 'Charm 1': 'charm1', 'Charm 2': 'charm2', 'Charm 3': 'charm3',
};

/** Decode locally, with a limit while streaming rather than after allocating the whole expansion. */
export async function decodePob(input: string): Promise<string> {
  const text = input.trim();
  if (text.startsWith('<')) {
    if (text.length > MAX_XML) throw new Error('PoB2 XML 过大，最多支持 3 MB。');
    return text;
  }
  if (/^https?:/i.test(text)) throw new Error('请在 PoB2 导出分享代码，或选择本地 XML 文件；这里暂不读取分享网址。');
  const code = text.replace(/\s/g, '');
  if (!code || code.length > MAX_CODE || !/^[\w+/=-]+$/.test(code)) throw new Error('请输入有效的 PoB2 分享代码或 XML。');
  try {
    const binary = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
    const chunks: Uint8Array[] = []; let total = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        total += value.byteLength;
        if (total > MAX_XML) throw new Error('PoB2 解压后超过 3 MB 限制。');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => undefined); }
    const output = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder('utf-8', { fatal: true }).decode(output);
  } catch (error) {
    if (error instanceof Error && error.message.includes('3 MB')) throw error;
    throw Object.assign(new Error('无法解压此分享代码。请重新从 PoB2 导出，或直接导入 XML 文件。'), { cause: error });
  }
}

function normalizePobItem(element: Element): PobItem {
  const id = element.getAttribute('id') ?? '';
  // ModRange children are metadata, not item text.
  const raw = [...element.childNodes].filter((node) => node.nodeType === 3 || node.nodeType === 4).map((node) => node.textContent).join('');
  const lines = raw.replace(/\r/g, '').trim().split('\n').map((line) => line.trim()).filter(Boolean);
  const warnings: string[] = [];
  if (/^-{3,}$/m.test(raw)) return { id, raw: raw.trim(), warnings };
  const rarity = lines.findIndex((line) => /^Rarity:/i.test(line));
  if (rarity < 0) throw new Error(`物品 ${id} 缺少稀有度。`);
  const nameLines = /RARE|UNIQUE|RELIC/i.test(lines[rarity]!) ? 2 : 1;
  const header = lines.slice(rarity, rarity + nameLines + 1);
  const tail = lines.slice(rarity + nameLines + 1);
  const catalyst = tail.some((line) => /^CatalystQuality:\s*[1-9]/i.test(line));
  const selectedVariants = ['variant', 'variantAlt', 'variantAlt2'].map((attribute) => element.getAttribute(attribute)).filter(Boolean);
  const properties: string[] = [], mods: string[] = [];
  let implicits = 0;
  for (const original of tail) {
    if (/^Implicits:/i.test(original)) { implicits = Number(original.split(':')[1]) || 0; continue; }
    if (/^(?:Item Level|Quality|Armour|Evasion|Energy Shield|Spirit|Ward|Physical Damage|Elemental Damage|Attacks per Second|Critical Hit Chance|Sockets|Rune):/i.test(original)) {
      if (/^Ward:/i.test(original)) warnings.push('符文保护尚未纳入装备加总。');
      properties.push(original.replace(/^Evasion:/, 'Evasion Rating:')); continue;
    }
    if (/^(?:Unique ID|League|Crafted|Prefix|Suffix|Catalyst|CatalystQuality|Variant|Selected Variant|Has Alt Variant|Has Alt Variant Two|Has Alt Variant Three|LevelReq|Radius|Limited to|Rune|Source|Upgrade|Unreleased|Runic Ward|Requires Class):/i.test(original)) {
      if (/^Runic Ward:/i.test(original)) warnings.push('符文保护尚未纳入装备加总。');
      continue;
    }
    if (/^(?:Corrupted|Twice Corrupted|Double Corrupted|Mirrored|Unidentified|Sanctified)$/i.test(original)) { mods.push(original); continue; }
    const implicit = implicits-- > 0;
    if (/\{disabled\}/i.test(original)) continue;
    const variant = original.match(/\{variant:([^}]+)\}/i);
    if (variant && !variant[1]!.split(',').some((value) => selectedVariants.includes(value.trim()))) {
      if (!selectedVariants.length) warnings.push('缺少词缀版本选择，已跳过版本专属词缀。');
      continue;
    }
    const unsupported = /\{(?:version|base|group|corruptedRange):/i.test(original);
    const ranges = original.match(/\{range:([^}]+)\}/i)?.[1]?.split(',').map(Number);
    let rangeIndex = 0, unresolved = false;
    let line = original.replace(/\{[^}]*\}/g, '').trim();
    line = line.replace(/(?<!\d)\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/g, (whole, min: string, max: string) => {
      const range = ranges?.[rangeIndex++];
      const value = range === undefined ? NaN : Number(min) + range * (Number(max) - Number(min));
      // Fractional values need PoB's stat-specific display precision. Preserve rather than invent a roll.
      if (range === undefined || range < 0 || range > 1 || !Number.isSafeInteger(value)) { unresolved = true; return whole; }
      return String(value);
    });
    if (!line) continue;
    // PoB also writes ModRange children for fixed numeric clipboard lines. They do not
    // make those numbers uncertain. Only an unresolved textual range needs deferral.
    if (catalyst || unresolved || unsupported) {
      line += ' [PoB数值待游戏文本核对]';
      warnings.push('部分词缀涉及品质、旧版范围或版本计算；已保留文字，不加入数值比较及交易条件。');
    }
    const flag = ['rune', 'enchant', 'fractured', 'desecrated'].find((kind) => original.includes(`{${kind}}`)) ?? (implicit ? 'implicit' : undefined);
    mods.push(`${line}${flag ? ` (${flag})` : ''}`);
  }
  return { id, raw: [...header, '--------', ...properties, '--------', ...mods].join('\n'), warnings: [...new Set(warnings)] };
}

export function parsePobXml(xml: string): PobDocument {
  if (xml.length > MAX_XML || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML 过大或包含不支持的外部声明。');
  const document = new DOMParser().parseFromString(xml, 'text/xml');
  if (document.querySelector('parsererror')) throw new Error('XML 格式损坏，请重新从 PoB2 导出。');
  if (document.documentElement.tagName !== 'PathOfBuilding2') throw new Error('需要 PoB2 的 PathOfBuilding2 文件；不支持 PoE1 文件。');
  const container = [...document.documentElement.children].find((child) => child.tagName === 'Items');
  if (!container) throw new Error('PoB2 文件没有装备数据。');
  const items: Record<string, PobItem> = Object.create(null) as Record<string, PobItem>;
  for (const child of container.children) if (child.tagName === 'Item') {
    const item = normalizePobItem(child);
    if (!item.id || items[item.id]) throw new Error('PoB2 物品 ID 缺失或重复。');
    items[item.id] = item;
  }
  const sets = [...container.children].filter((child) => child.tagName === 'ItemSet');
  const parsed = (sets.length ? sets : [container]).map((set, index): PobSet => ({
    id: set.getAttribute('id') ?? String(index + 1), title: set.getAttribute('title') || `装备组 ${index + 1}`,
    secondWeapons: set.getAttribute('useSecondWeaponSet') === 'true',
    slots: [...set.children].filter((child) => child.tagName === 'Slot' && child.getAttribute('itemId') !== '0')
      .map((child) => ({ name: child.getAttribute('name') ?? '', itemId: child.getAttribute('itemId') ?? '' })),
  }));
  if (new Set(parsed.map((set) => set.id)).size !== parsed.length) throw new Error('PoB2 装备组 ID 重复。');
  const build = [...document.documentElement.children].find((child) => child.tagName === 'Build');
  const profile: PobDocument['profile'] = {};
  if (build) {
    const level = Number(build.getAttribute('level'));
    if (Number.isInteger(level) && level > 0 && level <= 100) profile.level = level;
    profile.className = build.getAttribute('className')?.slice(0, 300) ?? undefined;
    profile.ascendancy = build.getAttribute('ascendClassName')?.slice(0, 300) ?? undefined;
    profile.version = build.getAttribute('targetVersion')?.slice(0, 300) ?? undefined;
    const stats = new Map([...build.children].filter((child) => child.tagName === 'PlayerStat').map((child) => [child.getAttribute('stat'), Number(child.getAttribute('value') ?? NaN)]));
    const ref: NonNullable<PobSource['reference']> = { values: {}, caps: {}, effective: {} };
    for (const [stat, metric] of [['Life', 'life'], ['Mana', 'mana'], ['EnergyShield', 'energyShield'], ['Armour', 'armour'], ['Evasion', 'evasion'], ['Spirit', 'spirit'], ['Str', 'strength'], ['Dex', 'dexterity'], ['Int', 'intelligence']] as const) {
      const number = stats.get(stat); if (number !== undefined && Number.isFinite(number) && number >= 0 && number <= 1e12) ref.values[metric] = number;
    }
    // Capped/effective resistance values are NOT a substitute for the uncapped total.
    for (const [stat, key] of [['Fire', 'fireResistance'], ['Cold', 'coldResistance'], ['Lightning', 'lightningResistance'], ['Chaos', 'chaosResistance']] as const) {
      const total = stats.get(`${stat}ResistTotal`), cap = stats.get(`${stat}ResistMax`);
      if (total !== undefined && Number.isFinite(total) && total >= -200 && total <= 1000) ref.values[key] = total;
      if (cap !== undefined && Number.isFinite(cap) && cap >= 0 && cap <= 100) ref.caps[key] = cap;
      const effective = stats.get(`${stat}Resist`);
      if (effective !== undefined && Number.isFinite(effective) && effective >= -200 && effective <= 100) ref.effective![key] = effective;
      const overflow = stats.get(`${stat}ResistOverCap`), missing = stats.get(`Missing${stat}Resist`);
      // CalcDefence: effective=clamp(total,floor,max), overflow=max(0,total-max).
      // Zero overflow proves total=effective above the resistance floor, even when
      // PoB omits Max/Missing (its normal XML export does this for uncapped chaos).
      // At the floor, the hidden total may be lower: preserve that uncertainty.
      if (effective !== undefined && Number.isFinite(effective) && effective > -200 && effective <= 100
        && overflow !== undefined && Number.isFinite(overflow) && overflow >= 0 && overflow <= 1000) {
        if (ref.caps[key] === undefined && overflow > 0 && effective >= 0) ref.caps[key] = effective;
        if (ref.caps[key] === undefined && missing !== undefined && Number.isFinite(missing) && missing >= 0 && effective + missing >= 0 && effective + missing <= 100) ref.caps[key] = effective + missing;
        if (ref.values[key] === undefined && (overflow === 0 || ref.caps[key] !== undefined)) ref.values[key] = overflow > 0 ? ref.caps[key]! + overflow : effective;
      }
    }
    const dps = stats.get('FullDPS'); if (dps !== undefined && Number.isFinite(dps) && dps >= 0 && dps <= 1e15) ref.fullDps = dps;
    if (Object.keys(ref.values).length || Object.keys(ref.effective!).length || ref.fullDps !== undefined) profile.reference = ref;
  }
  profile.combat = parsePobCombat(document.documentElement);
  return { items, sets: parsed, activeSet: container.getAttribute('activeItemSet') ?? parsed[0]!.id, profile };
}

export function pobImportSource(document: PobDocument, setId: string, secondWeapons: boolean, slots: LoadoutState['slots'], file?: { name?: string; modifiedAt?: string }, warnings: readonly string[] = []): PobSource {
  const set = document.sets.find((entry) => entry.id === setId)!;
  const current = set.id === document.activeSet && secondWeapons === set.secondWeapons;
  return { kind: 'pob', importedAt: new Date().toISOString(), ...document.profile,
    weaponSets: { first: weaponPair(previewPob(document, setId, false).slots), second: weaponPair(previewPob(document, setId, true).slots) },
    combat: document.profile?.combat ? { ...document.profile.combat, matchesEquipment: current } : undefined,
    reference: current ? document.profile?.reference : undefined, fileName: file?.name, savedAt: file?.modifiedAt,
    setId, setTitle: set.title.slice(0, 300), secondWeapons, equipmentSignature: equipmentSignature(slots), warnings: warnings.slice(0, 50).map((warning) => warning.slice(0, 500)) };
}

export function previewPob(document: PobDocument, setId: string, secondWeapons: boolean): PobPreview {
  const set = document.sets.find((entry) => entry.id === setId);
  if (!set) throw new Error('找不到所选装备组。');
  let state = emptyLoadout(); const imported: string[] = [], warnings: string[] = [];
  const targets = set.slots.flatMap((entry) => {
    const swap = entry.name.endsWith(' Swap'); const name = entry.name.replace(/ Swap$/, '');
    if (name.startsWith('Weapon ') && swap !== secondWeapons) return [];
    return [{ ...entry, slot: slotMap[name] }];
  }).sort((a, b) => Number(b.slot === 'mainHand') - Number(a.slot === 'mainHand'));
  const seen = new Set<LoadoutSlot>();
  for (const entry of targets) {
    if (!entry.slot) { warnings.push(`${entry.name}：本页尚无对应栏位，未导入。`); continue; }
    const slot = entry.slot;
    if (seen.has(slot)) { warnings.push(`${slotLabel(slot)}重复，未覆盖先前物品。`); continue; }
    seen.add(slot);
    const item = document.items[entry.itemId];
    if (!item) { warnings.push(`${entry.name}：物品 ${entry.itemId} 不存在。`); continue; }
    const result = equipRaw(state, slot, item.raw);
    if (!result.ok) { warnings.push(`${slotLabel(slot)}：${result.error}`); continue; }
    state = result.state;
    const parsed = parseEquipment(item.raw)!;
    imported.push(`${slotLabel(slot)}：${equipmentDisplayName(parsed)}`);
    warnings.push(...[...item.warnings, ...parsed.warnings].map((warning) => `${slotLabel(slot)}：${warning}`));
  }
  return { slots: state.slots, imported, warnings };
}
