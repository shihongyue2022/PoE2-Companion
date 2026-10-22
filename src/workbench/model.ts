import type { Engine, EngineMod, ExistingItem, ItemModInput, TargetInput } from '../lib/engine';
import { modFamilies } from '../lib/engineTypes';
import type { SolveRequest } from '../lib/solve';

export interface CraftOptions { strengths: boolean; omens: boolean; essences: boolean; desecration: boolean }
export const DEFAULT_OPTIONS: CraftOptions = { strengths: true, omens: false, essences: false, desecration: false };

export interface TargetAvailability {
  readonly allowed: boolean;
  readonly reason?: string;
  /** A missing action setting is fixable; an unreachable target needs a different goal or item. */
  readonly kind?: 'unreachable' | 'disabled';
}

/** Check a goal, not a held modifier: an imported Rare may already carry an Essence modifier. */
export function targetAvailability(
  item: ExistingItem, mod: EngineMod, tierDisplay: number, options: CraftOptions = DEFAULT_OPTIONS,
): TargetAvailability {
  const tier = mod.tiers.find((entry) => entry.display === tierDisplay);
  if (!tier) return { allowed: false, kind: 'unreachable', reason: '无法识别该目标阶级，请重新选择。' };
  if (tier.ilvl > item.level) {
    return { allowed: false, kind: 'unreachable', reason: `物品等级不足：该目标至少需要物等 ${tier.ilvl}。` };
  }
  const held = [...item.prefixes, ...item.suffixes].find((entry) => entry.modId === mod.id);
  // T1 is best. A held modifier at the requested tier or better requires no source currency.
  if (held && held.tierDisplay <= tierDisplay) return { allowed: true };
  if (held?.fractured) {
    return { allowed: false, kind: 'unreachable', reason: '该词缀已破裂锁定，不能移除后重做为更高阶级；请降低目标要求或更换底材。' };
  }
  if (mod.source === 'essence' && item.rarity === 'rare') {
    return {
      allowed: false, kind: 'unreachable',
      reason: '这是普通精华专属词缀。普通精华只能用于魔法（蓝色）装备，当前装备已是稀有（黄色），无法补出或升级这条词缀。可另选普通词缀版本，或从普通／魔法底材重新规划；完美精华不等同于这条普通精华词缀。',
    };
  }
  if (['essence', 'perfect', 'alloy'].includes(mod.source) && !options.essences) {
    return { allowed: false, kind: 'disabled', reason: '该目标需要精华／合金，请先启用“精华／合金”。' };
  }
  if (mod.source === 'desecrated' && !options.desecration) {
    return { allowed: false, kind: 'disabled', reason: '该目标需要亵渎，请先启用“亵渎（含估计权重）”。' };
  }
  return { allowed: true };
}

/** A unique ordinary same-family counterpart; its tiers/values must be selected afresh. */
export function regularAlternative(mod: EngineMod, mods: ReadonlyMap<string, EngineMod>): EngineMod | undefined {
  if (mod.source !== 'essence') return undefined;
  const families = new Set(mod.families?.length ? mod.families : [mod.family]);
  const alternatives = [...mods.values()].filter((candidate) => {
    if (candidate.source !== 'normal' || candidate.type !== mod.type) return false;
    const groups = candidate.families?.length ? candidate.families : [candidate.family];
    return groups.length === families.size && groups.every((family) => families.has(family));
  });
  return alternatives.length === 1 ? alternatives[0] : undefined;
}

export function excludedCurrencies(engine: Engine, options: CraftOptions): string[] {
  const exclude = Object.keys(engine.prices.currency).filter((key) =>
    (!options.strengths && /_(greater|perfect)$/.test(key)) ||
    (!options.essences && /essence|alloy/i.test(key)) ||
    (!options.desecration && /^desecrate/.test(key)));
  if (!options.omens) exclude.push(...Object.keys(engine.prices.omens));
  return exclude;
}

/**
 * The from-item solver needs a locked modifier represented as a required target to keep it out
 * of its removable-junk state. Preserve the player's explicit goals and add every other fracture
 * at the tier already held; these anchors also consume real prefix/suffix capacity.
 */
