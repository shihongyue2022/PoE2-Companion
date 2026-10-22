import type { FlexibleTradeDocument } from './tradeSearch';
import { localizeEquipmentName, localizeEquipmentStat } from './genericEquipment';

export interface EstimatePriceGroup {
  readonly currency: string;
  readonly count: number;
  readonly median: number;
  readonly p25: number;
  readonly p75: number;
  readonly min: number;
  readonly max: number;
}

/** Public item facts only. Seller accounts, stash locations and whisper text never leave the bridge. */
export interface EstimateListing {
  readonly id: string;
  readonly base: string;
  readonly name: string;
  readonly price: { readonly amount: number; readonly currency: string };
  readonly indexedAt?: string;
  readonly properties?: readonly string[];
  readonly explicitMods?: readonly string[];
}

export interface EstimateContext {
  readonly category: string;
  readonly statCount: number;
  readonly propertyCount: number;
  readonly sufficient: boolean;
  readonly summary: readonly string[];
}

export interface EstimateConfidence {
  readonly level: 'low' | 'limited';
  readonly reasons: readonly string[];
}

export interface MarketEstimate {
  readonly ok: true;
  readonly total: number;
  readonly fetched: number;
  readonly priced: number;
  readonly duplicateSellers: number;
  readonly groups: readonly EstimatePriceGroup[];
  readonly sampledAt: string;
  readonly cached: boolean;
  readonly url: string;
  readonly warnings: readonly string[];
  readonly context?: EstimateContext;
  readonly confidence?: EstimateConfidence;
  readonly listings?: readonly EstimateListing[];
}

export interface MarketEstimateFailure {
  readonly ok: false;
  readonly error: {
    readonly kind: 'invalid' | 'login' | 'limited' | 'network' | 'unavailable';
    readonly message: string;
    readonly retryAfterSeconds?: number;
  };
  readonly url?: string;
}

export type MarketEstimateResult = MarketEstimate | MarketEstimateFailure;

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const publicText = (value: unknown, maximum = 160): string => typeof value === 'string'
  ? Array.from(value).filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127).join('').trim().slice(0, maximum) : '';

interface ListingPrice {
  amount: number;
  currency: string;
  seller: string;
  row: Record<string, unknown>;
}

function listingPrices(listings: readonly unknown[]): ListingPrice[] {
  const prices: ListingPrice[] = [];
  for (const row of listings) {
    if (!isObject(row) || row.gone || !isObject(row.listing) || !isObject(row.listing.price)) continue;
    const { listing } = row;
    const { amount, currency } = listing.price as Record<string, unknown>;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0
      || typeof currency !== 'string' || !/^[a-z][a-z0-9-]{0,100}$/.test(currency)) continue;
    const seller = isObject(listing.account) && typeof listing.account.name === 'string'
      ? listing.account.name.trim().toLowerCase() : '';
    prices.push({ amount, currency, seller, row });
  }
  return prices.sort((a, b) => a.currency.localeCompare(b.currency) || a.amount - b.amount);
}

/** A compact selection from the same de-duplicated offers as the currency summary. */
export function representativeListings(listings: readonly unknown[]): EstimateListing[] {
  const sellers = new Set<string>();
  const groups = new Map<string, EstimateListing[]>();
  for (const { amount, currency, seller, row } of listingPrices(listings)) {
    const key = seller ? `${currency}:${seller}` : '';
    if (key && sellers.has(key)) continue;
    if (key) sellers.add(key);
    if (typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(row.id) || !isObject(row.item)) continue;
    const item = row.item;
    const base = publicText(item.baseType) || publicText(item.typeLine);
    const name = publicText(item.name);
    if (!base && !name) continue;
    const properties = Array.isArray(item.properties) ? item.properties.slice(0, 8).flatMap((property) => {
      if (!isObject(property)) return [];
      const label = publicText(property.name, 80);
      const values = Array.isArray(property.values) ? property.values.slice(0, 3).flatMap((value) =>
        Array.isArray(value) && typeof value[0] === 'string' ? [publicText(value[0], 80)] : []).filter(Boolean) : [];
      return label ? [`${label}${values.length ? `: ${values.join(' / ')}` : ''}`.slice(0, 180)] : [];
    }) : [];
    const explicitMods = Array.isArray(item.explicitMods)
      ? item.explicitMods.slice(0, 8).map((mod) => publicText(mod, 220)).filter(Boolean) : [];
    const indexed = isObject(row.listing) && typeof row.listing.indexed === 'string' ? Date.parse(row.listing.indexed) : NaN;
    const sample: EstimateListing = { id: row.id, base, name, price: { amount, currency },
      ...(Number.isFinite(indexed) ? { indexedAt: new Date(indexed).toISOString() } : {}),
      ...(properties.length ? { properties } : {}), ...(explicitMods.length ? { explicitMods } : {}) };
    const group = groups.get(currency) ?? [];
    group.push(sample); groups.set(currency, group);
  }
  // Show each currency first, then its middle offer where space permits; never imply currency conversion.
  const all = [...groups.values()];
  return [...all.map((group) => group[0]!), ...all.filter((group) => group.length > 1).map((group) => group[Math.floor(group.length / 2)]!)].slice(0, 8);
}

