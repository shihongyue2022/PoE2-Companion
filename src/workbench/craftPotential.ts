import {
  listDesecrated, listMods, listPerfectEssences,
  type Engine, type EngineMod, type ExistingItem, type ItemModInput, type TargetInput,
} from '../lib/engine';
import { findJewelleryBase } from './catalog';
import { translateMod, translateModAtTier } from './localization';
import { targetAvailability, validateCraft, type CraftOptions } from './model';

export interface CraftCeiling {
  readonly modId: string;
  readonly label: string;
  readonly currentTier: number;
  readonly bestTier?: number;
  readonly topRequiredLevel?: number;
  readonly fractured: boolean;
  readonly reason?: string;
}

export interface CraftCandidate {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly targets: readonly TargetInput[];
  readonly blockReason?: string;
  readonly improvementCount: number;
  readonly preservedFractureIds: readonly string[];
  /** These are allowed to disappear, not a claim that the eventual policy will remove them. */
  readonly droppedCurrentLabels: readonly string[];
}

export interface CraftPotential {
  readonly status: 'blocked' | 'limited' | 'open' | 'empty';
  readonly headline: string;
  readonly summary: string;
  readonly notes: readonly string[];
  readonly constraints: readonly string[];
  readonly ceilings: readonly CraftCeiling[];
  readonly candidates: readonly CraftCandidate[];
  readonly replacementLevel?: number;
}

export interface CraftPotentialOptions {
  readonly engine: Engine;
  readonly item: ExistingItem;
  readonly baseName: string;
  readonly options: CraftOptions;
  readonly restriction?: string;
  readonly targets?: readonly TargetInput[];
}

/** All choices come from this base's actual pools, including any equipped pool rune. */
function modIndex(engine: Engine, item: ExistingItem): ReadonlyMap<string, EngineMod> {
  const ordinary = listMods(engine.data, item.baseId, item.runes ?? []);
  return new Map([
    ...ordinary.prefixes, ...ordinary.suffixes,
    ...listPerfectEssences(engine.data, item.baseId), ...listDesecrated(engine.data, item.baseId),
  ].map((mod) => [mod.id, mod]));
}

const unique = (rows: readonly string[]): string[] => [...new Set(rows)];
const targetKey = (rows: readonly TargetInput[]): string => JSON.stringify(rows
  .map(({ modId, tierDisplay, slot }) => [modId, tierDisplay, slot ?? null])
  .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));

/**
 * Diagnose tier/slot/source limits before asking the cost solver to work. The result does not rank
 * builds, infer prices, or equate "T1 in these directions" with the best item for every character.
 */