export function withProtectedFractures(item: ExistingItem, targets: readonly TargetInput[]): TargetInput[] {
  const protectedTargets = targets.map((target) => ({ ...target }));
  const requested = new Set(targets.map((target) => target.modId));
  for (const held of [...item.prefixes, ...item.suffixes]) {
    if (!held.fractured || requested.has(held.modId)) continue;
    protectedTargets.push({ modId: held.modId, tierDisplay: held.tierDisplay });
    requested.add(held.modId);
  }
  return protectedTargets;
}

export function validateCraft(
  item: ExistingItem, targets: readonly TargetInput[], mods: ReadonlyMap<string, EngineMod>, options: CraftOptions = DEFAULT_OPTIONS,
): string | null {
  if (!Number.isInteger(item.level) || item.level < 1 || item.level > 100) return '物品等级必须是 1～100 的整数。';
  if (!['Rings', 'Amulets'].includes(item.baseId)) return '首版仅支持戒指和项链。';
  if (targets.length === 0) return '请先在词缀库中添加至少一个目标。';
  const check = (entries: readonly ItemModInput[], goal: boolean): string | null => {
    const families = new Set<string>();
    let p = 0; let s = 0; let crafted = 0;
    for (const entry of entries) {
      const mod = mods.get(entry.modId);
      const tier = mod?.tiers.find((t) => t.display === entry.tierDisplay);
      if (!mod || !tier) return '存在无法识别的词缀或阶级，请重新选择。';
      if (tier.ilvl > item.level) return `物品等级不足：该词缀至少需要物等 ${tier.ilvl}。`;
      if (modFamilies(mod).some((family) => families.has(family))) return '同组词缀互斥，请移除冲突词缀。';
      modFamilies(mod).forEach((family) => families.add(family));
      if (mod.type === 'prefix') p++; else s++;
      if (['essence', 'perfect', 'alloy'].includes(mod.source)) crafted++;
    }
    if (crafted > 1) return '当前数据规则只允许一条精华／合金制作词缀。';
    const cap = !goal && item.rarity === 'magic' ? 1 : 3;
    if (p > cap || s > cap) return `当前稀有度每侧最多允许 ${cap} 条词缀。`;
    if (!goal && item.rarity === 'normal' && entries.length) return '普通装备不能带有显式词缀，请调整稀有度。';
    return null;
  };
  const error = check([...item.prefixes, ...item.suffixes], false) ?? check(targets, true);
  if (error) return error;
  const fractured = [...item.prefixes, ...item.suffixes].filter((entry) => entry.fractured);
  for (const target of targets) {
    const mod = mods.get(target.modId)!;
    const availability = targetAvailability(item, mod, target.tierDisplay, options);
    if (!availability.allowed) return availability.reason!;
    if (fractured.some((entry) => entry.modId !== target.modId
      && modFamilies(mods.get(entry.modId)).some((family) => modFamilies(mod).includes(family)))) {
      return '该目标与装备上已破裂锁定的词缀互斥，不能通过移除锁定词缀实现；请更换目标或底材。';
    }
  }
  return check(withProtectedFractures(item, targets), true);
}

export function makeSolveRequest(
  engine: Engine, item: ExistingItem, targets: readonly TargetInput[], mods: ReadonlyMap<string, EngineMod>,
  options: CraftOptions, maxMillis: number, baseCost: number, playOut: boolean,
): SolveRequest {
  const error = validateCraft(item, targets, mods, options);
  if (error) throw new Error(error);
  const effectiveTargets = withProtectedFractures(item, targets);
  const targetPrefixes = effectiveTargets.filter((target) => mods.get(target.modId)?.type === 'prefix').length;
  const common = {
    targets: effectiveTargets, excluded: excludedCurrencies(engine, options), playOut,
    spare: { prefixes: 3 - targetPrefixes, suffixes: 3 - effectiveTargets.length + targetPrefixes },
    effort: { maxMillis, maxNodes: 100, maxSweeps: 100_000, solver: 'policy' as const },
  };
  return item.rarity === 'normal'
    ? { ...common, kind: 'lab', from: { baseId: item.baseId, level: item.level }, baseCost }
    : { ...common, kind: 'item', item };
}

export const formatCost = (value: number): string => Number.isFinite(value)
  ? value.toLocaleString('zh-CN', { maximumFractionDigits: value >= 1000 ? 0 : 2 }) : '无法到达';
export const formatPercent = (value: number): string => `${(value * 100).toLocaleString('zh-CN', { maximumFractionDigits: value > .01 ? 2 : 5 })}%`;
