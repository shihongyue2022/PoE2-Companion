import { isCurrency, type Currency } from './finance';
import { isLoadoutSlot, type LoadoutSlot, type LoadoutState } from './loadout';

export interface LoadoutQuote { itemText: string; league: string; amount: number; currency: Currency; at: string; url: string; conditions: string }
export type LoadoutQuotes = Partial<Record<LoadoutSlot, LoadoutQuote>>;
export function canonicalQuoteCurrency(unit: string): Currency | undefined {
  const aliases: Record<string, Currency> = { alch: 'alchemy', 'exalted-orb': 'exalted', 'divine-orb': 'divine', 'chaos-orb': 'chaos',
    'greater-exalted-orb': 'exalt_greater', 'perfect-exalted-orb': 'exalt_perfect', 'greater-chaos-orb': 'chaos_greater', 'perfect-chaos-orb': 'chaos_perfect',
    'greater-regal-orb': 'regal_greater', 'perfect-regal-orb': 'regal_perfect', aug: 'augment' };
  return isCurrency(unit) ? unit : Object.prototype.hasOwnProperty.call(aliases, unit) ? aliases[unit] : undefined;
}
export function readLoadoutQuotes(value: unknown, slots: LoadoutState['slots']): LoadoutQuotes {
  const quotes: LoadoutQuotes = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return quotes;
  for (const [key, input] of Object.entries(value)) {
    if (!isLoadoutSlot(key) || !input || typeof input !== 'object') continue;
    const quote = input as LoadoutQuote;
    if (typeof quote.itemText !== 'string' || quote.itemText !== slots[key] || typeof quote.league !== 'string' || quote.league.length > 150
      || typeof quote.amount !== 'number' || !Number.isFinite(quote.amount) || quote.amount < 0 || quote.amount > 1e12
      || !isCurrency(quote.currency) || typeof quote.at !== 'string' || !Number.isFinite(Date.parse(quote.at))
      || typeof quote.conditions !== 'string' || quote.conditions.length > 1000 || typeof quote.url !== 'string' || quote.url.length > 60000) continue;
    try { const url = new URL(quote.url); if (url.origin !== 'https://www.pathofexile.com' || url.pathname !== '/trade2' && !url.pathname.startsWith('/trade2/')) continue; } catch { continue; }
    quotes[key] = quote;
  }
  return quotes;
}
export function currentLoadoutQuotes(state: LoadoutState, league: string) {
  return Object.entries(readLoadoutQuotes(state.quotes, state.slots)).filter(([, quote]) => quote.league === league)
    .map(([slot, quote]) => ({ slot: slot as LoadoutSlot, quote }));
}
