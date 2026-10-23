import { useEffect, useRef, useState } from 'react';
import { corePriceAxes, jointCorePriceQuery, listingCoreMatch, type CorePriceSelection } from './corePricing';
import type { EquipmentTradeOptions } from './genericEquipmentTrade';
import { estimateCurrencyName, estimateNumber, fetchMarketEstimate, type MarketEstimateResult } from './marketEstimate';
import type { PriceEstimateProps } from './PriceEstimate';
import { equipmentDisplayName, type Equipment } from './genericEquipment';
import { equipmentFromListing } from './upgradeRanking';
import { canonicalQuoteCurrency } from './loadoutQuotes';
import { rememberTrade } from './tradeMemory';
import Icon, { IconButton } from './WorkbenchIcon';
import type { UpgradeMarketQuote } from './upgradeWorkflow';
import { HOSTED_WORKBENCH } from './workbenchRuntime';

export default function CorePriceEstimate({ options, auto, onEstimate, onRecordQuote, onCompare, reviewCandidate, initialSelection }: {
  options: EquipmentTradeOptions; auto?: boolean;
  onEstimate?: PriceEstimateProps['onEstimate']; onRecordQuote?: PriceEstimateProps['onRecordQuote']; onCompare?: (item: Equipment, quote?: UpgradeMarketQuote) => void;
  reviewCandidate?: (item: Equipment) => { eligible: boolean; status: 'met' | 'unmet' | 'unknown'; label: string; detail?: string };
  initialSelection?: { key: string; preset: string };
}) {
  const axes = corePriceAxes(options.equipment, options.rows);
  const [keys, setKeys] = useState<string[]>(initialSelection ? [initialSelection.key] : axes[0] ? [axes[0].key] : []);
  const [sortKey, setSortKey] = useState(initialSelection?.key ?? axes[0]?.key ?? ''), [scopes, setScopes] = useState<Record<string, string>>(initialSelection ? { [initialSelection.key]: initialSelection.preset } : {});
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [retry, setRetry] = useState(0);
  const optionKey = JSON.stringify(options);
  const [storedResult, setResult] = useState<{ data: MarketEstimateResult; band: ReturnType<typeof jointCorePriceQuery>; optionKey: string }>();
  const result = storedResult?.optionKey === optionKey ? storedResult : undefined;
  const [requestKey, setRequestKey] = useState('');
  const request = useRef<AbortController | null>(null), latest = useRef<() => void>(() => {});
  const loading = busy && requestKey === optionKey;
  const selected = keys.flatMap((key) => { const row = axes.find((entry) => entry.key === key); return row ? [row] : []; });
  const primary = selected.find((row) => row.key === sortKey && row.filterGroup !== 'misc_filters') ?? selected.find((row) => row.filterGroup !== 'misc_filters');
  const relative = (row: typeof axes[number]) => !row.suggested && (row.actualValue ?? 0) > 0 && row.filterGroup !== 'misc_filters';
  const scopeFor = (row: typeof axes[number]) => scopes[row.key] ?? (relative(row) ? 'at-least' : row.searchPresets?.[0]?.id ?? 'at-least');
  const selections: CorePriceSelection[] = selected.map((row) => {
    const scope = scopeFor(row);
    return { row, ...(row.searchPresets?.some((entry) => entry.id === scope) ? { preset: scope } : { mode: scope === 'same' ? 'same' as const : 'at-least' as const, gain: ['1', '3', '5'].includes(scope) ? Number(scope) : 0 }) };
  });
  let band: ReturnType<typeof jointCorePriceQuery> | undefined, overviewBand: ReturnType<typeof jointCorePriceQuery> | undefined, invalid = '';
  try { band = jointCorePriceQuery(options, selections, primary?.key); if (primary) overviewBand = jointCorePriceQuery(options, selections, primary.key, true); }
  catch (error) { invalid = error instanceof Error ? error.message : String(error); }
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => () => request.current?.abort(), [optionKey]);
  useEffect(() => { if (!retry) return; const timer = setInterval(() => setRetry((old) => Math.max(0, old - 1)), 1000); return () => clearInterval(timer); }, [retry]);
  async function read(overview: boolean) {
    if (!selected.length || overview && !primary || loading || retry) return;
    let chosen: ReturnType<typeof jointCorePriceQuery>;
    try { chosen = jointCorePriceQuery(options, selections, primary?.key, overview); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); return; }
    const task = new AbortController(); request.current?.abort(); request.current = task; setRequestKey(optionKey);
    setBusy(true); setMessage(''); setResult(undefined);
    try {
      const data = await fetchMarketEstimate(chosen.query, options.league, task.signal);
      if (task.signal.aborted) return;
      setResult({ data, band: chosen, optionKey }); setRetry(data.ok ? 15 : data.error.retryAfterSeconds ?? 0);
      if (!data.ok) { setMessage(data.error.message); onEstimate?.({ status: 'error', message: data.error.message, detail: '查询失败，不代表没有符合联合条件的物品。', url: chosen.url }); }
      else {
        const description = `${chosen.constraints.length} 项核心属性同时满足 · ${overview ? '核心属性降序市场参考' : '挂牌参考'}`;
        rememberTrade({ query: chosen.query, league: options.league, raw: options.equipment.raw, title: equipmentDisplayName(options.equipment) }, { observation: { at: data.sampledAt, message: description, detail: `${chosen.summary} · ${data.total} 个匹配`, failed: false } });
        onEstimate?.({ status: 'ready', message: description, detail: `${chosen.summary}。匹配 ${data.total} 件，每项要求必须同时满足。`.slice(0, 4000), url: chosen.url });
      }
    } catch (error) { if (!task.signal.aborted) setMessage(error instanceof Error ? error.message : '查询失败。'); }
    finally { if (!task.signal.aborted) setBusy(false); }
  }
  useEffect(() => { latest.current = () => { void read(false); }; });
  useEffect(() => { if (HOSTED_WORKBENCH || !auto) return; const timer = setTimeout(() => latest.current(), 700); return () => clearTimeout(timer); }, [auto]);
  function reset() { request.current?.abort(); setBusy(false); setResult(undefined); setMessage(''); }
  const data = result?.data.ok ? result.data : undefined;
  const samples = data?.listings?.map((listing) => {
    const item = equipmentFromListing(listing);
    return { listing, item, review: item && reviewCandidate ? reviewCandidate(item) : undefined, ...listingCoreMatch(listing, result!.band.constraints) };
  }) ?? [];
  const comparable = samples.filter((row) => row.matches && (!reviewCandidate || !!row.item && row.review?.eligible));
  const currencies = [...new Set(comparable.map(({ listing }) => listing.price.currency))];
  return <section className="wb-price-estimate wb-core-price" aria-label="核心属性档位估价">
    <div className="wb-section-head"><h3>核心属性</h3><span className="wb-tag">已选 {selected.length} 项 · 同时满足</span></div>
    {!axes.length ? <p>暂无能核对数值的核心属性。请先识别词缀，或按同名／底座查看官方挂牌。</p> : <>
      <fieldset className="wb-core-axis-list"><legend>属性与提升幅度</legend>{selected.map((row, index) => <div key={row.key} className="wb-core-axis">
        <select className="wb-core-axis-property" aria-label={`核心属性 ${index + 1}`} value={row.key} onChange={(event) => {
          const key = event.target.value; reset(); setKeys((old) => old.map((value) => value === row.key ? key : value));
          setScopes((old) => { const next = { ...old }; delete next[key]; return next; });
          if (primary?.key === row.key) setSortKey(key);
        }}>{axes.map((axis) => <option key={axis.key} value={axis.key} disabled={axis.key !== row.key && keys.includes(axis.key)}>{axis.label}{axis.affixType ? ` · ${axis.affixType === 'prefix' ? '前缀' : '后缀'}` : ''}{axis.actualValue === undefined ? ' · 可新增' : ` · 当前 ${axis.actualValue}`}</option>)}</select>
        <select className="wb-core-axis-scope" aria-label={`核心属性要求：${row.label}`} value={scopeFor(row)} title={row.targetRange ? `T1 范围 ${row.targetRange.min}–${row.targetRange.max} · 规则 ${row.targetPatch}` : undefined} onChange={(event) => { reset(); setScopes((old) => ({ ...old, [row.key]: event.target.value })); }}>{relative(row) && <><option value="at-least">≥ 当前（0%）</option><option value="same">相同数值（0%）</option>{[1, 3, 5].map((number) => <option key={number} value={number}>+{number}% 及以上</option>)}</>}{row.searchPresets?.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select>
        <button type="button" className="wb-icon-button wb-core-axis-sort" disabled={row.filterGroup === 'misc_filters'} title={row.filterGroup === 'misc_filters' ? '基本条件只作筛选' : primary?.key === row.key ? '当前按此属性降序' : '设为降序优先属性'} aria-label={`优先降序：${row.label}`} aria-pressed={primary?.key === row.key} onClick={() => { reset(); setSortKey(row.key); }}>↓</button>
        <IconButton icon="close" label={`移除核心属性：${row.label}`} onClick={() => { reset(); setKeys((old) => old.filter((key) => key !== row.key)); }} />
      </div>)}<button type="button" className="wb-text-button wb-core-axis-add" disabled={selected.length === axes.length} onClick={() => { const next = axes.find((row) => !keys.includes(row.key)); if (next) { reset(); setKeys((old) => [...old, next.key]); } }}><Icon name="plus" size={15} />添加属性</button></fieldset>
      {band && <p className="wb-fine wb-core-conditions" aria-label="联合检索要求">{band.constraints.map(({ row, rangeLabel }) => `${row.label} ${rangeLabel}`).join('；')}</p>}
      <p className="wb-fine">全部条件同时满足；↓ 选择降序优先属性。</p>
      {!band && <p role="status" className="wb-inline-warning">{invalid}</p>}
      <div className="wb-actions">{HOSTED_WORKBENCH ? <>{overviewBand && <a className="wb-button" href={overviewBand.url} target="_blank" rel="noreferrer">核心属性降序 ↗</a>}{band && <a className="wb-button primary" href={band.url} target="_blank" rel="noreferrer">官网检索提升候选 ↗</a>}</> : <><button type="button" className="wb-button" disabled={!overviewBand || loading || retry > 0} onClick={() => { void read(true); }}>核心属性降序</button><button type="button" className="wb-button primary" disabled={!band || loading || retry > 0} onClick={() => { void read(false); }}>{loading ? '正在读取…' : retry ? `${retry} 秒后可查询` : '检索提升候选'}</button>{band && <a className="wb-link" href={band.url} target="_blank" rel="noreferrer">官网核对联合条件 ↗</a>}{overviewBand && <a className="wb-link" href={overviewBand.url} target="_blank" rel="noreferrer">官网按核心属性降序 ↗</a>}</>}</div>
      {HOSTED_WORKBENCH && <p className="wb-fine">联合条件在浏览器生成，点击后去官网读取挂牌；复制候选物品回角色页即可比较。本站不提供后台挂牌抓取。</p>}
      {message && requestKey === optionKey && <p role="alert" className="wb-inline-warning">{message}</p>}
      {data && result && <div aria-live="polite"><p>{result.band.constraints.length} 项核心属性同时满足{result.band.overview ? ' · 降序样本（不作为当前装备估价）' : ''} · 匹配 {data.total} 件 · 已取 {data.fetched} 件 · {new Date(data.sampledAt).toLocaleString('zh-CN')}</p>
        {!comparable.length && <p className="wb-inline-warning">没有能核对到同时满足所有要求的挂牌，请在官网核对；不会自动放宽任一门槛。</p>}
        {!result.band.overview && currencies.map((currency) => { const values = comparable.filter(({ listing }) => listing.price.currency === currency).map(({ listing }) => listing.price.amount).sort((a, b) => a - b); return <div className="wb-card" key={currency}><strong>符合要求的挂牌 {estimateNumber(values[0]!)}–{estimateNumber(values.at(-1)!)} {estimateCurrencyName(currency)}</strong><p className="wb-fine">{values.length} 个卖家的已取样本；价格升序前 20 件内的范围，不是全市场分布或成交价。逐件核心值见下表。</p>{onRecordQuote && <button type="button" className="wb-button" disabled={!canonicalQuoteCurrency(currency) || values.length < 3} onClick={() => { const unit = canonicalQuoteCurrency(currency); if (unit) onRecordQuote({ league: options.league, amount: values[0]!, currency: unit, at: data.sampledAt, url: result.band.url, conditions: `${result.band.summary} · ${values.length} 卖家 · 联合条件最低挂牌参考`.slice(0, 1000) }); }}>记录最低挂牌参考（{values.length < 3 ? '至少需 3 个卖家' : estimateCurrencyName(currency)}）</button>}</div>; })}
        {reviewCandidate && <p className="wb-fine">价格区间只对应核心条件。整套四抗缺口逐件列出，待补抗或待核对不代表整套已经达标。</p>}
        <div className="lo-table-scroll"><table className="lo-deltas" style={{ minWidth: Math.max(460, result.band.constraints.length * 130 + 300 + (reviewCandidate ? 240 : 0)) }}><thead><tr>{result.band.constraints.map(({ row }) => <th key={row.key}>{row.label}</th>)}<th>挂牌价</th><th>物品</th>{reviewCandidate && <th>换入后的整套四抗</th>}<th>操作</th></tr></thead><tbody>{comparable.map(({ listing, item, review, values }) => <tr key={listing.id}>{values.map((value, index) => <td key={result.band.constraints[index]!.row.key}>{value}</td>)}<td>{estimateNumber(listing.price.amount)} {estimateCurrencyName(listing.price.currency)}</td><td>{item ? equipmentDisplayName(item) : listing.name || listing.base}</td>{reviewCandidate && <td className="wb-core-candidate-review"><strong className={review?.status === 'met' ? 'positive' : 'wb-inline-warning'}>{review?.label}</strong>{review?.detail && <p className="wb-fine">{review.detail}</p>}</td>}<td>{onCompare && item && <button type="button" className="wb-text-button" onClick={() => onCompare(item, { id: listing.id, amount: listing.price.amount, currency: listing.price.currency, sampledAt: data.sampledAt })}>比较这件</button>} <a className="wb-link" href={result.band.url} target="_blank" rel="noreferrer">官网</a></td></tr>)}</tbody></table></div>
        {samples.length > comparable.length && <p className="wb-fine">已排除 {samples.length - comparable.length} 件核心值不符、抗性未达标或未能核对的物品。</p>}
        <p className="wb-fine">各币种独立比较；核心属性达标后，点击「比较这件」核对整套配装与特殊机制。</p></div>}
    </>}
  </section>;
}