const CATEGORY_NAMES: Readonly<Record<string, string>> = {
  'accessory.ring': '戒指', 'accessory.amulet': '项链', 'accessory.belt': '腰带',
  'armour.chest': '胸甲', 'armour.helmet': '头盔', 'armour.gloves': '手套', 'armour.boots': '鞋子',
  'armour.shield': '盾牌', 'armour.buckler': '轻盾', 'armour.focus': '法器', 'armour.quiver': '箭袋',
  'weapon.bow': '弓', 'weapon.crossbow': '弩', 'weapon.wand': '法杖', 'weapon.sceptre': '权杖',
  'weapon.staff': '长杖', 'weapon.warstaff': '细杖', 'weapon.onemace': '单手锤', 'weapon.twomace': '双手锤',
  'weapon.spear': '长锋', 'weapon.claw': '爪', 'weapon.dagger': '匕首', 'weapon.onesword': '单手剑',
  'weapon.twosword': '双手剑', 'weapon.oneaxe': '单手斧', 'weapon.twoaxe': '双手斧', 'weapon.flail': '链锤',
  'weapon.talisman': '魔符', 'weapon.rod': '钓竿', jewel: '珠宝', flask: '药剂',
  'flask.life': '生命药剂', 'flask.mana': '魔力药剂', 'flask.charm': '护符', 'sanctum.relic': '古物',
};
const PROPERTY_NAMES: Readonly<Record<string, string>> = {
  dps: '总 DPS', pdps: '物理 DPS', edps: '元素 DPS', ar: '护甲', ev: '闪避', es: '能量护盾',
  aps: '每秒攻击次数', crit: '暴击率', block: '格挡', spirit: '精魂', ward: '结界', ilvl: '物品等级', quality: '品质',
};

