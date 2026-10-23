import { useEffect, useMemo, useRef, useState } from 'react';
import type { Engine, EngineMod, ExistingItem, TargetInput } from '../lib/engine';
import type { SolveProgress, SolveResult } from '../lib/solve';
import type { GearTrade } from '../lib/gearTrade';
import { assessCraftPotential, type CraftCandidate } from './craftPotential';
import { craftCostEvidence, judgeCraftCost } from './craftAdvice';
import { computeWorkbench } from './compute';
import { formatCost, makeSolveRequest, type CraftOptions } from './model';
import { translateCurrency, translateModAtTier } from './localization';
import { buildFlexibleTrade, buildTradeFilterRows } from './tradeSearch';
import RestartComparison from './RestartComparison';
import PresetNumberInput, { budgetPresets } from './PresetNumberInput';

interface AdvisorProps {
  engine: Engine;
  mods: ReadonlyMap<string, EngineMod>;
  item: ExistingItem;
  targets: readonly TargetInput[];
  baseName: string;
  options: CraftOptions;
  overrides: Record<string, number>;
  restriction?: string | null;
  league: string;
  tradeData: GearTrade | null;
  effort: number;
  baseCost: number;
  playOut: boolean;
  currentResult: SolveResult | null;
  mainSolving: boolean;
  onBusyChange: (busy: boolean) => void;
  onAdopt: (targets: readonly TargetInput[], result?: SolveResult, seconds?: number) => void;
}

interface Outcome { result?: SolveResult; error?: string; seconds?: number }
const targetsKey = (targets: readonly TargetInput[]) => targets.map((entry) =>
  `${entry.modId}:${entry.tierDisplay}:${entry.slot ?? ''}`).sort().join('|');
const amount = (text: string): number | undefined => {
  if (text.trim() === '') return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
};

/** Changing the item, prices, options or goal invalidates all old advice and cancels its worker. */
export default function CraftAdvisor(props: AdvisorProps) {
  const signature = JSON.stringify({ item: props.item, targets: props.targets, baseName: props.baseName,
    options: props.options, overrides: props.overrides, restriction: props.restriction,
    effort: props.effort, playOut: props.playOut, baseCost: props.baseCost, patch: props.engine.data.patch });
  return <AdvisorBody key={signature} {...props} />;
}

