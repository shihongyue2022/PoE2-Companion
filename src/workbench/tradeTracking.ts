import type { Currency } from './finance';
import { isCurrency } from './finance';

export interface TradeCandidate {
  id: string; at: string; player: string; item: string; quantity: number;
  amount: number | null; currency: Currency | null; currencyText: string;
  kind: 'sale' | 'purchase' | null; league?: string; source: 'log' | 'paste' | 'import'; acceptedAt?: string;
}
const aliases: Record<string, Currency> = {
  exalted: 'exalted', 'exalted orb': 'exalted', 'exalted orbs': 'exalted', ex: 'exalted', 崇高石: 'exalted',
  divine: 'divine', 'divine orb': 'divine', 'divine orbs': 'divine', div: 'divine', 神聖石: 'divine', 神圣石: 'divine',
  chaos: 'chaos', 'chaos orb': 'chaos', 'chaos orbs': 'chaos', 混沌石: 'chaos',
  alchemy: 'alchemy', 'orb of alchemy': 'alchemy', 'orbs of alchemy': 'alchemy', 點金石: 'alchemy', 点金石: 'alchemy',
  annulment: 'annul', 'orb of annulment': 'annul', 剝離石: 'annul', 剥离石: 'annul',
  regal: 'regal', 'regal orb': 'regal', 富豪石: 'regal', augmentation: 'augment', 'orb of augmentation': 'augment', 增幅石: 'augment',
  transmutation: 'transmute', 'orb of transmutation': 'transmute', 蛻變石: 'transmute', 蜕变石: 'transmute',
};
export function tradeCurrency(text: string): Currency | null {
  const key = text.trim().toLowerCase().replace(/[.。]$/, '');
  if (isCurrency(key)) return key;
  const tiered = /^(greater|perfect)-(exalted|chaos|regal|transmutation|augmentation)-orb$/.exec(key);
  if (tiered) {
    const stem = ({ exalted: 'exalt', chaos: 'chaos', regal: 'regal', transmutation: 'transmute', augmentation: 'augment' } as Record<string, string>)[tiered[2]!];
    const native = `${stem}_${tiered[1]}`; if (isCurrency(native)) return native;
  }
  return Object.prototype.hasOwnProperty.call(aliases, key) ? aliases[key]! : null;
}
export function logTimestamp(line: string): string | null {
  const match = /^(\d{4})[/-](\d\d)[/-](\d\d) (\d\d):(\d\d):(\d\d)/.exec(line);
  if (!match) return null;
  const values = match.slice(1).map(Number), [year, month, day, hour, minute, second] = values as [number, number, number, number, number, number];
  const date = new Date(year, month - 1, day, hour, minute, second);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && date.getHours() === hour
    && date.getMinutes() === minute && date.getSeconds() === second ? date.toISOString() : null;
}
/** Recognise official trade whispers only. Free chat is never returned or persisted. */
export function parseTradeMessage(raw: string, options: { id: string; at?: string; source: TradeCandidate['source']; kind?: TradeCandidate['kind'] }): TradeCandidate | null {
  if (raw.length > 16_000) return null;
  const message = raw.replace(/^.*?\[(?:INFO|DEBUG) Client[^\]]*\]\s*/, '').trim();
  const whisper = /^@(From|To|來自|来自|向|傳送給|发送给)\s+(.+?):\s*(.+)$/i.exec(message);
  const body = whisper?.[3] ?? message;
  const kind = whisper ? /^(?:from|來自|来自)$/i.test(whisper[1]!) ? 'sale' : 'purchase' : options.kind ?? null;
  let item: string | undefined, amount: string | undefined, unit: string | undefined, league: string | undefined;
  const english = /(?:I would like|I'd like) to buy your (.+?) (?:listed for|for my) ([\d.,]+) (.+?) in (.+?)(?:\s*[（(]|\s*[.。]?$)/i.exec(body);
  const chinese = /我想(?:要)?(?:購買|购买)(?:你的)?\s*(.+?)\s*(?:標價|标价|售價|售价)\s*([\d.,]+)\s+(.+?)\s+(?:在|於|于)\s+(.+?)(?:\s*[（(]|\s*[.。]?$)/.exec(body);
  const reversed = /我想(?:要)?(?:購買|购买)你在\s*(.+?)\s*(?:中)?(?:以|標價|标价)\s*([\d.,]+)\s+(.+?)\s*(?:標價|标价)?的\s*(.+?)(?:\s*[（(]|$)/.exec(body);
  if (english || chinese) [, item, amount, unit, league] = (english ?? chinese)!;
  else if (reversed) [, league, amount, unit, item] = reversed;
  else return null;
  const value = Number(amount!.replace(/,/g, ''));
  if (!Number.isFinite(value) || value <= 0 || value > 1e12) return null;
  const stack = /^(\d+)\s+(.+)$/.exec(item!.trim());
  const quantity = stack ? Number(stack[1]) : 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1e9) return null;
  const at = options.at ?? logTimestamp(raw) ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(at))) return null;
  return { id: options.id, at, kind, player: (whisper?.[2] ?? '').replace(/^<[^>]+>\s*/, '').slice(0, 150), item: (stack?.[2] ?? item!).trim().slice(0, 300),
    quantity, amount: value, currency: tradeCurrency(unit!), currencyText: unit!.trim().slice(0, 100), league: league!.trim().slice(0, 150), source: options.source };
}

export interface TradeLogSummary {
  found: boolean; source?: string; modifiedAt?: string; events: TradeCandidate[]; truncated: boolean; warning?: string;
  diagnostics?: { history: boolean; bytesRead: number; lines: number; whispers: number; unmatchedTradeMessages: number; acceptanceHints: number; firstAt?: string; lastAt?: string };
}