/** Describe the submitted search, including when it cannot support a comparable-item estimate. */
export function estimateQueryContext(value: unknown): EstimateContext {
  const query = isObject(value) && isObject(value.query) ? value.query : {};
  const filters = isObject(query.filters) ? query.filters : {};
  const typeFilters = isObject(filters.type_filters) && isObject(filters.type_filters.filters) ? filters.type_filters.filters : {};
  const category = isObject(typeFilters.category) ? publicText(typeFilters.category.option, 80) : '';
  const summary = [CATEGORY_NAMES[category] ?? category];
  const name = publicText(query.name);
  const base = publicText(query.type);
  if (name) summary.push(`名称 ${name}`);
  if (base) summary.push(`底座 ${base}`);
  const rarity = isObject(typeFilters.rarity) ? typeFilters.rarity.option : undefined;
  const rarities: Record<string, string> = { normal: '普通', magic: '魔法', rare: '稀有', unique: '传奇', nonunique: '非传奇' };
  if (typeof rarity === 'string' && rarities[rarity]) summary.push(rarities[rarity]);
  const countedIds = new Set<string>();
  const statGroups = Array.isArray(query.stats) ? query.stats.filter((group) => isObject(group)
    && group.disabled !== true && ['and', 'count'].includes(String(group.type)) && Array.isArray(group.filters)) : [];
  const idsFor = (group: Record<string, unknown>): Set<string> => new Set((group.filters as unknown[]).flatMap((stat) =>
    isObject(stat) && stat.disabled !== true && typeof stat.id === 'string' ? [stat.id.replace(/^[^.]+\./, '')] : []));
  for (const group of statGroups) if (isObject(group) && group.type === 'and') for (const id of idsFor(group)) countedIds.add(id);
  let statCount = countedIds.size;
  // An OR group with many aliases still guarantees only one condition. Overlapping CNF groups
  // are counted conservatively rather than inflating confidence with repeated official IDs.
  for (const group of statGroups) if (isObject(group) && group.type === 'count') {
    const ids = idsFor(group);
    if (!ids.size || [...ids].some((id) => countedIds.has(id))) continue;
    const minimum = isObject(group.value) && typeof group.value.min === 'number' && Number.isFinite(group.value.min)
      ? Math.floor(group.value.min) : 1;
    statCount += Math.max(0, Math.min(ids.size, minimum));
    for (const id of ids) countedIds.add(id);
  }
  const properties = new Set<string>();
  let propertyCount = 0;
  for (const [groupId, group] of Object.entries(filters)) {
    if (!isObject(group) || group.disabled === true || !isObject(group.filters)) continue;
    for (const [id, range] of Object.entries(group.filters)) {
      if (!isObject(range) || range.disabled === true) continue;
      const min = typeof range.min === 'number' && Number.isFinite(range.min) ? range.min : undefined;
      const max = typeof range.max === 'number' && Number.isFinite(range.max) ? range.max : undefined;
      if (min === undefined && max === undefined) continue;
      if (groupId === 'equipment_filters' && PROPERTY_NAMES[id]) propertyCount++;
      if (PROPERTY_NAMES[id]) properties.add(`${PROPERTY_NAMES[id]} ${min === undefined ? '不限' : min}–${max === undefined ? '不限' : max}`);
    }
  }
  if (statCount) summary.push(`至少 ${statCount} 项属性条件`);
  summary.push(...[...properties].slice(0, 5));
  const status = isObject(query.status) ? query.status.option : undefined;
  summary.push(status === 'online' ? '在线面交' : status === 'securable' ? '即时购买' : '任意状态');
  if (isObject(filters.misc_filters) && isObject(filters.misc_filters.filters)) {
    const misc = filters.misc_filters.filters;
    for (const [id, label] of [['corrupted', '腐化'], ['identified', '鉴定']] as const) {
      if (isObject(misc[id]) && ['true', 'false'].includes(String(misc[id].option))) summary.push(`${misc[id].option === 'true' ? '已' : '未'}${label}`);
    }
  }
  return { category, statCount, propertyCount, sufficient: statCount + propertyCount >= 2, summary: summary.filter(Boolean) };
}

export function estimateConfidence(context: EstimateContext, groups: readonly EstimatePriceGroup[]): EstimateConfidence {
  const reasons: string[] = [];
  if (!context.sufficient) reasons.push('条件不足：主要按类别或底座查询，未限定足够的关键属性；便宜底装可能混入，不能据此估整件装备。');
  if (!groups.length || groups.some((group) => group.count < 5)) reasons.push('部分币种有效样本少于 5 个卖家，区间和中位数不稳定。');
  return { level: reasons.length ? 'low' : 'limited', reasons };
}

function percentile(values: readonly number[], fraction: number): number {
  const index = (values.length - 1) * fraction;
  const left = Math.floor(index);
  const lower = values[left]!;
  return lower + ((values[Math.ceil(index)] ?? lower) - lower) * (index - left);
}

/** Prices stay in their quoted currencies. A low-price page cannot estimate the whole market. */
export function summarizeListingPrices(listings: readonly unknown[]): {
  readonly groups: EstimatePriceGroup[];
  readonly priced: number;
  readonly duplicateSellers: number;
} {
  const currencies = new Map<string, number[]>();
  const sellers = new Set<string>();
  let duplicateSellers = 0;
  let priced = 0;
  for (const { amount, currency, seller } of listingPrices(listings)) {
    // One seller per quoted currency, retaining their cheapest sampled offer.
    const key = seller ? `${currency}:${seller}` : '';
    if (key && sellers.has(key)) { duplicateSellers++; continue; }
    if (key) sellers.add(key);
    const amounts = currencies.get(currency) ?? [];
    amounts.push(amount);
    currencies.set(currency, amounts);
    priced++;
  }
  const groups = [...currencies].map(([currency, values]): EstimatePriceGroup => {
    values.sort((a, b) => a - b);
    return {
      currency, count: values.length, median: percentile(values, 0.5),
      p25: percentile(values, 0.25), p75: percentile(values, 0.75),
      min: values[0]!, max: values[values.length - 1]!,
    };
  }).sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency));
  return { groups, priced, duplicateSellers };
}

