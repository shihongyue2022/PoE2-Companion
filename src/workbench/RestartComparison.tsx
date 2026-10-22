import { useEffect, useMemo, useRef, useState } from 'react';
import type { Engine, EngineMod, ExistingItem } from '../lib/engine';
import type { SolveProgress, SolveResult } from '../lib/solve';
import { craftCostEvidence, type CraftCostEvidence } from './craftAdvice';
import { assessCraftPotential, type CraftCandidate } from './craftPotential';
import { computeWorkbench } from './compute';
import { parseWorkbenchItem } from './itemImport';
import { formatCost, makeSolveRequest, type CraftOptions } from './model';
import { compareRestartCost } from './restartCost';

export interface RestartComparisonProps {
  engine: Engine;
  mods: ReadonlyMap<string, EngineMod>;
  candidate: CraftCandidate;
  original?: CraftCostEvidence;
  baseId: string;
  options: CraftOptions;
  overrides: Record<string, number>;
  effort: number;
  baseCost: number;
  playOut: boolean;
  currentValue?: number;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}

const parseAmount = (text: string): number | undefined => {
  if (!text.trim()) return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
};

/** A change of goal, prices or crafting rules cancels the old counterfactual worker. */
export default function RestartComparison(props: RestartComparisonProps) {
  const signature = JSON.stringify({ baseId: props.baseId, targets: props.candidate.targets,
    candidate: props.candidate.id, patch: props.engine.data.patch, prices: props.engine.prices, options: props.options,
    overrides: props.overrides, effort: props.effort, playOut: props.playOut });
  return <RestartComparisonBody key={signature} {...props} />;
}

