import { CURRENCIES, type Currency } from './finance';
import { currentLoadoutQuotes } from './loadoutQuotes';
import { slotLabel, type LoadoutState } from './loadout';

export default function LoadoutQuoteSummary({ state, league }: { state: LoadoutState; league: string }) {
  const quotes = currentLoadoutQuotes(state, league), count = Object.keys(state.slots).length;
  const totals = new Map<Currency, number>();
  for (const { quote } of quotes) totals.set(quote.currency, (totals.get(quote.currency) ?? 0) + quote.amount);
  return <section className="lo-summary" aria-label="整套装备挂牌参考">
    <h3>整套装备已记录的挂牌参考</h3>
    <p className="lo-footnote">{quotes.length} / {count} 件已记录 · {league}。从每件装备查价结果中主动记录，未知项不按 0 估值，不混算币种；这些是挂牌样本参考，不能当作成交价。</p>
    {[...totals].map(([unit, amount]) => <p key={unit}>{amount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} {CURRENCIES[unit]}（已记录部分）</p>)}
    {!!quotes.length && <details><summary>查看来源与时间</summary>{quotes.map(({ slot, quote }) => <p className="lo-footnote" key={slot}>{slotLabel(slot)}：{quote.amount} {CURRENCIES[quote.currency]} · {new Date(quote.at).toLocaleString('zh-CN')} · {quote.conditions} <a href={quote.url} target="_blank" rel="noreferrer">官网核对 ↗</a></p>)}</details>}
  </section>;
}
