import type { FlexibleTradeDocument } from './tradeSearch';

export interface EstimatePriceGroup {
  readonly currency: string;
  readonly count: number;
  readonly median: number;
  readonly p25: number;
  readonly p75: number;
  readonly min: number;
  readonly max: number;
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
  const prices: { amount: number; currency: string; seller: string }[] = [];
  for (const row of listings) {
    if (!isObject(row) || row.gone || !isObject(row.listing)) continue;
    const listing = row.listing;
    if (!isObject(listing.price)) continue;
    const amount = listing.price.amount;
    const currency = listing.price.currency;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0
      || typeof currency !== 'string' || !/^[a-z][a-z0-9-]{0,100}$/.test(currency)) continue;
    const seller = isObject(listing.account) && typeof listing.account.name === 'string'
      ? listing.account.name.trim().toLowerCase() : '';
    prices.push({ amount, currency, seller });
  }
  prices.sort((a, b) => a.currency.localeCompare(b.currency) || a.amount - b.amount);
  for (const { amount, currency, seller } of prices) {
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
  if (!main) return {
    status: 'ready',
    message: result.total === 0 ? '当前条件没有找到挂单，请放宽筛选。' : '找到了挂单，但样本没有有效标价。',
    detail: `官网匹配 ${result.total} 件；请打开官方页面核对。`, url: result.url,
  };
  return {
    status: 'ready',
    message: `低价样本参考 ${estimateNumber(main.p25)}–${estimateNumber(main.p75)} ${estimateCurrencyName(main.currency)}`,
    detail: `${main.count} 个同币种卖家样本，中位数 ${estimateNumber(main.median)}；挂牌参考，不是成交估价。${result.groups.length > 1 ? '还有其他币种，打开工坊查看。' : ''}`,
    url: result.url,
  };
}
