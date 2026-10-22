import { useMemo, useState } from 'react';
import type { PatchData } from '../../packages/engine/src/types';
import type { ExistingItem, TargetInput } from '../lib/engine';
import type { GearTrade } from '../lib/gearTrade';
import type { TradeLeague } from './market';
import { translateBase } from './localization';
import { buildFlexibleTrade, buildTradeFilterRows, type TradeFilterRow } from './tradeSearch';
import { extractTradeActualStats } from './tradeActualValues';
import { buildTradePseudoRows, tradePseudoKind } from './tradePseudo';
import { buildTopGearRows, type TopGearGrade } from './tradeTopGear';
import { PriceEstimate, type PriceEstimateProps } from './PriceEstimate';

type SearchSource = 'current' | 'target' | 'base';
type Preset = 'similar' | 'loose' | 'strict' | 'top' | 'custom';
interface TradePanelProps {
  data: PatchData;
  tradeData: GearTrade | null;
  item: ExistingItem;
  targets: readonly TargetInput[];
  baseName: string;
  raw: string;
  actualRollsInvalid?: boolean;
  league: string;
  onLeague: (league: string) => void;
  leagues: readonly TradeLeague[];
  leagueError: string;
  priceLeague?: string;
  autoEstimate?: boolean;
  onEstimate?: PriceEstimateProps['onEstimate'];
  onAllT1?: () => void;
}

const numberText = (value: number) => String(Math.round(value * 100) / 100);

