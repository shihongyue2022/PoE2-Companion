import type { SolveResult } from '../lib/solve';
import { translateCurrency } from './localization';
import { formatCost } from './model';
import { explainCraftReason, presentMarkovResult } from './resultPresentation';

export interface CraftCostEvidence {
  readonly kind: 'exact' | 'lower' | 'upper' | 'unreachable' | 'unsupported' | 'incomplete';
  readonly cost?: number;
  readonly p95?: number;
  readonly assumedOdds: boolean;
  readonly nextAction?: string;
  readonly reason?: string;
  /** Only an actual start-state goal proves completion; free material prices do not. */
  readonly goalMet?: boolean;
  /** Observed per-craft averages from an actual policy replay, never projected from the mean. */
  readonly materials: readonly { readonly label: string; readonly count: number; readonly spent: number }[];
}

export interface CraftCostJudgement {
  readonly tone: 'good' | 'warning' | 'bad' | 'neutral';
  readonly title: string;
  readonly detail: string;
}

const nonnegative = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value >= 0;
const positive = (value: number | undefined): value is number => nonnegative(value) && value > 0;

/** Preserve the solver's evidence and bounds without promoting a partial solve into an optimum. */
export function craftCostEvidence(result: SolveResult): CraftCostEvidence {
  const { markov } = result;
  const presentation = presentMarkovResult(markov);
  const kind: CraftCostEvidence['kind'] = !presentation.hasCost ? presentation.kind === 'ready' ? 'incomplete' : presentation.kind
    : markov.bound === 'lower' || markov.bound === 'upper' ? markov.bound
    : presentation.kind === 'ready' ? 'exact' : 'incomplete';
  const trustedCost = kind === 'exact' || kind === 'lower' || kind === 'upper';
  const start = markov.nodes.find((node) => node.isStart);
  const replay = trustedCost && markov.replay && Number.isInteger(markov.replay.runs) && markov.replay.runs > 0
    && nonnegative(markov.replay.meanCost) && nonnegative(markov.replay.stdErr) ? markov.replay : undefined;
  const p95 = replay?.costPercentiles[95];
  const reason = markov.reason ? explainCraftReason(markov.reason).message
    : kind === 'exact' ? undefined : presentation.statusText;
  return {
    kind,
    ...(trustedCost ? { cost: markov.expectedCost } : {}),
    ...(nonnegative(p95) ? { p95 } : {}),
    assumedOdds: markov.assumedOdds,
    ...(trustedCost && (kind === 'exact' || kind === 'upper') && !start?.isGoal && start?.action
      ? { nextAction: translateCurrency(start.action) } : {}),
    ...(reason ? { reason } : {}),
    ...(kind === 'exact' && start ? { goalMet: start.isGoal } : {}),
    materials: replay ? replay.spendByMove
      .filter((move) => move.label.trim() && nonnegative(move.count) && nonnegative(move.spent))
      .map((move) => ({ label: move.label, count: move.count, spent: move.spent })) : [],
  };
}

/**
 * Budget and opportunity-cost comparison in the result's price-sheet unit (Ex).
 * Prices here are optional manual inputs for this goal; this function does not supply market quotes.
 */
