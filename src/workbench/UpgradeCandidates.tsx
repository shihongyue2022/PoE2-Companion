import { useEffect, useRef, useState } from 'react';
import { localizeEquipmentName, localizeEquipmentStat, type Equipment } from './genericEquipment';
import { estimateCurrencyName, fetchMarketEstimate, type MarketEstimateResult } from './marketEstimate';
import type { FlexibleTradeDocument } from './tradeSearch';
import { equipmentFromListing, scoreUpgrade, type UpgradeComponent } from './upgradeRanking';
import { TradeMemoryActions } from './TradeMemoryActions';
import { rememberTrade } from './tradeMemory';
import type { LoadoutContext } from './loadoutIntegration';
import { compareCandidate, slotLabel } from './loadout';

interface Props {
  query: FlexibleTradeDocument; url: string; league: string; components: readonly UpgradeComponent[];
  onCompare?: (equipment: Equipment) => void;
  itemRaw?: string;
  loadoutContext?: LoadoutContext;
}
const number = (value: number) => Number(value.toFixed(2)).toLocaleString('zh-CN');
export default function UpgradeCandidates({ query, url, league, components, onCompare, itemRaw, loadoutContext }: Props) {
  const [result, setResult] = useState<MarketEstimateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [memoryError, setMemoryError] = useState('');
  const memory = { query, league, raw: itemRaw, title: `${localizeEquipmentName(query.query.type ?? '同类装备')} · 综合找升级` };
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000))), 500);
    return () => clearInterval(timer);
  }, [retryAt]);
  async function search() {
    if (busy || Date.now() < retryAt) return;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setBusy(true); setError(''); setResult(null);
    try {
      const next = await fetchMarketEstimate(query, league, request.signal);
      if (request.signal.aborted) return;
      setResult(next);
      setMemoryError(rememberTrade(memory, { observation: { at: next.ok ? next.sampledAt : new Date().toISOString(),
        message: next.ok ? `综合候选匹配 ${next.total} 件，已读取 ${next.fetched} 件` : next.error.message,
        detail: '按保存的权重与预算进行官方加权排序；此摘要不是价格估计。', failed: !next.ok } }));
      if (!next.ok && next.error.retryAfterSeconds) {
        setRetryAt(Date.now() + next.error.retryAfterSeconds * 1000); setRemaining(next.error.retryAfterSeconds);
      }
    } catch (failure) {
      if (!request.signal.aborted) {
        const message = failure instanceof Error ? failure.message : '无法读取市场候选，请打开官网查看。';
        setError(message);
        setMemoryError(rememberTrade(memory, { observation: { at: new Date().toISOString(), message,
          detail: '请求未成功，不代表没有候选挂单。', failed: true } }));
      }
    } finally { if (!request.signal.aborted) setBusy(false); }
  }
  const candidates = result?.ok ? (result.listings ?? []).flatMap((listing, index) => {
    const equipment = equipmentFromListing(listing);
    return equipment ? [{ listing, equipment, index, ...scoreUpgrade(equipment, components),
      comparison: loadoutContext ? compareCandidate(loadoutContext.state, loadoutContext.slot, equipment) : undefined }] : [];
  }).sort((a, b) => b.score - a.score || a.index - b.index) : [];
  return <section className="wb-price-estimate" aria-label="市场综合候选">
    <div className="wb-row wb-wrap"><h3>按当前方向综合挑选</h3>
      <button className="wb-button" disabled={busy || remaining > 0} onClick={() => { void search(); }}>
        {busy ? '正在搜索综合候选…' : remaining > 0 ? `${remaining} 秒后可重试` : '搜索市场综合候选'}
      </button></div>
    <TradeMemoryActions {...memory} />
    {memoryError && <p className="wb-inline-warning" role="status">{memoryError}</p>}
    <p className="wb-fine">当前装备综合分为 100。按所选词缀的相对数值与权重排序，允许属性之间取舍；这不是实战伤害或生存提升百分比。装备面板防御、DPS 和未选属性不计分，可通过最低要求保留底线。</p>
    {busy && <p role="status">正在读取官方加权排序靠前的候选，最多 20 件。</p>}
    {error && <p role="alert">{error}</p>}
    {result && !result.ok && <p role="alert">{result.error.message}</p>}
    {result?.ok && <>
      <p>官方匹配 {result.total.toLocaleString('zh-CN')} 件 · 读取 {result.fetched} 件 · 可比较 {candidates.length} 件 · {result.cached ? '两分钟内缓存' : '实时请求'}</p>
      {!candidates.length && <p>{result.total === 0 ? '没有匹配的挂单，可放宽最低要求或增加预算。' : '候选信息不足，请在官网核对。'}</p>}
      {candidates.length > 0 && !candidates.some((candidate) => candidate.improved) && <p>已读取候选的综合分均未超过当前装备；请调整权重或条件，不建议仅因排名靠前就替换。</p>}
      {candidates.map((candidate, index) => <article className="wb-card" key={candidate.listing.id}>
        <div className="wb-row wb-wrap"><strong>#{index + 1} {localizeEquipmentName(candidate.listing.name || candidate.listing.base)}</strong>
          <span>综合分 {number(candidate.score)} · {candidate.improved ? '+' : ''}{number(candidate.score - 100)}%</span>
          <span>{number(candidate.listing.price.amount)} {estimateCurrencyName(candidate.listing.price.currency)}</span></div>
        {candidate.comparison && <div className="wb-fine"><p>角色{slotLabel(loadoutContext!.slot)}：{candidate.comparison.title} · {candidate.comparison.priorityDirection}</p>
          {candidate.comparison.targets.map((target) => <p key={target.key}>{target.label}：换后 {number(target.after)}% / 目标 {target.minimum}% · {target.met ? '达标' : '未达标'}</p>)}
          {!!candidate.comparison.warnings.length && <p>{candidate.comparison.warnings.join(' ')}</p>}</div>}
        <p>{localizeEquipmentName(candidate.listing.base)} · {candidate.tradeoff ? '有取舍，含下降属性' : candidate.improved ? '已计分属性提升' : '已计分属性未提升'}</p>
        <details><summary>查看评分依据与具体差值</summary>
          {candidate.parts.map((part) => <p key={part.key}>{part.label}：{number(part.baseline)} → {number(part.after)}（{part.delta > 0 ? '+' : ''}{number(part.delta)}）</p>)}
          {candidate.listing.properties?.map((line, lineIndex) => <p key={`property:${lineIndex}`}>{line}</p>)}
          {candidate.listing.explicitMods?.map((line, lineIndex) => <p key={`mod:${lineIndex}`}>{localizeEquipmentStat(line)}</p>)}
        </details>
        {candidate.unknown.length > 0 && <p className="wb-inline-warning">{candidate.unknown.length} 项词缀未识别，未计入综合分，请核对原文。</p>}
        {onCompare && <button className="wb-button" onClick={() => onCompare(candidate.equipment)}>加入换装比较</button>}
        <a className="wb-link" href={result.url} target="_blank" rel="noreferrer">在官方候选列表中核对 →</a>
      </article>)}
      {result.warnings.map((warning, index) => <p className="wb-fine" key={index}>{warning}</p>)}
    </>}
    <p><a className="wb-link" href={result?.url ?? url} target="_blank" rel="noreferrer">打开官方综合排序搜索 ↗</a></p>
  </section>;
}
