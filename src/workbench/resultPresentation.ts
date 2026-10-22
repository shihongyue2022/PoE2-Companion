import type { EngineMarkovResult } from '../lib/engineTypes';
import { translateMod } from './localization';
import { formatCost } from './model';

export interface MarkovPresentation {
  readonly costText: string;
  readonly statusText: string;
  readonly nextText?: string;
  readonly kind: 'ready' | 'unreachable' | 'unsupported' | 'incomplete';
  readonly hasCost: boolean;
}

/** A failed solve uses converged=true as a sentinel; it is not a solved finite policy. */
export function presentMarkovResult(markov: EngineMarkovResult): MarkovPresentation {
  const validCost = markov.applicable && markov.feasible
    && Number.isFinite(markov.expectedCost) && markov.expectedCost >= 0;
  if (!validCost) {
    if (markov.stoppedEarly) return {
      costText: '尚未算出', statusText: '搜索达到限制，尚未得到成本',
      nextText: '提高搜索精度后重算', kind: 'incomplete', hasCost: false,
    };
    if (!markov.applicable) return {
      costText: '暂不支持', statusText: '当前策略模型无法处理此方案',
      nextText: '查看原因与固定路线说明', kind: 'unsupported', hasCost: false,
    };
    if (!markov.feasible) return {
      costText: '当前状态不可达', statusText: '当前条件下无法达到所选目标',
      nextText: '查看原因并调整目标或起始装备', kind: 'unreachable', hasCost: false,
    };
    return {
      costText: '尚未算出', statusText: '尚未得到有效的成本结果',
      nextText: '查看计算说明', kind: 'incomplete', hasCost: false,
    };
  }

  const bound = markov.bound === 'lower' ? '≥ ' : markov.bound === 'upper' ? '≤ ' : '';
  const costText = `${bound}${formatCost(markov.expectedCost)}`;
  if (markov.bound !== 'exact' || !markov.converged || markov.stoppedEarly) return {
    costText,
    statusText: markov.withoutBones && markov.bound === 'upper'
      ? '未使用亵渎的策略成本上界'
      : markov.bound === 'lower' ? '当前仅得到成本下界'
      : markov.bound === 'upper' ? '当前仅得到成本上界' : '搜索尚未完成，此成本尚未确认',
    nextText: '提高搜索精度后重算', kind: 'incomplete', hasCost: true,
  };
  return { costText, statusText: '当前模型已收敛', kind: 'ready', hasCost: true };
}

interface ReasonMod {
  readonly text: string | null;
  readonly source?: string;
  readonly alloy?: boolean;
  readonly rune?: string;
}

export interface CraftExplanation {
  readonly message: string;
  /** Verbatim engine output for expandable diagnostics, including unknown cases. */
  readonly diagnostic?: string;
}

const SOURCE_NAMES: Readonly<Record<string, string>> = {
  normal: '自然词缀', essence: '精华专属', perfect: '完美精华专属',
  perfect_essence: '完美精华专属', alloy: '合金专属', desecrated: '亵渎词缀', rune: '符文词缀',
};

function reasonMod(reason: string, mods?: ReadonlyMap<string, ReasonMod>): string {
  const id = /[A-Za-z][\w-]*\/[\w/.-]+/.exec(reason)?.[0];
  const mod = id ? mods?.get(id) : undefined;
  const translated = mod?.text ? translateMod(mod.text).replace(/\n/g, '、') : '';
  const label = /[\u3400-\u9fff]/.test(translated) ? `“${translated}”` : '目标词缀';
  const source = mod?.alloy ? SOURCE_NAMES.alloy : mod?.rune ? SOURCE_NAMES.rune
    : mod?.source ? SOURCE_NAMES[mod.source] : undefined;
  return source ? `${label}（${source}）` : label;
}