export function assessCraftPotential({
  engine, item, baseName, options, restriction, targets = [],
}: CraftPotentialOptions): CraftPotential {
  const held = [...item.prefixes, ...item.suffixes];
  const fractured = held.filter((entry) => entry.fractured);
  const mods = modIndex(engine, item);
  const base = findJewelleryBase(baseName);
  const dataBase = engine.data.bases.get(item.baseId);
  const globalIssues: string[] = [];
  if (restriction?.trim()) globalIssues.push(restriction.trim());
  if (!Number.isInteger(item.level) || item.level < 1 || item.level > 100) globalIssues.push('物品等级必须是 1～100 的整数。');
  if (!dataBase || !['Rings', 'Amulets'].includes(item.baseId)) globalIssues.push('当前只评估戒指和项链。');
  if (!base) globalIssues.push('尚未确认具体底座，请先核对装备底座。');
  else if (base.category !== item.baseId) globalIssues.push('具体底座与装备类型不一致，请重新核对。');
  else if (!base.supported) globalIssues.push(base.unsupportedReason ?? '这个特殊底座的制作规则尚未建模。');
  if (item.prefixes.some((entry) => mods.get(entry.modId)?.type === 'suffix')
    || item.suffixes.some((entry) => mods.get(entry.modId)?.type === 'prefix')) {
    globalIssues.push('当前词缀的前后缀位置不正确，请先核对导入结果。');
  }
  // Validate held state independently of a particular proposed improvement. A satisfied goal skips
  // source-enable requirements but still checks levels, families, rarity and slot counts.
  if (held.length) {
    const invalidHeld = validateCraft(item, held, mods, options);
    if (invalidHeld) globalIssues.push(invalidHeld);
  }

  const ceilings: CraftCeiling[] = held.map((entry) => {
    const mod = mods.get(entry.modId);
    if (!mod) return {
      modId: entry.modId, label: '未识别词缀', currentTier: entry.tierDisplay,
      fractured: Boolean(entry.fractured), reason: '该词缀不在当前底座已支持的词缀池中，请先核对。',
    };
    const best = entry.fractured
      ? mod.tiers.find((tier) => tier.display === entry.tierDisplay && tier.ilvl <= item.level)
      : mod.tiers.filter((tier) => targetAvailability(item, mod, tier.display, options).allowed)
        .sort((a, b) => a.display - b.display)[0];
    const top = mod.tiers.find((tier) => tier.display === 1);
    const reasons: string[] = [];
    if (entry.fractured) reasons.push(`破裂锁定在 T${entry.tierDisplay}，保留并占用一个${mod.type === 'prefix' ? '前缀' : '后缀'}槽位。`);
    if (top && top.ilvl > item.level) reasons.push(`物等 ${item.level} 不足以获得这条 T1；至少需要物等 ${top.ilvl}。`);
    if (!entry.fractured && top && top.ilvl <= item.level && best?.display !== 1) {
      const availability = targetAvailability(item, mod, 1, options);
      if (availability.reason) reasons.push(availability.reason);
    }
    if (!best && !reasons.length) reasons.push('当前来源或物品状态下没有可达的阶层。');
    return {
      modId: entry.modId, label: translateMod(mod.text), currentTier: entry.tierDisplay,
      ...(best ? { bestTier: best.display } : {}),
      ...(top ? { topRequiredLevel: top.ilvl } : {}),
      fractured: Boolean(entry.fractured), ...(reasons.length ? { reason: reasons.join(' ') } : {}),
    };
  });
  const ceilingById = new Map(ceilings.map((row) => [row.modId, row]));
  const labelOf = (entry: ItemModInput): string => {
    const mod = mods.get(entry.modId);
    return mod ? translateModAtTier(mod, entry.tierDisplay) : '未识别词缀';
  };

  function candidate(id: string, title: string, description: string, wanted: readonly TargetInput[]): CraftCandidate {
    const protectedTargets: TargetInput[] = wanted.map((target) => ({ ...target }));
    // The existing MDP locks only fractured TARGETS. Omitting a fractured modifier would let its
    // abstraction treat it as removable junk, so every proposed solve explicitly carries every one.
    for (const entry of fractured) {
      if (!protectedTargets.some((target) => target.modId === entry.modId)) {
        protectedTargets.push({ modId: entry.modId, tierDisplay: entry.tierDisplay });
      }
    }
    const alternativeSlots = protectedTargets.some((target) => target.slot !== undefined
      && protectedTargets.some((other) => other !== target && other.slot === target.slot));
    const localIssue = alternativeSlots ? '自动制作建议暂不处理同一槽位的备选目标，请先选择确定的词缀组合。'
      : validateCraft(item, protectedTargets, mods, options);
    const blockReason = unique([...globalIssues, ...(localIssue ? [localIssue] : [])]).join(' ');
    const required = new Set(protectedTargets.map((target) => target.modId));
    return {
      id, title, description, targets: protectedTargets,
      ...(blockReason ? { blockReason } : {}),
      improvementCount: protectedTargets.filter((target) => {
        const current = held.find((entry) => entry.modId === target.modId);
        return !current || target.tierDisplay < current.tierDisplay;
      }).length,
      preservedFractureIds: fractured.map((entry) => entry.modId),
      droppedCurrentLabels: held.filter((entry) => !required.has(entry.modId)).map(labelOf),
    };
  }

  const proposed: CraftCandidate[] = [];
  if (targets.length) proposed.push(candidate('selected', '检查当前制作目标', '保留你选定的目标要求，再检查当前装备是否适合继续投入。', targets));
  const upgrades = held.filter((entry) => {
    const row = ceilingById.get(entry.modId);
    return !entry.fractured && row?.bestTier !== undefined && row.bestTier < entry.tierDisplay;
  }).sort((a, b) => {
    const aa = ceilingById.get(a.modId)!;
    const bb = ceilingById.get(b.modId)!;
    return (b.tierDisplay - bb.bestTier!) - (a.tierDisplay - aa.bestTier!)
      || aa.bestTier! - bb.bestTier! || a.modId.localeCompare(b.modId);
  });
  const upgrade = upgrades[0];
  if (upgrade) {
    // This is a small, inspectable candidate, not a claim that two cheap targets make a finished
    // item. All omitted current modifiers are named so the player can choose what to protect.
    const anchor = held.filter((entry) => !entry.fractured && entry.modId !== upgrade.modId && entry.tierDisplay <= 2)
      .sort((a, b) => a.tierDisplay - b.tierDisplay || a.modId.localeCompare(b.modId))[0];
    const repair: TargetInput[] = [{ modId: upgrade.modId, tierDisplay: ceilingById.get(upgrade.modId)!.bestTier! }];
    if (anchor && fractured.length < 2) repair.push({ modId: anchor.modId, tierDisplay: anchor.tierDisplay });
    proposed.push(candidate('repair', '先改善一项现有属性', '只提高一项可提升的阶层，并尽量保留一项现有好词及全部破裂词缀；未列入目标的现有词缀可能丢失。', repair));
  }
  if (held.length) {
    proposed.push(candidate('ceiling', '当前底材的同组合上限', '保持现有属性方向，分别追到当前物等与锁定状态允许的最佳阶层；这可能需要大量通货。',
      held.map((entry) => ({ modId: entry.modId, tierDisplay: ceilingById.get(entry.modId)?.bestTier ?? entry.tierDisplay }))));
    proposed.push(candidate('t1', '同组合全部 T1', '检查全 T1 是否真的可达；物等或破裂阶层不足时，应先考虑换底材。',
      held.map((entry) => ({ modId: entry.modId, tierDisplay: 1 }))));
  }
  const seen = new Set<string>();
  const candidates = proposed.filter((entry) => {
    const key = targetKey(entry.targets);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const notes = [
    `按本地 ${engine.data.patch} 规则快照评估；不是对当前赛季全部规则已核验的保证。`,
    '成本计算针对词缀组合与阶层达标，不包含满数值洗练、品质投入、底座固定词缀和特殊隐性收益。',
    '同一装备部位的常规底座可能共享词缀池；这里按具体限制评估，不凭底座名称打潜力分。',
    '没有角色构筑和市场成交依据时，全部 T1 不等于最适合你的顶级装备，也不代表制作有利润。',
  ];
  if (item.prefixes.length >= 3 && item.suffixes.length >= 3) notes.push('当前六个词缀槽已满。改善阶层通常需要替换现有词缀，未破裂的好词也可能损失。');
  if (held.some((entry) => entry.desecrated || mods.get(entry.modId)?.source === 'desecrated')) notes.push('装备已有亵渎词缀；保留、移除及再次亵渎受到额外规则限制，成本应由当前状态策略计算。');
  if (fractured.length) notes.push('所有建议方案都强制包含现有破裂词缀；更换底材时不能免费继承这些锁定词缀。');
  const rowConstraints = ceilings.flatMap((row) => row.reason ? [`${row.label}：${row.reason}`] : []);
  const constraints = unique([...globalIssues, ...rowConstraints]);
  const needsHigherLevel = ceilings.map((row) => row.topRequiredLevel).filter((level): level is number => level !== undefined && level > item.level);
  const replacementLevel = needsHigherLevel.length ? Math.max(...needsHigherLevel) : undefined;
  const limited = ceilings.some((row) => row.bestTier === undefined || row.bestTier > 1);
  const status: CraftPotential['status'] = globalIssues.length ? 'blocked'
    : !held.length && !targets.length ? 'empty' : limited ? 'limited' : 'open';
  const headline = status === 'blocked' ? '先处理装备限制，再投入通货'
    : status === 'empty' ? '先导入装备，再评估制作潜力'
    : limited ? '这件底材有明确的阶层上限'
    : upgrades.length ? '可以改善，先比较后续成本' : held.length ? '当前方向已达到本底材阶层上限' : '先计算所选目标的制作成本';
  const summary = status === 'blocked' ? unique(globalIssues).join(' ')
    : status === 'empty' ? '尚无现有词缀或指定目标，不能根据空白底材猜测适合的成品组合。'
    : held.length ? `按当前 ${held.length} 项属性方向评估，${upgrades.length} 项还可提高阶层。${replacementLevel ? `若追同组合全部 T1，至少需要物等 ${replacementLevel} 的合适底材；仍需检查破裂阶层和词缀来源。` : '是否值得继续制作，要再比较期望通货成本、风险和市场成品价格。'}`
    : '已保留你的目标要求；按当前底材和制作选项计算，不自动替换为更容易的目标。';
  return { status, headline, summary, notes, constraints, ceilings, candidates, ...(replacementLevel !== undefined ? { replacementLevel } : {}) };
}
