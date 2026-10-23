import { useEffect, useRef, useState } from 'react';
import { corePriceAxes, corePriceQuery, listingCoreValue } from './corePricing';
import type { EquipmentTradeOptions } from './genericEquipmentTrade';
import type { RollGuide } from './searchGuidance';
import { estimateCurrencyName, estimateNumber, fetchMarketEstimate, type MarketEstimateResult } from './marketEstimate';
import type { PriceEstimateProps } from './PriceEstimate';
import { equipmentDisplayName, type Equipment } from './genericEquipment';
import { equipmentFromListing } from './upgradeRanking';
import { canonicalQuoteCurrency } from './loadoutQuotes';
import { rememberTrade } from './tradeMemory';

export default function CorePriceEstimate({ options, guides, auto, onEstimate, onRecordQuote, onCompare }: {
  options: EquipmentTradeOptions; guides: ReadonlyMap<string, RollGuide>; auto?: boolean;
  onEstimate?: PriceEstimateProps['onEstimate']; onRecordQuote?: PriceEstimateProps['onRecordQuote']; onCompare?: (item: Equipment) => void;
}) {
  const axes = corePriceAxes(options.equipment, options.rows);
  const [key, setKey] = useState(axes[0]?.key ?? ''), [width, setWidth] = useState(3), [offset, setOffset] = useState<-1 | 0 | 1>(0);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ data: MarketEstimateResult; band: ReturnType<typeof corePriceQuery> }>();
  const request = useRef<AbortController | null>(null), latest = useRef<() => void>(() => {});
  const core = axes.find((row) => row.key === key) ?? axes[0];
  let band: ReturnType<typeof corePriceQuery> | undefined, invalid = '';
  if (core) try { band = corePriceQuery(options, core, width, offset, false, guides.get(core.key)); } catch (error) { invalid = String(error); }
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { if (!retry) return; const timer = setInterval(() => setRetry((old) => Math.max(0, old - 1)), 1000); return () => clearInterval(timer); }, [retry]);
  async function read(overview: boolean) {
    if (!core || busy || retry) return;
    let chosen: ReturnType<typeof corePriceQuery>;
    try { chosen = corePriceQuery(options, core, width, offset, overview, guides.get(core.key)); } catch (error) { setMessage(String(error)); return; }
    const task = new AbortController(); request.current?.abort(); request.current = task;
    setBusy(true); setMessage(''); setResult(undefined);
    try {
      const data = await fetchMarketEstimate(chosen.query, options.league, task.signal);
      if (task.signal.aborted) return;
      setResult({ data, band: chosen }); setRetry(data.ok ? 15 : data.error.retryAfterSeconds ?? 0);
      if (!data.ok) { setMessage(data.error.message); onEstimate?.({ status: 'error', message: data.error.message, detail: '查询失败，不代表没有同档物品。', url: chosen.url }); }
      else {
        const description = overview ? '核心属性降序市场参考' : `核心属性 ${chosen.min}–${chosen.max} 同档挂牌`;
        rememberTrade({ query: chosen.query, league: options.league, raw: options.equipment.raw, title: equipmentDisplayName(options.equipment) }, { observation: { at: data.sampledAt, message: description, detail: `核心 ${core.label} · ${data.total} 个匹配 · 查看逐件挂牌`, failed: false } });
        onEstimate?.({ status: 'ready', message: description, detail: `匹配 ${data.total} 件。按核心数值比较；在工坊查看逐件标价，不混算不同档位。`, url: chosen.url });
      }
    } catch (error) { if (!task.signal.aborted) setMessage(error instanceof Error ? error.message : '查询失败。'); }
    finally { if (!task.signal.aborted) setBusy(false); }
  }
  useEffect(() => { latest.current = () => { void read(false); }; });
  useEffect(() => { if (!auto) return; const timer = setTimeout(() => latest.current(), 700); return () => clearTimeout(timer); }, [auto]);
  function reset() { request.current?.abort(); setBusy(false); setResult(undefined); setMessage(''); }
  const data = result?.data.ok ? result.data : undefined;
  const samples = data?.listings?.map((listing) => ({ listing, value: core ? listingCoreValue(listing, core) : undefined })) ?? [];
  // Verify the public returned item, not just the requested search bounds. Unreadable
  // cores are shown separately and never used for price bands or recorded values.
  const comparable = result && !result.band.overview ? samples.filter(({ value }) => value !== undefined && value >= result.band.min - .0001 && value <= result.band.max + .0001) : [];
  const currencies = [...new Set(comparable.map(({ listing }) => listing.price.currency))];
  return <section className="wb-price-estimate wb-core-price" aria-label="核心属性档位估价">
    <div className="wb-section-head"><h3>核心属性 → 相近档位 → 比价格</h3><span className="wb-tag">逐件挂牌参考</span></div>
    {!core ? <p>暂无能核对数值的核心属性。请先识别词缀，或按同名／底座查看官方挂牌。</p> : <>
      <div className="wb-actions"><label>价格核心属性<select aria-label="价格核心属性" value={core.key} onChange={(event) => { reset(); setKey(event.target.value); setOffset(0); }}>{axes.map((row) => <option key={row.key} value={row.key}>{row.label} · 当前 {row.actualValue}</option>)}</select></label>
        <label>相近档位<select aria-label="核心属性相近范围" value={width} onChange={(event) => { reset(); setWidth(Number(event.target.value)); }}>{[0, 1, 3, 5].map((number) => <option key={number} value={number}>{number ? `±${number}%（至少 ±1 点）` : '相同数值'}</option>)}</select></label></div>
      <div className="wb-actions" role="group" aria-label="核心属性价格档位">{([[-1, '低一档'], [0, '当前档'], [1, '高一档']] as const).map(([value, label]) => <button type="button" className="wb-button" key={value} aria-pressed={offset === value} onClick={() => { reset(); setOffset(value); }}>{label}</button>)}</div>
      <p className="wb-fine">当前核心值 {core.actualValue} · 本次档位 {band ? `${band.min}–${band.max}` : invalid}。保留同名、底座、腐化与已锁定的硬条件；其余可选词缀不作价格门槛。自动建议只用于起点，可切换你认为影响价格最大的属性。</p>
      <div className="wb-actions"><button type="button" className="wb-button" disabled={busy || retry > 0} onClick={() => { void read(true); }}>① 核心属性降序看市场</button><button type="button" className="wb-button primary" disabled={!band || busy || retry > 0} onClick={() => { void read(false); }}>{busy ? '正在读取…' : retry ? `${retry} 秒后可查询` : '② 查询当前相近档位'}</button>{band && <a className="wb-link" href={band.url} target="_blank" rel="noreferrer">官网核对本档位 ↗</a>}<a className="wb-link" href={corePriceQuery(options, core, width, 0, true).url} target="_blank" rel="noreferrer">官网按核心属性降序 ↗</a></div>
      {message && <p role="alert" className="wb-inline-warning">{message}</p>}
      {data && result && <div aria-live="polite"><p>{result.band.overview ? '核心属性降序样本（仅展示市场顶部，不作为你这件的估价）' : `相近核心值 ${result.band.min}–${result.band.max}`} · 匹配 {data.total} 件 · 已取 {data.fetched} 件 · {new Date(data.sampledAt).toLocaleString('zh-CN')}</p>
        {!result.band.overview && !comparable.length && <p className="wb-inline-warning">没有能核对到本档核心值的挂牌，不生成估价。可换相邻档位或在官网核对。</p>}
        {currencies.map((currency) => { const values = comparable.filter(({ listing }) => listing.price.currency === currency).map(({ listing }) => listing.price.amount).sort((a, b) => a - b); return <div className="wb-card" key={currency}><strong>本档可读挂牌 {estimateNumber(values[0]!)}–{estimateNumber(values.at(-1)!)} {estimateCurrencyName(currency)}</strong><p className="wb-fine">{values.length} 个卖家的已取样本；价格升序前 20 件内的范围，不是全市场分布或成交价。</p>{onRecordQuote && <button type="button" className="wb-button" disabled={!canonicalQuoteCurrency(currency) || values.length < 3} onClick={() => { const unit = canonicalQuoteCurrency(currency); if (unit) onRecordQuote({ league: options.league, amount: values[0]!, currency: unit, at: data.sampledAt, url: result.band.url, conditions: `核心 ${core.label} · ${result.band.min}–${result.band.max} · ${values.length} 卖家 · 同档最低挂牌参考` }); }}>记录同档最低挂牌参考（{values.length < 3 ? '至少需 3 个卖家' : estimateCurrencyName(currency)}）</button>}</div>; })}
        <div className="lo-table-scroll"><table className="lo-deltas"><thead><tr><th>核心属性值</th><th>挂牌价</th><th>物品</th><th>操作</th></tr></thead><tbody>{samples.map(({ listing, value }) => { const item = equipmentFromListing(listing); return <tr key={listing.id}><td>{value ?? '未能核对'}</td><td>{estimateNumber(listing.price.amount)} {estimateCurrencyName(listing.price.currency)}</td><td>{item ? equipmentDisplayName(item) : listing.name || listing.base}</td><td>{onCompare && item && <button type="button" className="wb-text-button" onClick={() => onCompare(item)}>比较这件</button>} <a className="wb-link" href={result.band.url} target="_blank" rel="noreferrer">官网</a></td></tr>; })}</tbody></table></div>
        {!result.band.overview && samples.some(({ value }) => value === undefined || value < result.band.min || value > result.band.max) && <p className="wb-fine">核心值未读到或落在档位外的物品未计入价格范围。</p>}
        <p className="wb-fine">同档中低价的物品更值得核对，但额外词缀、品质与机制仍可能不同。各通货分开，不把宽泛样本的平均数／中位数当成装备价值。</p></div>}
    </>}
  </section>;
}
