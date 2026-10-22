import { useEffect, useRef, useState } from 'react';
import type { FlexibleTradeDocument } from './tradeSearch';
import {
  estimateCurrencyName, estimateNumber, estimateSummary, fetchMarketEstimate,
  type MarketEstimateResult,
} from './marketEstimate';

export interface PriceEstimateProps {
  query: FlexibleTradeDocument;
  url: string;
  league: string;
  auto?: boolean;
  onEstimate?: (summary: { message: string; detail: string; url: string; status?: 'ready' | 'error' }) => void;
}

/** A changed search owns fresh state, so an old item's prices cannot leak into its replacement. */
export function PriceEstimate(props: PriceEstimateProps) {
  const key = `${props.league}:${JSON.stringify(props.query)}`;
  return <PriceEstimateRequest key={key} {...props} />;
}

function PriceEstimateRequest({ query, url, league, auto = false, onEstimate }: PriceEstimateProps) {
  const [result, setResult] = useState<MarketEstimateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const callback = useRef(onEstimate);
  const currentRequest = useRef<() => Promise<void>>(() => Promise.resolve());
  useEffect(() => {
    callback.current = onEstimate;
    currentRequest.current = async () => {
      if (busy || Date.now() < cooldownUntil) return;
      const requestId = ++sequence.current;
      controller.current?.abort();
      const request = new AbortController();
      controller.current = request;
      setBusy(true); setError(''); setResult(null);
      try {
        const next = await fetchMarketEstimate(query, league, request.signal);
        if (request.signal.aborted || requestId !== sequence.current) return;
        setResult(next);
        if (!next.ok && next.error.retryAfterSeconds) {
          setCooldownUntil(Date.now() + next.error.retryAfterSeconds * 1000);
          setRemaining(next.error.retryAfterSeconds);
        }
        callback.current?.(estimateSummary(next, url));
      } catch (failure) {
        if (request.signal.aborted || requestId !== sequence.current) return;
        const message = failure instanceof Error ? failure.message : '暂时无法获取官方挂单。';
        setError(message);
        callback.current?.({ message, detail: '请打开官方交易页面查看。', url, status: 'error' });
      } finally {
        if (!request.signal.aborted && requestId === sequence.current) setBusy(false);
      }
    };
  });

  useEffect(() => {
    const timer = auto ? window.setTimeout(() => { void currentRequest.current(); }, 700) : undefined;
    return () => window.clearTimeout(timer);
  }, [auto]);

  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    if (!cooldownUntil) return;
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) { setCooldownUntil(0); window.clearInterval(timer); }
    }, 500);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  return <section className="wb-price-estimate" aria-label="装备估价">
    <div className="wb-row wb-wrap">
      <h3>相似装备挂牌参考</h3>
      <button type="button" className="wb-button" disabled={busy || remaining > 0}
        onClick={() => { void currentRequest.current(); }}>
        {busy ? '正在查询官方挂单…' : remaining > 0 ? `${remaining} 秒后可重试` : '获取挂牌估价'}
      </button>
    </div>
    <p className="wb-muted">按当前勾选条件查询官方低价挂单，最多取 20 件。同币种分组、同卖家去重；这里显示挂牌样本，不代表整件装备的成交价格。</p>
    {busy && <p role="status">正在读取官方搜索和标价，请稍候。</p>}
    {error && <p className="wb-warning" role="alert">{error}</p>}
    {result && !result.ok && <p className="wb-warning" role="alert">{result.error.message}</p>}
    {result?.ok && <div aria-live="polite">
      <p className="wb-muted">匹配 {result.total.toLocaleString('zh-CN')} 件 · 已取 {result.fetched} 件 · 有效样本 {result.priced} 件
        {result.duplicateSellers > 0 ? ` · 去重 ${result.duplicateSellers} 件` : ''}
        {' · '}{result.cached ? '两分钟内的缓存' : '实时请求'} · {new Date(result.sampledAt).toLocaleTimeString('zh-CN')}</p>
      {!result.groups.length && <p>{result.total === 0 ? '没有找到挂单。可切换“宽松比较”或减少勾选属性。' : '样本中没有有效标价，请到官网核对。'}</p>}
      {result.groups.map((group) => <div className="wb-card" key={group.currency}>
        <strong>{estimateNumber(group.p25)}–{estimateNumber(group.p75)} {estimateCurrencyName(group.currency)}</strong>
        <p>低价样本中间 50% 区间 · {group.count} 个卖家</p>
        <p className="wb-muted">样本中位数 {estimateNumber(group.median)} · 最低 {estimateNumber(group.min)} · 最高 {estimateNumber(group.max)}</p>
      </div>)}
      {result.warnings.map((warning) => <p key={warning} className="wb-muted">{warning}</p>)}
    </div>}
    {(error || result) && <p><a className="wb-link" href={result?.url ?? url} target="_blank" rel="noreferrer">在官方交易网站核对挂单 ↗</a></p>}
  </section>;
}