/** A transparent comparison preset, not an estimate of a modifier's market value. */
function coreKeys(rows: readonly TradeFilterRow[], data: PatchData): Set<string> {
  const pseudoRes = rows.some((row) => row.key === 'pseudo:elemental-resistance' && row.actualValue !== undefined);
  const pseudoAttr = rows.some((row) => row.key === 'pseudo:attributes' && row.actualValue !== undefined);
  const candidates = rows.filter((row) => row.ids.length && !row.ambiguous
    && !(row.origin === 'pseudo' && row.actualValue === undefined)
    && !(pseudoRes && tradePseudoKind(row) === 'elemental-resistance')
    && !(pseudoAttr && tradePseudoKind(row) === 'attributes'));
  const scored = candidates.map((row, index) => {
    const mod = row.modId ? data.mods.get(row.modId) : undefined;
    const text = `${row.sourceLabel ?? ''} ${row.modId ?? ''}`;
    let score = row.origin === 'pseudo' ? 105 : 40;
    if (/maximum Life|maximum Mana|Spirit/i.test(text)) score += 65;
    if (/Adds|Damage|Critical/i.test(text)) score += 40;
    if (/Rarity/i.test(text)) score += 30;
    if (/Resistance|Attributes|Strength|Dexterity|Intelligence/i.test(text)) score += 35;
    if (mod?.source === 'desecrated') score += 8;
    if (row.origin === 'actual') score += 5;
    return { row, score, index };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  return new Set(scored.slice(0, 3).map(({ row }) => row.key));
}

function presetRows(initial: readonly TradeFilterRow[], data: PatchData, preset: 'similar' | 'loose' | 'strict'): TradeFilterRow[] {
  const keys = coreKeys(initial, data);
  let remaining = preset === 'loose' ? 2 : 3;
  return initial.map((row) => {
    const core = keys.has(row.key) && remaining-- > 0;
    const enabled = Boolean(row.ids.length) && (preset === 'strict' ? row.origin !== 'pseudo' : core);
    const value = row.actualValue ?? (row.min !== '' ? Number(row.min) : undefined);
    // Negative filters use a signed official scalar; moving the minimum down always widens it.
    const lower = value === undefined ? '' : preset === 'strict' ? numberText(value)
      : numberText(value - Math.abs(value) * (preset === 'loose' ? 0.4 : 0.2));
    return { ...row, enabled, min: lower, max: '' };
  });
}

export default function TradePanel(props: TradePanelProps) {
  // Reset selection when the equipment changes so old prices cannot be compared with stale filters.
  const signature = JSON.stringify({ item: props.item, targets: props.targets, baseName: props.baseName, raw: props.raw, invalid: props.actualRollsInvalid });
  return <TradeContext key={signature} {...props} />;
}

function TradeContext(props: TradePanelProps) {
  const { item, targets, data, tradeData, raw, actualRollsInvalid } = props;
  const [source, setSource] = useState<SearchSource>(item.prefixes.length + item.suffixes.length ? 'current' : targets.length ? 'target' : 'base');
  const prepared = useMemo(() => {
    if (!tradeData || source === 'base') return { rows: [] as TradeFilterRow[], warnings: [] as string[] };
    const entries = source === 'current' ? [...item.prefixes, ...item.suffixes] : targets;
    const actual = source === 'current' ? actualRollsInvalid ? {
      stats: [], warnings: ['当前装备经过编辑或模拟，原始复制数值不再用于查价。重新粘贴可恢复实际数值。'],
    } : extractTradeActualStats(data, tradeData, raw, item) : { stats: [], warnings: [] };
    const explicit = buildTradeFilterRows(data, tradeData, entries, actual.stats);
    return { rows: [...buildTradePseudoRows(explicit), ...explicit], warnings: actual.warnings };
  }, [data, tradeData, item, targets, raw, source, actualRollsInvalid]);
  return <div className="wb-trade-search">
    <div className="wb-section-head"><div><span className="wb-eyebrow">OFFICIAL TRADE</span><h3>选核心属性，查相似装备。</h3></div><span className="wb-tag">可调整条件</span></div>
    <p className="wb-description">先比较关键属性，再逐步收紧条件。每条属性都能勾选和调整数值，生成的链接会直接打开官方交易页。</p>
    <label className="wb-form-label">交易赛季<input aria-label="交易赛季" list="wb-leagues" value={props.league} placeholder="填写官网赛季名称" onChange={(event) => props.onLeague(event.target.value)} /><datalist id="wb-leagues">{props.leagues.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</datalist></label>
    {props.leagueError && <p className="wb-fine">{props.leagueError}</p>}
    {props.league && props.priceLeague && props.league !== props.priceLeague && <p className="wb-inline-warning">搜索赛季与内置价格赛季不同。制作成本仍按价格表计算，请在“数据与价格”中调整。</p>}
    <div className="wb-trade-types">{([
      ['current', '对照当前装备', '优先使用粘贴文本里的实际数值'],
      ['target', '找目标成品', '从目标阶层下限开始调整'],
      ['base', '购买制作底材', '自行限定底座和制作物等'],
    ] as const).map(([value, title, description]) => <button key={value} className={source === value ? 'active' : ''} aria-pressed={source === value} onClick={() => setSource(value)}><strong>{title}</strong><small>{description}</small></button>)}</div>
    {!tradeData ? <p className="wb-fine">正在加载官方交易属性映射…</p> : <TradeSearchEditor key={source} {...props} initialRows={prepared.rows} warnings={prepared.warnings} source={source} />}
  </div>;
}

function TradeSearchEditor({ data, tradeData, item, baseName, league, initialRows, warnings, source, autoEstimate, onEstimate, onAllT1, raw, actualRollsInvalid }: TradePanelProps & {
  initialRows: readonly TradeFilterRow[]; warnings: readonly string[]; source: SearchSource;
}) {
  const [rows, setRows] = useState(() => presetRows(initialRows, data, 'similar'));
  const [preset, setPreset] = useState<Preset>('similar');
  const [topMode, setTopMode] = useState(false);
  const [topGrade, setTopGrade] = useState<TopGearGrade>('t1');
  const [keepCurrent, setKeepCurrent] = useState(true);
  const [exactBase, setExactBase] = useState(source === 'base');
  const [limitLevel, setLimitLevel] = useState(source === 'base');
  const [levelMin, setLevelMin] = useState(String(item.level));
  const [levelMax, setLevelMax] = useState('');
  const [status, setStatus] = useState<'any' | 'online' | 'securable'>('any');
  const [rarity, setRarity] = useState<'normal' | 'magic' | 'rare' | 'nonunique'>(source === 'base' ? item.rarity : 'nonunique');
  const [matching, setMatching] = useState<'all' | 'count'>('all');
  const [minMatches, setMinMatches] = useState('2');
  const topReference = useMemo(() => tradeData ? buildTopGearRows(data, tradeData, initialRows.map((row) => ({
    ...row, enabled: rows.some((current) => current.key === row.key && current.enabled),
  })), { grade: topGrade, keepCurrent }) : null, [data, tradeData, initialRows, rows, topGrade, keepCurrent]);
  const activeCount = rows.filter((row) => row.enabled).length;
  let search: ReturnType<typeof buildFlexibleTrade> | undefined;
  let error = '';
  try {
    search = buildFlexibleTrade({ league, baseId: item.baseId, ...(exactBase ? { baseName } : {}),
      ...(limitLevel ? {
        ...(levelMin.trim() ? { itemLevelMin: Number(levelMin) } : {}),
        ...(levelMax.trim() ? { itemLevelMax: Number(levelMax) } : {}),
      } : {}), rows, status, rarity, matching, minMatches: Number(minMatches) });
  } catch (reason) { error = reason instanceof Error ? reason.message : String(reason); }

  function applyPreset(next: Exclude<Preset, 'custom'>) {
    if (next === 'top') {
      const keys = coreKeys(initialRows, data);
      applyTop(keys, topGrade, keepCurrent);
    } else {
      setRows(presetRows(initialRows, data, next)); setPreset(next); setTopMode(false);
    }
    setMatching('all');
    setExactBase(source === 'base'); setLimitLevel(source === 'base');
  }
  function applyTop(keys: ReadonlySet<string>, grade = topGrade, keep = keepCurrent) {
    if (!tradeData) return;
    const base = initialRows.map((row) => ({ ...row, enabled: Boolean(row.ids.length) && keys.has(row.key) }));
    setRows(buildTopGearRows(data, tradeData, base, { grade, keepCurrent: keep }).rows);
    setTopMode(true); setPreset('top'); setTopGrade(grade); setKeepCurrent(keep);
  }
  function changeTop(grade: TopGearGrade, keep: boolean) {
    applyTop(new Set(rows.filter((row) => row.enabled).map((row) => row.key)), grade, keep);
  }
  function editRow(key: string, patch: Partial<TradeFilterRow>) {
    setRows((old) => old.map((row) => row.key === key ? { ...row, ...patch } : row)); setPreset('custom');
  }
  function relax() {
    setRows((old) => old.map((row) => {
      const min = row.min.trim() === '' ? undefined : Number(row.min);
      return { ...row, min: min === undefined || !Number.isFinite(min) ? row.min : numberText(min - Math.abs(min) * 0.2), max: '' };
    }));
    setExactBase(false); setLimitLevel(false); setPreset('custom');
  }
  return <>
    {source !== 'base' && <>
      <div className="wb-trade-presets with-top" role="group" aria-label="查价预设">{([
        ['similar', '相似查价', '核心 3 项 · 数值下限 80%'],
        ['loose', '宽松比较', '核心 2 项 · 数值下限 60%'],
        ['strict', source === 'current' ? '全部实际属性' : '全部目标属性', '逐条匹配 · 不设数值上限'],
        ['top', '找同类顶配', '沿用属性方向 · 提高数值门槛'],
      ] as const).map(([value, title, description]) => <button className={preset === value ? 'active' : ''} key={value} aria-pressed={preset === value} disabled={value === 'top' && !initialRows.length} onClick={() => applyPreset(value)}><strong>{title}</strong><small>{description}</small></button>)}</div>
      {onAllT1 && source === 'current' && <div className="wb-actions"><button type="button" className="wb-button" disabled={!raw.trim() || actualRollsInvalid} onClick={onAllT1}>同类全词缀 T1</button><span className="wb-fine">全部原词缀方向同时满足 T1 参考门槛；保留制作方案。</span></div>}
      <p className="wb-fine">核心项按生命／魔力、总抗性、伤害等属性挑选，供你调整，不代表市场估价。未勾选的属性不会限制搜索。</p>
    </>}
    {source !== 'base' && topMode && <div className="wb-trade-top" aria-label="同类顶配设置">
      <div className="wb-section-head"><div><span className="wb-eyebrow">SIMILAR HIGH-END GEAR</span><h3>相同方向，寻找更高配置。</h3></div><span className="wb-tag">规则快照 {data.patch}</span></div>
      <p>沿用复制装备的属性类型，提高所选属性的数值要求；市场装备可有更高物等。这里按词缀门槛筛选，具体搭配仍由你选择。</p>
      <div className="wb-trade-top-controls"><label>顶配数值档位<select aria-label="顶配数值档位" value={topGrade} onChange={(event) => changeTop(event.target.value as TopGearGrade, keepCurrent)}><option value="t2">T2 起步</option><option value="t1">T1 起步</option><option value="high">T1 高掷值（区间 80%）</option><option value="perfect">T1 满值</option></select></label><label className="wb-check"><input type="checkbox" checked={keepCurrent} onChange={(event) => changeTop(topGrade, event.target.checked)} />所选属性不低于当前装备</label></div>
      <div className="wb-actions"><button className="wb-button" onClick={() => applyTop(new Set(initialRows.filter((row) => row.origin !== 'pseudo' && row.ids.length).map((row) => row.key)))}>保留全部词缀方向</button><button className="wb-text-button" onClick={() => applyTop(coreKeys(initialRows, data))}>恢复核心方向</button></div>
      <p className="wb-fine">默认提升核心属性；可勾选其他词缀，再切换档位应用门槛。总抗性可比较不同抗性组合。“保留全部词缀方向”改为逐条匹配，结果较少时可选至少满足其中几项。缺少实际掷值时使用阶层参考。T1 参考来自当前规则快照，品质或特殊效果可能使显示值更高，搜索结果不代表整个市场的绝对排名。</p>
      {topReference?.warnings.map((warning, index) => <p className="wb-inline-warning" key={index}>{warning}</p>)}
    </div>}
    <details className="wb-fold"><summary>调整搜索条件 · 已选 {activeCount} 项属性</summary><div className="wb-trade-options">
      <label className="wb-check"><input type="checkbox" checked={exactBase} onChange={(event) => setExactBase(event.target.checked)} />限定当前底座</label>
      <label className="wb-check"><input type="checkbox" checked={limitLevel} onChange={(event) => setLimitLevel(event.target.checked)} />限制物品等级</label>
      <label className="wb-trade-status">稀有度<select aria-label="交易稀有度" value={rarity} onChange={(event) => setRarity(event.target.value as typeof rarity)}><option value="nonunique">非传奇</option><option value="normal">普通（白色）</option><option value="magic">魔法（蓝色）</option><option value="rare">稀有（黄色）</option></select></label>
      <label className="wb-trade-status">卖家状态<select aria-label="卖家状态" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="any">全部挂单（查价）</option><option value="online">在线卖家</option><option value="securable">可即时交易</option></select></label>
    </div>
    {limitLevel && <div className="wb-trade-level"><label>最低物等<input aria-label="交易最低物等" type="number" min="1" max="100" value={levelMin} onChange={(event) => setLevelMin(event.target.value)} /></label><label>最高物等<input aria-label="交易最高物等" type="number" min="1" max="100" placeholder="不限" value={levelMax} onChange={(event) => setLevelMax(event.target.value)} /></label></div>}
    {rows.length > 0 && <>
      <div className="wb-trade-filter-head"><strong>参与搜索的属性 <span className="wb-count">{activeCount} / {rows.length}</span></strong><button className="wb-text-button" onClick={() => { setRows((old) => old.map((row) => ({ ...row, enabled: false }))); setPreset('custom'); }}>清空属性条件</button></div>
      <div className="wb-trade-filters">{rows.map((row) => { const reference = topMode ? topReference?.references.get(row.key) : undefined; return <div key={row.key} className={`wb-trade-filter ${row.enabled ? 'enabled' : ''}`} data-filter-key={row.key} data-mod-id={row.modId} data-origin={row.origin}>
        <label className="wb-trade-filter-label"><input type="checkbox" checked={row.enabled} disabled={!row.ids.length} aria-label={`搜索属性：${row.label}`} onChange={(event) => editRow(row.key, { enabled: event.target.checked })} /><span><strong>{row.label}</strong><small>{row.origin === 'pseudo' ? '合计属性' : row.origin === 'actual' ? `装备实际值 ${numberText(row.actualValue!)}` : source === 'target' ? '目标阶层下限' : '阶层下限（缺少实际值）'}{row.modId && (data.mods.get(row.modId)?.source === 'desecrated' || source === 'current' && [...item.prefixes, ...item.suffixes].some((entry) => entry.modId === row.modId && entry.desecrated)) ? ' · 亵渎' : ''}</small></span></label>
        <div className="wb-trade-bounds"><label>下限<input aria-label={`${row.label} 下限`} type="number" step="any" placeholder="不限" value={row.min} onChange={(event) => editRow(row.key, { min: event.target.value })} /></label><label>上限<input aria-label={`${row.label} 上限`} type="number" step="any" placeholder="不限" value={row.max} onChange={(event) => editRow(row.key, { max: event.target.value })} /></label></div>
        {reference && <p className="wb-trade-top-reference">{reference.label}{reference.value !== undefined ? ` · 参考下限 ${numberText(reference.value)}` : ''}{reference.note ? ` · ${reference.note}` : ''}</p>}
        {row.warning && <p className="wb-trade-filter-warning">{row.warning}</p>}
      </div>; })}</div>
      <div className="wb-trade-matching"><label>属性匹配<select aria-label="属性匹配" value={matching} onChange={(event) => setMatching(event.target.value as typeof matching)}><option value="all">满足全部已勾选属性</option><option value="count">至少满足其中几项</option></select></label>{matching === 'count' && <label>至少满足<input aria-label="至少满足属性数" type="number" min="1" max={activeCount} value={minMatches} onChange={(event) => setMinMatches(event.target.value)} /> 项</label>}</div>
      <div className="wb-actions"><button className="wb-button" onClick={relax}>放宽数值与底座限制</button><button className="wb-text-button" onClick={() => { setRows((old) => old.map((row) => ({ ...row, min: '', max: '' }))); setPreset('custom'); }}>只要求属性存在</button></div>
      <p className="wb-fine">附加伤害的交易数值为最小值和最大值的平均数。下限与上限留空时，只要求存在该属性。品质加成直接采用复制文本中的显示值。</p>
    </>}
    {!rows.length && source !== 'base' && <p className="wb-fine">当前没有可生成的词缀条件，可以先搜索同类底座，或导入装备后再选属性。</p>}
    </details>{[...new Set([...warnings, ...(search?.warnings ?? []).filter((warning) => !rows.some((row) => row.warning === warning))])].map((warning, index) => <p className="wb-inline-warning" key={index}>{warning}</p>)}
    <div className="wb-trade-summary" aria-live="polite"><strong>{exactBase ? translateBase(baseName) : item.baseId === 'Rings' ? '全部戒指' : '全部项链'}</strong><span>{limitLevel ? `物等 ${levelMin || '不限'}～${levelMax || '不限'}` : '不限物等'}</span><span>{{ nonunique: '非传奇', normal: '普通', magic: '魔法', rare: '稀有' }[rarity]}</span><span>{activeCount ? `${activeCount} 项属性${matching === 'count' ? `中至少 ${minMatches} 项` : '全部匹配'}` : '不限词缀'}</span><span>{preset === 'custom' ? '自定义条件' : source === 'base' ? '底材搜索' : '可继续调整'}</span></div>
    {error && <p className="wb-inline-warning" role="alert">{error}</p>}
    {search && <a className="wb-button primary wb-trade-link" href={search.url} target="_blank" rel="noreferrer">在官方交易网站搜索 ↗</a>}
    {search && <PriceEstimate query={search.query} url={search.url} league={league} auto={autoEstimate} onEstimate={onEstimate} itemRaw={source === 'current' && !actualRollsInvalid ? raw : undefined} memoryTitle={`${translateBase(baseName)} · ${{ current: '当前装备', target: '制作目标', base: '底材' }[source]}`} />}
    <p className="wb-fine">结果较少时，先用“宽松比较”，再取消非核心词缀；也可以改为至少匹配 2 项。这里只生成查询，实际挂单及价格以官方交易页为准。</p>
    {search && <details className="wb-diagnostic"><summary>查看发往官网的搜索条件</summary><pre>{JSON.stringify(search.query, null, 2)}</pre></details>}
  </>;
}