function AdvisorBody(props: AdvisorProps) {
  const { engine, item, mods, targets, options, overrides, restriction, baseName, onBusyChange } = props;
  const assessment = useMemo(() => assessCraftPotential({ engine, item, baseName, options,
    ...(restriction ? { restriction } : {}), targets }), [engine, item, baseName, options, restriction, targets]);
  const [budgetText, setBudgetText] = useState('');
  const [currentValueText, setCurrentValueText] = useState('');
  const [quotes, setQuotes] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [busy, setBusy] = useState(false);
  const [restartId, setRestartId] = useState('');
  const restartBusy = Boolean(restartId);
  const [active, setActive] = useState('');
  const [progress, setProgress] = useState<SolveProgress | null>(null);
  const [notice, setNotice] = useState('');
  const runner = useRef<ReturnType<typeof computeWorkbench> | null>(null);
  const generation = useRef(0);
  const budget = amount(budgetText);
  const currentValue = amount(currentValueText);
  const eligible = assessment.candidates.filter((candidate) => !candidate.blockReason);
  const effectiveCurrentTargets = [...targets];
  for (const entry of [...item.prefixes, ...item.suffixes].filter((entry) => entry.fractured)) {
    if (!effectiveCurrentTargets.some((target) => target.modId === entry.modId)) effectiveCurrentTargets.push({ modId: entry.modId, tierDisplay: entry.tierDisplay });
  }

  useEffect(() => { onBusyChange(busy || restartBusy); }, [busy, restartBusy, onBusyChange]);
  useEffect(() => () => { generation.current++; runner.current?.cancel(); onBusyChange(false); }, [onBusyChange]);

  function outcomeFor(candidate: CraftCandidate): Outcome | undefined {
    if (outcomes[candidate.id]) return outcomes[candidate.id];
    if (props.currentResult && targetsKey(candidate.targets) === targetsKey(effectiveCurrentTargets)) return { result: props.currentResult };
    return undefined;
  }

  function cancel() {
    generation.current++; runner.current?.cancel(); runner.current = null;
    setBusy(false); setActive(''); setProgress(null); setNotice('已停止评估，已完成的结果仍可查看。');
  }
  async function analyze(one?: CraftCandidate) {
    if (busy || restartBusy || props.mainSolving) return;
    const run = ++generation.current;
    setBusy(true); setNotice('');
    const candidates = one ? [one] : eligible;
    try {
      for (const candidate of candidates) {
        if (candidate.blockReason || run !== generation.current) continue;
        setActive(candidate.id); setProgress(null);
        const reused = outcomeFor(candidate);
        if (reused?.result && craftCostEvidence(reused.result).kind === 'exact') {
          setOutcomes((old) => ({ ...old, [candidate.id]: reused })); continue;
        }
        const start = performance.now();
        try {
          const request = makeSolveRequest(engine, item, candidate.targets, mods, options, props.effort, props.baseCost, props.playOut);
          const job = computeWorkbench(request, overrides, (value) => { if (generation.current === run) setProgress(value); });
          runner.current = job;
          const result = await job.promise;
          if (generation.current !== run) return;
          setOutcomes((old) => ({ ...old, [candidate.id]: { result, seconds: (performance.now() - start) / 1000 } }));
        } catch (error) {
          if (generation.current !== run) return;
          setOutcomes((old) => ({ ...old, [candidate.id]: { error: error instanceof Error ? error.message : String(error) } }));
        } finally { if (generation.current === run) runner.current = null; }
      }
    } finally {
      if (generation.current === run) { setBusy(false); setActive(''); setProgress(null); }
    }
  }

  let replacementUrl: string | undefined;
  if (props.league.trim() && assessment.replacementLevel) {
    try {
      replacementUrl = buildFlexibleTrade({ league: props.league, baseId: item.baseId, baseName,
        itemLevelMin: assessment.replacementLevel, status: 'any', rows: [] }).url;
    } catch { /* The diagnosis remains useful when the market link cannot be constructed. */ }
  }

  return <section className={`wb-panel wb-advisor potential-${assessment.status}`} aria-label="底材与做装建议">
    <div className="wb-section-head"><div><span className="wb-eyebrow">CRAFTING ADVISOR</span><h3>这件装备，值得继续做吗？</h3></div><span className="wb-tag">规则快照 {engine.data.patch}</span></div>
    <div className="wb-advisor-verdict"><strong>{assessment.headline}</strong><p>{assessment.summary}</p></div>
    {assessment.constraints.length > 0 && <ul className="wb-advisor-reasons">{assessment.constraints.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
    {assessment.ceilings.length > 0 && <details className="wb-details wb-advisor-ceilings" open={assessment.status === 'limited'}><summary>查看已有词缀的提升上限</summary><div className="wb-advisor-ceiling-head"><span>词缀方向</span><span>当前</span><span>此装备最高</span></div>{assessment.ceilings.map((row) => <div className="wb-advisor-ceiling" key={row.modId} data-ceiling-id={row.modId}><div><strong>{row.label}</strong>{row.reason && <small>{row.reason}</small>}</div><span>T{row.currentTier}{row.fractured ? ' · 锁定' : ''}</span><span>{row.bestTier ? `T${row.bestTier}` : '待确认'}{row.topRequiredLevel && row.topRequiredLevel > item.level && <small>T1 需物等 {row.topRequiredLevel}</small>}</span></div>)}</details>}
    {replacementUrl && <a className="wb-text-button" href={replacementUrl} target="_blank" rel="noreferrer">查物等 {assessment.replacementLevel}+ 的同底座底材 ↗</a>}
    {assessment.candidates.length > 0 && <details className="wb-fold"><summary>比较制作目标与重新购买底装 · {assessment.candidates.length} 个方案</summary>
      <div className="wb-advisor-budget"><PresetNumberInput label="追加材料预算" value={budgetText} onChange={setBudgetText} min={0} automaticLabel="先比较成本，不限制预算" unit="Ex" presets={budgetPresets([0, 100, 500, 1000, 5000, 10000])} /><details><summary>当前装备可售参考价（可选）</summary><label>已核对的挂牌参考 · Ex<input aria-label="建议当前装备可售参考价" type="number" min="0" step="any" placeholder="有实际报价再填写" value={currentValueText} onChange={(event) => setCurrentValueText(event.target.value)} /></label></details></div>
      <div className="wb-advisor-toolbar"><button className="wb-button primary" disabled={props.mainSolving || restartBusy || (!busy && !eligible.length)} onClick={() => busy ? cancel() : void analyze()}>{busy ? '停止评估' : '评估加工成本'}</button><p>逐个比较可行方案，沿用下方制作方式、搜索精度和材料价格。预算用于比较期望消耗，单次做装可能超支。</p></div>
      {busy && <div className="wb-progress" role="status"><div><span>正在评估：{assessment.candidates.find((candidate) => candidate.id === active)?.title ?? '准备中'}</span><span>{Math.round((progress?.fraction ?? 0) * 100)}%</span></div><progress max={1} value={progress?.fraction ?? 0} /></div>}
      {notice && <p className="wb-fine" role="status">{notice}</p>}
      <div className="wb-advisor-candidates">{assessment.candidates.map((candidate) => {
        const outcome = outcomeFor(candidate);
        const evidence = outcome?.result ? craftCostEvidence(outcome.result) : undefined;
        const judgement = evidence ? judgeCraftCost(evidence, budget, amount(quotes[candidate.id] ?? ''), currentValue) : undefined;
        let trade: ReturnType<typeof buildFlexibleTrade> | undefined;
        if (props.tradeData && props.league.trim()) {
          try {
            const rows = buildTradeFilterRows(engine.data, props.tradeData, candidate.targets).map((row) => ({ ...row, enabled: Boolean(row.ids.length) }));
            trade = buildFlexibleTrade({ league: props.league, baseId: item.baseId, rows, status: 'any' });
          } catch { /* Omit the link instead of hiding diagnosis when league/target data is incomplete. */ }
        }
        return <article className={`wb-advisor-candidate ${candidate.blockReason ? 'blocked' : ''}`} key={candidate.id} data-candidate-id={candidate.id}>
          <div className="wb-advisor-candidate-head"><h3>{candidate.title}</h3><span className="wb-tag">{candidate.blockReason ? '先解决限制' : candidate.improvementCount ? `${candidate.improvementCount} 项阶层提升` : '现有／自定目标'}</span></div><p>{candidate.description}</p>
          <ul className="wb-advisor-targets">{candidate.targets.map((entry) => <li key={entry.modId}><b>T{entry.tierDisplay}</b><span>{mods.get(entry.modId) ? translateModAtTier(mods.get(entry.modId)!, entry.tierDisplay) : entry.modId}</span>{candidate.preservedFractureIds.includes(entry.modId) && <small>破裂保留</small>}</li>)}</ul>
          {candidate.blockReason && <p className="wb-inline-warning">{candidate.blockReason}</p>}
          {candidate.droppedCurrentLabels.length > 0 && <p className="wb-advisor-risk">此方案未要求保留：{candidate.droppedCurrentLabels.join('、')}。随机操作可能失去这些词缀。</p>}
          {outcome?.error && <p className="wb-inline-warning" role="alert">评估未完成：{outcome.error}</p>}
          {evidence && <><div className="wb-advisor-cost"><small>后续材料期望成本</small><strong>{evidence.cost !== undefined ? `${evidence.kind === 'lower' ? '≥ ' : evidence.kind === 'upper' ? '≤ ' : ''}${formatCost(evidence.cost)} Ex` : evidence.kind === 'unreachable' ? '当前条件不可达' : '尚无可靠成本'}</strong><span>{evidence.kind === 'exact' ? '当前模型已收敛' : evidence.kind === 'lower' ? '仅得到成本下界' : evidence.kind === 'upper' ? '当前策略成本上界' : '需要进一步核对或搜索'}</span>{evidence.p95 !== undefined && <span>抽样 P95：{formatCost(evidence.p95)} Ex</span>}</div>
            {judgement && <div className={`wb-advisor-judgement ${judgement.tone}`}><strong>{judgement.title}</strong><p>{judgement.detail}</p></div>}
            {evidence.nextAction && <p className="wb-advisor-next">建议下一步：{evidence.nextAction}</p>}
            {evidence.reason && <p className="wb-fine">{evidence.reason}</p>}
            {evidence.materials.length > 0 && <details className="wb-details"><summary>查看抽样平均材料消耗</summary><div className="wb-resource-table">{evidence.materials.map((move, index) => <div key={index}><span>{translateCurrency(move.label)}</span><span>平均 {formatCost(move.count)} 次</span><b>{formatCost(move.spent)} Ex</b></div>)}</div></details>}
          </>}
          {!candidate.blockReason && <details><summary>加入成品报价比较（可选）</summary><label className="wb-advisor-quote">此目标成品的官网参考价<input aria-label={`${candidate.title} 成品参考价`} type="number" min="0" step="any" value={quotes[candidate.id] ?? ''} placeholder="有实际报价再填写 · Ex" onChange={(event) => setQuotes((old) => ({ ...old, [candidate.id]: event.target.value }))} /></label></details>}
          <div className="wb-actions">{!candidate.blockReason && <><button className="wb-button" disabled={busy || restartBusy || props.mainSolving} onClick={() => evidence && ['exact', 'upper'].includes(evidence.kind) && outcome?.result ? props.onAdopt(candidate.targets, outcome.result, outcome.seconds) : void analyze(candidate)}>{evidence && ['exact', 'upper'].includes(evidence.kind) ? '查看通货顺序' : '单独评估此方案'}</button><button className="wb-text-button" disabled={busy || restartBusy || props.mainSolving} onClick={() => props.onAdopt(candidate.targets)}>采用此目标</button></>}{trade && <a className="wb-text-button" href={trade.url} target="_blank" rel="noreferrer">对比此目标的成品 ↗</a>}</div>
          <RestartComparison engine={engine} mods={mods} candidate={candidate} original={evidence} baseId={item.baseId} options={options} overrides={overrides} effort={props.effort} baseCost={props.baseCost} playOut={props.playOut} currentValue={currentValue} disabled={busy || props.mainSolving || (restartBusy && restartId !== candidate.id)} onBusyChange={(value) => setRestartId((old) => value ? candidate.id : old === candidate.id ? '' : old)} />
          {trade && trade.warnings.length > 0 && <p className="wb-fine">官网属性存在映射歧义，请进入交易页核对条件。</p>}
        </article>;
      })}</div>
    </details>}
    <details className="wb-details"><summary>建议依据与适用范围</summary>{assessment.notes.map((note, index) => <p key={index}>{note}</p>)}<p>经济比较仅使用你填写的同目标成品价格和当前装备参考价。当前装备价值 + 后续材料成本超过成品价时，会建议优先比较直接购买；未计售出时间与交易差价。</p></details>
  </section>;
}