function RestartComparisonBody(props: RestartComparisonProps) {
  const [raw, setRaw] = useState('');
  const [priceText, setPriceText] = useState('');
  const [result, setResult] = useState<SolveResult | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<SolveProgress | null>(null);
  const generation = useRef(0);
  const runner = useRef<ReturnType<typeof computeWorkbench> | null>(null);
  const busyCallback = useRef(props.onBusyChange);
  const buyPrice = parseAmount(priceText);

  const replacement = useMemo((): { item?: ExistingItem; name?: string; error?: string } => {
    if (!raw.trim()) return {};
    try {
      const parsed = parseWorkbenchItem(props.engine.data, raw);
      if (!parsed) return { error: '未识别为装备文字，请从游戏或官网复制完整装备文本。' };
      if (parsed.craftingBlocked || parsed.rarity === 'unique') return { error: parsed.blockedReason ?? '此装备不能用于当前制作模型。' };
      if (!parsed.complete) return { error: `替代底材尚未完整识别：${parsed.warnings.join(' ') || '请先核对词缀及具体底座。'}` };
      if (parsed.baseId !== props.baseId) return { error: '替代底材必须与当前装备同为戒指或同为项链，才能比较同一组目标。' };
      if (!parsed.baseId || parsed.level === undefined) return { error: '替代底材缺少已确认的类别或物品等级。' };
      const item: ExistingItem = {
        baseId: parsed.baseId, level: parsed.level, rarity: parsed.rarity,
        prefixes: parsed.prefixes, suffixes: parsed.suffixes,
      };
      const name = parsed.baseNameEnglish ?? parsed.baseName;
      const potential = assessCraftPotential({ engine: props.engine, item, baseName: name,
        options: props.options, targets: props.candidate.targets });
      // Reassess the pasted alternative. The old candidate's blockReason belongs to the old item.
      const selected = potential.candidates.find((candidate) => candidate.id === 'selected');
      if (potential.status === 'blocked' || selected?.blockReason) return {
        error: selected?.blockReason ?? potential.summary,
      };
      return { item, name };
    } catch (failure) {
      return { error: failure instanceof Error ? failure.message : '替代底材解析失败，请核对完整文本。' };
    }
  }, [raw, props.engine, props.baseId, props.options, props.candidate.targets]);

  useEffect(() => { busyCallback.current = props.onBusyChange; }, [props.onBusyChange]);
  useEffect(() => { busyCallback.current(busy); }, [busy]);
  useEffect(() => () => {
    generation.current++; runner.current?.cancel(); busyCallback.current(false);
  }, []);

  function reset() {
    generation.current++; runner.current?.cancel(); runner.current = null;
    setBusy(false); setProgress(null); setResult(null); setError(''); setNotice('');
  }
  function cancel() {
    reset(); setNotice('已停止替代底材计算，尚未完成的结果不会用于经济比较。');
  }
  async function calculate() {
    if (busy || props.disabled || !replacement.item || replacement.error) return;
    const alternative = replacement.item;
    if (alternative.rarity === 'normal' && buyPrice === undefined) {
      setError('白色底材的每次重买也要收费，请先填写这件底材的实际买价。'); return;
    }
    const run = ++generation.current;
    setResult(null); setError(''); setNotice(''); setProgress(null); setBusy(true);
    try {
      // The initial purchase is added by compareRestartCost. A white-base solve charges this
      // same quote only when its policy later discards the item and buys another base.
      const request = makeSolveRequest(props.engine, alternative, props.candidate.targets, props.mods,
        props.options, props.effort, alternative.rarity === 'normal' ? buyPrice! : 0, props.playOut);
      const job = computeWorkbench(request, props.overrides, (value) => {
        if (generation.current === run) setProgress(value);
      });
      runner.current = job;
      const outcome = await job.promise;
      if (generation.current === run) setResult(outcome);
    } catch (failure) {
      if (generation.current === run) setError(failure instanceof Error ? failure.message : '替代底材计算未完成。');
    } finally {
      if (generation.current === run) { runner.current = null; setBusy(false); setProgress(null); }
    }
  }

  const evidence = result ? craftCostEvidence(result) : undefined;
  const comparison = compareRestartCost(props.original, evidence, buyPrice, props.currentValue);
  const needsWhitePrice = replacement.item?.rarity === 'normal' && buyPrice === undefined;
  const fractured = replacement.item ? [...replacement.item.prefixes, ...replacement.item.suffixes]
    .filter((entry) => entry.fractured).length : 0;

  return <details className="wb-details wb-restart-comparison">
    <summary>比较另一个底材</summary>
    <p>粘贴准备购买的另一件底材，按上方完全相同的目标重新求解；使用它实际带有的词缀、物等与破裂状态。</p>
    <label>替代底材的完整装备文本<textarea rows={6} aria-label={`${props.candidate.title} 替代底材文本`}
      value={raw} disabled={busy || props.disabled} placeholder="从游戏或官网复制另一件底材，粘贴到这里"
      onChange={(event) => { reset(); setRaw(event.target.value); }} /></label>
    <label>替代底材买价 · Ex<input type="number" min="0" step="any" aria-label={`${props.candidate.title} 替代底材买价`}
      value={priceText} disabled={busy || props.disabled} placeholder="填写实际挂单买价"
      onChange={(event) => {
        if (replacement.item?.rarity === 'normal') reset();
        setPriceText(event.target.value);
      }} /></label>
    {replacement.error && <p className="wb-inline-warning" role="alert">{replacement.error}</p>}
    {replacement.item && <p className="wb-fine">已确认 {replacement.name}，物等 {replacement.item.level}，
      {replacement.item.prefixes.length + replacement.item.suffixes.length} 条现有词缀，{fractured} 条破裂锁定。</p>}
    {needsWhitePrice && <p className="wb-fine">白色底材需要实际买价，才能计入之后重来时的重买费用。</p>}
    {replacement.item?.rarity === 'normal' && buyPrice !== undefined && <p className="wb-fine">初次买价计 {formatCost(buyPrice)} Ex；策略以后每次重买也按 {formatCost(buyPrice)} Ex 计价。更改买价后需重新计算。</p>}
    <div className="wb-actions"><button className="wb-button" disabled={!busy && (props.disabled || !replacement.item || Boolean(replacement.error) || needsWhitePrice)}
      onClick={() => busy ? cancel() : void calculate()}>{busy ? '停止替代底材计算' : '计算更换底材成本'}</button></div>
    {busy && <div className="wb-progress" role="status"><div><span>按替代底材的真实状态计算…</span><span>{Math.round((progress?.fraction ?? 0) * 100)}%</span></div><progress max={1} value={progress?.fraction ?? 0} /></div>}
    {error && <p className="wb-inline-warning" role="alert">{error}</p>}
    {notice && <p className="wb-fine" role="status">{notice}</p>}
    {evidence && <>
      <div className="wb-advisor-cost"><small>替代底材的后续制作成本</small><strong>{evidence.cost !== undefined
        ? `${evidence.kind === 'lower' ? '≥ ' : evidence.kind === 'upper' ? '≤ ' : ''}${formatCost(evidence.cost)} Ex`
        : evidence.kind === 'unreachable' ? '当前条件不可达' : '尚无可靠成本'}</strong>
      <span>{evidence.kind === 'exact' ? '当前模型已收敛' : '需要补齐可比较的成本证据'}</span></div>
      <div className={`wb-advisor-judgement ${comparison.tone}`}><strong>{comparison.title}</strong><p>{comparison.detail}</p>
        {comparison.total !== undefined && <p>更换底材的净期望追加成本：{formatCost(comparison.total)} Ex</p>}</div>
    </>}
    <p className="wb-fine">原装备可售价仅在你填写后抵扣。此处用于购买前比较，购买后再导入实际装备继续制作；固定词缀、品质和底座特性另行核对。</p>
  </details>;
}