export function judgeCraftCost(
  evidence: CraftCostEvidence,
  budget?: number,
  finishedPrice?: number,
  currentValue?: number,
): CraftCostJudgement {
  const conditional = evidence.assumedOdds ? '本判断依赖尚未核验的假设权重，实际成本可能不同。' : '';
  const answer = (tone: CraftCostJudgement['tone'], title: string, detail: string): CraftCostJudgement => ({
    tone: evidence.assumedOdds && (tone === 'good' || tone === 'bad') ? 'warning' : tone,
    title: evidence.assumedOdds ? `按假设权重：${title}` : title,
    detail: `${detail}${conditional ? ` ${conditional}` : ''}`,
  });
  if (evidence.kind === 'unsupported') return answer('neutral', '当前模型暂不支持此方案',
    `${evidence.reason ?? '尚无可用的成本证据。'} 无法据此判断目标不可达或是否值得投入。`);
  if (evidence.kind === 'unreachable') return answer('bad', '当前条件无法达到目标',
    `${evidence.reason ?? '在当前装备、目标与允许的制作机制下，没有可达策略。'} 请先调整条件，再判断成本。`);
  if (evidence.kind === 'incomplete' || !nonnegative(evidence.cost)) return answer('warning', '计算尚未完成',
    `${evidence.reason ?? '尚未获得可用于比较的有限成本。'} 请提高搜索精度后重算，不能把缺失成本当作零。`);

  const cost = evidence.cost;
  if (evidence.kind === 'exact' && cost === 0) {
    if (evidence.goalMet) return answer('good', '目标已达成，无需继续投入',
      '当前起始状态已满足本次目标，停止为这个目标追加通货。');
    return answer('warning', '新增计价成本为零，先核对步骤与价格',
      '零成本不等于目标已经达成；材料可能被设为免费。请核对下一步、材料价格和目标状态。');
  }
  const costDescription = `${evidence.kind === 'lower' ? '成本下界' : evidence.kind === 'upper' ? '策略平均成本上界' : '期望新增成本'} ${formatCost(cost)} Ex`;
  const buyComparison = evidence.kind === 'exact' && !evidence.assumedOdds
    && positive(finishedPrice) && nonnegative(currentValue)
    && Number.isFinite(currentValue + cost) ? {
      cheaper: finishedPrice <= currentValue + cost,
      detail: `按你手动填写的价格，成品为 ${formatCost(finishedPrice)} Ex，当前装备机会价值加期望制作成本为 ${formatCost(currentValue + cost)} Ex。`,
    } : undefined;
  const marketDetail = buyComparison ? ` ${buyComparison.detail}${buyComparison.cheaper
    ? '可先比较直接购买，并核对成品是否满足同一目标及实际挂单。'
    : '制作的期望机会成本较低，但仍需承担随机制作风险。'}` : '';
  const buyDetail = buyComparison?.cheaper
    ? `${buyComparison.detail} 直接购买的价格不高于继续制作的期望机会成本，请核对同一目标的真实挂单。这个比较不代表可获得出售利润。`
    : '';
  if (!nonnegative(budget)) {
    if (buyComparison?.cheaper) return answer('warning', '优先比较直接购买成品',
      `${buyDetail} 还未设置材料预算，尚不能判断继续制作是否符合你的资金限制。`);
    return answer('neutral', '先设置制作预算',
      `当前${costDescription}。填写可追加投入的预算后再比较；平均成本不是单次支出的保证。${marketDetail}`);
  }
  if (evidence.kind === 'lower') {
    if (cost > budget) return answer('bad', '成本下界已超过预算',
      `目前只能确定平均成本至少为 ${formatCost(cost)} Ex，已高于预算 ${formatCost(budget)} Ex；完整期望成本尚未算出。`);
    return answer('warning', '仅有成本下界，预算仍待确认',
      `${costDescription} 没有超过预算 ${formatCost(budget)} Ex，但实际平均成本可能更高，暂不能据此决定继续投入。`);
  }
  if (evidence.kind === 'upper') {
    if (cost <= budget) return answer('warning', '已有策略的平均成本在预算内',
      `当前策略平均成本不超过 ${formatCost(cost)} Ex，预算为 ${formatCost(budget)} Ex；最优成本尚未确认，单次支出仍可能超过预算。`);
    return answer('warning', '成本上界超过预算，仍需确认',
      `${costDescription} 高于预算 ${formatCost(budget)} Ex；更便宜的策略仍可能存在，不能据此断言所有策略都超出预算。`);
  }
  if (cost > budget) return answer('bad', '预计成本超过预算',
    `${costDescription} 高于预算 ${formatCost(budget)} Ex。它是平均成本，单次制作可能更低或更高；可先降低目标或停止追加。${marketDetail}`);
  if (buyComparison?.cheaper) return answer('warning', '优先比较直接购买成品',
    buyDetail);
  if (nonnegative(evidence.p95) && evidence.p95 > budget) return answer('warning', '平均成本在预算内，但尾部成本较高',
    `${costDescription}，预算为 ${formatCost(budget)} Ex；实际策略抽样的 P95 成本为 ${formatCost(evidence.p95)} Ex，已超过预算。预算内达标概率尚未由这些指标确定。${marketDetail}`);
  return answer('good', '可考虑继续制作',
    `${costDescription} 在预算 ${formatCost(budget)} Ex 内。${nonnegative(evidence.p95)
      ? `实际策略抽样的 P95 成本为 ${formatCost(evidence.p95)} Ex。` : '尚无可用的抽样尾部成本。'} 平均成本和抽样分位数都不保证某一次能在预算内达标。${marketDetail}`);
}