/** Known rules receive a Chinese explanation; unknown diagnostics remain available verbatim. */
export function explainCraftReason(reason: string | undefined, mods?: ReadonlyMap<string, ReasonMod>): CraftExplanation {
  if (!reason?.trim()) return { message: '尚无可用的计算说明。' };
  if (/[\u3400-\u9fff]/.test(reason)) return { message: reason };
  const mod = reasonMod(reason, mods);
  let message: string;
  if (/regular essence/i.test(reason) && /already rare|this one is already rare/i.test(reason)) {
    message = `${mod}只能通过普通精华添加；普通精华需要魔法装备，而当前装备已经是稀有装备，因此无法从当前状态添加该词缀。完美精华可以用于稀有装备，但不能替代这一普通精华词缀。请改选可制作的目标，或从普通／魔法底材重新规划。`;
  } else if (/step planner/i.test(reason) && /regular essence|essence-only/i.test(reason)) {
    message = `固定路线规划器暂不支持从已有装备添加${mod}：普通精华需要魔法装备。这个固定路线限制应与上方动态策略的结果分别查看；也可以从普通底材规划，或移除此精华目标。`;
  } else if (/stopped before|out of time|timed? out|ran out of (?:clock|time)|more value-iteration sweeps|sweep cap/i.test(reason)) {
    message = '搜索达到时间或迭代限制，尚未算出完整结果。这不代表目标不可达；可以提高搜索精度后重算。';
  } else if (/no target mods|no desired mods/i.test(reason)) {
    message = '尚未选择目标词缀，请先添加至少一项制作目标。';
  } else if (/unknown mod id/i.test(reason)) {
    message = '当前数据无法识别该词缀，请重新选择目标，并核对所用游戏数据版本。';
  } else if (/(?:isn't|is not|not) in .*pool/i.test(reason)) {
    message = `${mod}不属于当前底材对应的词缀池，请核对底材、词缀来源与游戏数据版本。`;
  } else if (/can't roll at item level/i.test(reason)) {
    const level = /item level (\d+)/i.exec(reason)?.[1];
    message = `${mod}无法在当前物品等级${level ? ` ${level}` : ''}出现，请提高物品等级或放宽目标阶级。`;
  } else if (/no route reaches this target with the currencies you have/i.test(reason)) {
    message = '当前允许的通货与制作机制无法达到目标，请检查并放开所需的制作选项，或调整目标。';
  } else if (/no policy reaches the target|no legal item satisfies every slot/i.test(reason)) {
    message = '当前条件下没有达到全部目标的制作路线，请检查目标组合、起始装备与允许的制作机制。';
  } else if (/two different slots both want family/i.test(reason)) {
    message = '所选目标包含同组互斥词缀，无法同时出现在一件装备上，请移除冲突目标。';
  } else if (/target (?:has|needs) \d+ (?:prefixes|suffixes)/i.test(reason)) {
    message = '目标前缀或后缀数量超过当前底材的槽位上限，请减少同侧目标。';
  } else if (/at most one desecrated mod|holds at most one desecrated mod/i.test(reason)) {
    message = '当前规则下一件装备最多保留一条亵渎词缀，请减少亵渎目标。';
  } else if (/at most (?:one|\d+) crafted modifier|already on the item, and an item holds/i.test(reason)) {
    message = '精华、完美精华和合金词缀合计超过当前装备允许的制作词缀数量，请减少这类目标或处理已有制作词缀。';
  } else if (/needs a magic item|requires a magic item/i.test(reason)) {
    message = /essence-only|regular essence/i.test(reason)
      ? `${mod}需要在魔法装备阶段使用普通精华添加；请检查起始稀有度和此前的操作顺序。`
      : '该操作需要魔法装备，请检查起始稀有度和此前的操作顺序。';
  } else if (/needs a rare item|requires a rare item|only.*rare|must be rare/i.test(reason)) {
    message = '该操作需要稀有装备，请检查起始稀有度和此前的操作顺序。';
  } else if (/not a rollable|does not model|doesn't model|model couldn.t handle|supports rollable|past the .*can afford|more than \d+ candidate/i.test(reason)) {
    message = '当前规划器暂不支持这组目标或装备状态，请查看原始诊断，或尝试简化目标。';
  } else {
    message = '当前计算未能提供可用方案，请展开原始诊断查看原因。';
  }
  return { message, diagnostic: reason };
}
