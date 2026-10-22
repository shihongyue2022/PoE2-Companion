import type { ExistingItem, ItemModInput, TargetInput } from '../lib/engineTypes';
import { findJewelleryBase } from './catalog';

export interface CraftCheckpoint {
  readonly id: string;
  readonly createdAt: string;
  readonly baseName: string;
  readonly before: ExistingItem;
  readonly action: string;
  readonly mode: 'remove' | 'add' | 'goals';
  readonly removeModIds: readonly string[];
  readonly preserveModIds: readonly string[];
  readonly targets: readonly TargetInput[];
}

export interface CheckpointReview {
  readonly status: 'met' | 'missed' | 'unchanged' | 'mismatch' | 'unresolved';
  readonly title: string;
  readonly details: readonly string[];
  readonly canContinue: boolean;
}

interface CheckpointObservation {
  readonly item: ExistingItem;
  readonly baseName: string;
  readonly complete: boolean;
}

interface LocatedMod extends ItemModInput {
  readonly side: 'prefix' | 'suffix';
}

const entries = (item: ExistingItem): LocatedMod[] => [
  ...item.prefixes.map((entry) => ({ ...entry, side: 'prefix' as const })),
  ...item.suffixes.map((entry) => ({ ...entry, side: 'suffix' as const })),
];
const canonicalBase = (name: string): string => (findJewelleryBase(name)?.english ?? name).trim().toLowerCase();
const entryKey = (entry: LocatedMod): string => JSON.stringify([
  entry.modId, entry.tierDisplay, entry.side, Boolean(entry.fractured), Boolean(entry.desecrated),
]);
const stateKey = (item: ExistingItem): string => JSON.stringify({
  baseId: item.baseId, level: item.level, rarity: item.rarity,
  mods: entries(item).map(entryKey).sort(), runes: [...(item.runes ?? [])].sort(),
});
const sameEntry = (a: LocatedMod, b: LocatedMod): boolean => entryKey(a) === entryKey(b);

function review(status: CheckpointReview['status'], title: string, details: readonly string[]): CheckpointReview {
  return { status, title, details, canContinue: status === 'met' };
}

/**
 * Check one deliberately recorded action against a freshly parsed item. A matching base/level is a
 * necessary check, not a unique item identifier. Rolls inside a tier are absent from ExistingItem;
 * this function consequently never certifies quality or exact numerical rolls.
 */
