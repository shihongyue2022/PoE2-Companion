import type { CraftCostEvidence } from './craftAdvice';

export interface RestartCostComparison {
  readonly tone: 'good' | 'warning' | 'bad' | 'neutral';
  readonly title: string;
  readonly detail: string;
  /** Initial purchase + subsequent crafting - explicitly supplied old-item sale credit. */
  readonly total?: number;
}

const valid = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value >= 0;
const amount = (value: number): string => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const description = (value: CraftCostEvidence | undefined): string => !value ? '尚未计算'
  : value.kind === 'lower' ? '只有成本下界'
  : value.kind === 'upper' ? '只有策略成本上界'
  : value.kind === 'unreachable' ? '当前条件不可达'
  : value.kind === 'unsupported' ? '当前模型不支持'
  : value.kind === 'incomplete' || !valid(value.cost) ? '成本尚未算出'
  : '已经求得期望成本';

/** Compare two actual solves of the same goal; this function never supplies a market quote. */
export function compareRestartCost(
  current: CraftCostEvidence | undefined,
  replacement: CraftCostEvidence | undefined,
  buyPrice?: number,
  currentValue?: number,
): RestartCostComparison {
  if (!valid(buyPrice)) return {
    tone: 'neutral', title: '先填写替代底材的实际买价',
    detail: '请填写官网挂单中这件替代底材的买价。没有报价时，不能把购买成本当作零或推测换底材更便宜。',
  };
  if (currentValue !== undefined && !valid(currentValue)) return {
    tone: 'warning', title: '请核对原装备可售价',
    detail: '原装备可售价必须是有限的非负数；留空表示不抵扣出售收入。',
  };
  const total = replacement?.kind === 'exact' && !replacement.assumedOdds && valid(replacement.cost)
    ? buyPrice + replacement.cost - (currentValue ?? 0) : undefined;
  if (total !== undefined && !Number.isFinite(total)) return {
    tone: 'warning', title: '比较金额超出可计算范围', detail: '请检查底材买价、制作成本和原装备可售价。',
  };
  const totalField = total === undefined ? {} : { total };
  if (!current || !replacement) return {
    ...totalField, tone: 'neutral', title: '先算出两件底材达到同一目标的成本',
    detail: `当前装备：${description(current)}；替代底材：${description(replacement)}。两边都需要求解，才能比较继续加工与重新购买。`,
  };
  if (current.assumedOdds || replacement.assumedOdds) return {
    ...totalField, tone: 'warning', title: '含假设权重，暂不判断更换是否更省',
    detail: '至少一边的概率依赖尚未核验的假设权重，实际期望成本可能改变。请核对权重后重新计算；当前数值只作条件参考。',
  };
  if (current.kind !== 'exact' || replacement.kind !== 'exact' || !valid(current.cost) || !valid(replacement.cost)) return {
    ...totalField, tone: 'warning', title: '现有成本证据还不能确定哪种更划算',
    detail: `当前装备：${description(current)}；替代底材：${description(replacement)}。上下界、不可达或模型不支持都不能直接充当两边的确定期望成本，请补齐可比较的求解结果。`,
  };
  const net = total!;
  const credit = currentValue === undefined ? '未填原装备可售价，本次不抵扣出售收入。'
    : `按你填写的原装备可售价抵扣 ${amount(currentValue)} Ex；实际能否售出仍需确认。`;
  const arithmetic = `替代方案：买价 ${amount(buyPrice)} + 后续制作 ${amount(replacement.cost)}${currentValue === undefined ? '' : ` − 原装备可售价 ${amount(currentValue)}`} = ${amount(net)} Ex；继续加工需要 ${amount(current.cost)} Ex。`;
  const caution = `${credit} 两边按同一目标和材料价格比较期望追加成本，单次消耗可能更高，未计交易时间、品质与固定词缀差异。`;
  const difference = current.cost - net;
  const equal = Math.abs(difference) <= 1e-9 * Math.max(1, Math.abs(current.cost), Math.abs(net));
  return {
    total: net, tone: equal ? 'neutral' : 'good',
    title: equal ? '两种方式的期望追加成本相同'
      : difference > 0 ? '更换底材的期望追加成本较低' : '继续加工的期望追加成本较低',
    detail: `${arithmetic}${equal ? '' : ` 相差 ${amount(Math.abs(difference))} Ex。`} ${caution}`,
  };
}
