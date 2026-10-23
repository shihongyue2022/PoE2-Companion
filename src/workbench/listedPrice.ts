import { tradeCurrency } from './tradeTracking';
/** Only an explicit clipboard listing note is a price. Never derive it from stats. */
export function listedPrice(raw: string, rates: Readonly<Record<string, number>>, overrides: Readonly<Record<string, number>> = {}) {
  const matches = [...raw.matchAll(/^\s*(?:(?:Note|Notes|備註|备注|附註)\s*[:：]\s*)?~(?:b\/o|price)\s+(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?\s+([^\r\n]+?)\s*$/gim)];
  if (matches.length !== 1) return undefined;
  const match = matches[0]!, amount = Number(match[1]) / Number(match[2] ?? 1), currency = tradeCurrency(match[3]!);
  if (!currency || !Number.isFinite(amount) || amount <= 0 || amount > 1e12) return undefined;
  const key = currency === 'exalted' ? 'exalt' : currency;
  const rate = currency === 'exalted' ? 1 : overrides[key] ?? rates[key];
  const exalted = rate === undefined ? undefined : amount * rate;
  return { amount, currency, unit: match[3]!, rate, exalted: exalted !== undefined && Number.isFinite(exalted) && exalted > 0 && exalted <= 1e12 ? exalted : undefined };
}