export function evaluateCheckpoint(anchor: CraftCheckpoint, observation: CheckpointObservation): CheckpointReview {
  const { item, baseName, complete } = observation;
  const before = entries(anchor.before);
  const after = entries(item);
  if (!complete) return review('unresolved', '先核对操作后的装备文本', [
    '操作后的装备尚未完整识别或存在待核对内容，不能判定本步成功。',
    '请复制完整装备文本并处理未识别词缀；不要据此直接执行下一步。',
  ]);
  if (!canonicalBase(anchor.baseName) || canonicalBase(anchor.baseName) !== canonicalBase(baseName)
    || anchor.before.baseId !== item.baseId || anchor.before.level !== item.level) {
    return review('mismatch', '这份装备文本与锚点不匹配', [
      `锚点记录的底座为 ${anchor.baseName}，物等 ${anchor.before.level}；当前为 ${baseName}，物等 ${item.level}。`,
      '请确认复制的是同一件装备，并重新粘贴操作后的文本。',
    ]);
  }
  const beforeById = new Map(before.map((entry) => [entry.modId, entry]));
  const afterById = new Map(after.map((entry) => [entry.modId, entry]));
  if (beforeById.size !== before.length || afterById.size !== after.length
    || before.some((entry) => !Number.isInteger(entry.tierDisplay) || entry.tierDisplay < 1)
    || after.some((entry) => !Number.isInteger(entry.tierDisplay) || entry.tierDisplay < 1)) {
    return review('unresolved', '词缀结构仍需核对', ['装备包含重复词缀或无效阶层，不能可靠核对本步结果。']);
  }
  const protectedIds = new Set([
    ...anchor.preserveModIds, ...before.filter((entry) => entry.fractured).map((entry) => entry.modId),
  ]);
  const invalidPreserve = [...protectedIds].some((id) => !beforeById.has(id));
  const invalidRemoval = anchor.removeModIds.some((id) => !beforeById.has(id) || beforeById.get(id)?.fractured || protectedIds.has(id));
  if (!anchor.action.trim() || invalidPreserve
    || (anchor.mode === 'remove' && (!anchor.removeModIds.length || invalidRemoval))
    || (anchor.mode !== 'remove' && !anchor.targets.length)) {
    return review('unresolved', '锚点的本步条件不完整', ['请重新设定允许移除或必须增加的目标，并保留所有破裂词缀。']);
  }
  if (stateKey(anchor.before) === stateKey(item)) return review('unchanged', '尚未观察到本步状态变化', [
    '当前词缀、阶层与锚点相同，不能据此认定已经执行并完成本步。',
    '本校验只检查词缀和阶层，不判断阶层内数值重掷或品质变化。',
  ]);
  if (JSON.stringify([...(anchor.before.runes ?? [])].sort()) !== JSON.stringify([...(item.runes ?? [])].sort())) {
    return review('mismatch', '插槽状态与本步预期不一致', ['本步校验不包含更换符文，请先确认复制的装备和实际操作。']);
  }
  const lostProtected = [...protectedIds].filter((id) => {
    const old = beforeById.get(id)!;
    const current = afterById.get(id);
    return !current || current.side !== old.side || current.tierDisplay > old.tierDisplay
      || (old.fractured && (!current.fractured || current.tierDisplay !== old.tierDisplay))
      || (old.desecrated && !current.desecrated);
  });
  if (lostProtected.length) return review('missed', '必须保留的词缀未能保留', [
    `${lostProtected.length} 项保护条件未满足，包含破裂词缀时也必须核对其锁定标记和阶层。`,
    '本步未达标。请依据操作后的真实装备重新计算修复策略，或重新检查复制文本。',
  ]);
  const removed = before.filter((entry) => !afterById.has(entry.modId));
  const added = after.filter((entry) => !beforeById.has(entry.modId));
  const changed = before.filter((entry) => {
    const current = afterById.get(entry.modId);
    return current !== undefined && !sameEntry(entry, current);
  });
  const tierGoalMet = (target: TargetInput): boolean => {
    const current = afterById.get(target.modId);
    return Boolean(current && Number.isInteger(target.tierDisplay) && target.tierDisplay > 0 && current.tierDisplay <= target.tierDisplay);
  };
  // This panel records one move, not an untracked sequence. A wholesale item replacement must not
  // appear successful merely because a new item happens to carry all the requested targets.
  if (removed.length > 1 || added.length > 1 || changed.length > 1
    || (changed.length > 0 && (removed.length > 0 || added.length > 0))) return review('mismatch', '变化超出了单步锚点的校验范围', [
    `检测到移除 ${removed.length} 项、新增 ${added.length} 项、改变 ${changed.length} 项词缀状态。`,
    '可能已连续操作多次或复制了另一件装备，请核对后重新建立锚点。',
  ]);
  if (anchor.mode === 'remove') {
    if (added.length || changed.length || item.rarity !== anchor.before.rarity) return review('mismatch', '这不是锚点记录的单次移除结果', [
      '移除模式只接受少一条词缀，其余词缀、阶层、锁定标记与稀有度都保持一致。',
      '请核对是否使用了其他通货，或已经连续执行了多步。',
    ]);
    if (removed.length !== 1 || !anchor.removeModIds.includes(removed[0]!.modId)) return review('missed', '移除的词缀未命中本步目标', [
      '本步需要恰好移除一条选定的词缀；当前结果没有满足这个条件。',
      '请按当前真实状态重算后续策略，不要直接沿用原来的下一步。',
    ]);
    return review('met', '本步移除目标已达成', ['已移除一条选定词缀，其余词缀与全部保护条件保持不变。', '请重新计算后续策略，再决定下一步通货。']);
  }
  if (anchor.mode === 'add') {
    if (removed.length || changed.length) return review('mismatch', '这不是锚点记录的单次增加结果', [
      '增加模式要求只新增一条词缀，不移除或改变原有词缀。',
      '如果使用的是混沌石或完美精华，请改用阶段目标模式重新设定锚点。',
    ]);
    if (added.length !== 1 || !anchor.targets.some((target) => target.modId === added[0]!.modId && tierGoalMet(target))
      || !anchor.targets.every(tierGoalMet)) return review('missed', '新增词缀未达到本步要求', [
      '必须新增一条选定目标词缀，且满足设定的阶层要求；其他选定条件也须同时成立。',
      '请根据实际新增结果重新计算后续策略。',
    ]);
    return review('met', '本步增加目标已达成', ['已新增一条选定目标词缀，其阶层及全部保护条件符合要求。', '请重新计算后续策略，再决定下一步通货。']);
  }
  if (anchor.targets.some((target) => target.slot !== undefined
    && anchor.targets.some((other) => other !== target && other.slot === target.slot))) {
    return review('unresolved', '阶段目标包含尚未支持的备选槽位', ['请将本步条件设为明确的词缀目标，再进行校验。']);
  }
  if (!anchor.targets.every(tierGoalMet)) return review('missed', '本步阶段目标尚未达成', [
    '当前装备未同时满足选定的词缀及阶层条件。',
    '请按当前真实状态重新计算修复或继续制作的策略。',
  ]);
  return review('met', '本步阶段目标已达成', ['当前装备满足全部阶段目标和保护条件。', '本结果不保证阶层内的具体数值；重新计算后续策略后再继续。']);
}