export async function fetchMarketEstimate(
  query: FlexibleTradeDocument,
  league: string,
  signal?: AbortSignal,
): Promise<MarketEstimateResult> {
  const response = await fetch('/api/workbench/estimate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ league, search: query }), signal,
  });
  let result: unknown;
  try { result = await response.json(); } catch {
    throw new Error('本地查价服务未就绪，请使用 start-workbench.cmd 启动工坊。');
  }
  if (!isObject(result) || typeof result.ok !== 'boolean') {
    throw new Error('本地查价服务返回了无效结果，请重新启动工坊。');
  }
  return result as unknown as MarketEstimateResult;
}

const CURRENCY_NAMES: Readonly<Record<string, string>> = {
  exalted: '崇高石', divine: '神圣石', chaos: '混沌石',
  alch: '点金石', regal: '富豪石', annul: '剥离石', mirror: '卡兰德的魔镜',
  aug: '增幅石', transmute: '蜕变石', vaal: '瓦尔宝珠', chance: '机会石',
  'greater-exalted-orb': '高阶崇高石', 'perfect-exalted-orb': '完美崇高石',
  'greater-chaos-orb': '高阶混沌石', 'perfect-chaos-orb': '完美混沌石',
  'greater-regal-orb': '高阶富豪石', 'perfect-regal-orb': '完美富豪石',
  'exalted-orb': '崇高石', 'divine-orb': '神圣石', 'chaos-orb': '混沌石',
};

export const estimateCurrencyName = (currency: string): string => CURRENCY_NAMES[currency] ?? currency;
export const estimateNumber = (value: number): string => new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 2,
}).format(value);

export function estimateSummary(result: MarketEstimateResult, fallbackUrl: string): {
  message: string; detail: string; url: string; status: 'ready' | 'error';
} {
  if (!result.ok) return {
    status: 'error',
    message: result.error.message,
    detail: result.error.retryAfterSeconds
      ? `请等待 ${result.error.retryAfterSeconds} 秒后重试，也可以直接打开官方交易。`
      : '可以直接打开官方交易网站查看相似装备。',
    url: result.url ?? fallbackUrl,
  };
  const main = result.groups[0];
  const metadata = `官网匹配 ${result.total} 件 · 有效样本 ${result.priced} 件 · ${result.cached ? '缓存采样' : '采样'} ${new Date(result.sampledAt).toLocaleString('zh-CN', { hour12: false })}`;
  const context = result.context ? `主要条件：${result.context.summary.join(' · ')}` : '';
  const confidence = result.confidence ? `置信度${result.confidence.level === 'low' ? '低' : '有限'}${result.confidence.reasons.length ? `：${result.confidence.reasons.join(' ')}` : '：仅为低价挂牌样本。'}` : '';
  if (!main) return {
    status: 'ready',
    message: result.total === 0 ? '当前条件没有找到挂单，请放宽筛选。' : '找到了挂单，但样本没有有效标价。',
    detail: [metadata, context, confidence, '请打开官方页面核对。'].filter(Boolean).join('\r\n'), url: result.url,
  };
  const currencyLines = result.groups.map((group) =>
    `${estimateCurrencyName(group.currency)}：${estimateNumber(group.p25)}–${estimateNumber(group.p75)} · 中位 ${estimateNumber(group.median)} · ${group.count} 样本（${estimateNumber(group.min)}–${estimateNumber(group.max)}）`);
  const sampleLines = (result.listings ?? []).slice(0, 3).map((listing) =>
    `样本：${[listing.name, listing.base].filter(Boolean).map(localizeEquipmentName).join(' · ')} / ${estimateNumber(listing.price.amount)} ${estimateCurrencyName(listing.price.currency)}${listing.explicitMods?.[0] ? ` / ${localizeEquipmentStat(listing.explicitMods[0]).slice(0, 90)}` : ''}`);
  return {
    status: 'ready',
    message: result.groups.length > 1 ? `挂牌参考 · ${result.groups.length} 种币种${result.confidence?.level === 'low' ? ' · 低置信' : ''}`
      : `低价样本参考 ${estimateNumber(main.p25)}–${estimateNumber(main.p75)} ${estimateCurrencyName(main.currency)}`,
    detail: [...currencyLines, metadata, context, confidence, ...sampleLines,
      '按币种分别统计并去重卖家，未换算汇率。区间为低价样本中间 50%，挂牌参考，不是成交估价或全市场公允价。',
      ...result.warnings.filter((warning) => !result.confidence?.reasons.includes(warning))].filter(Boolean).join('\r\n').slice(0, 4000),
    url: result.url,
  };
}
