import type { TradeFilterRow } from './tradeSearch';

/** Verified against Exiled Exchange 2's MIT stats.ndjson at the same pinned
 * commit used by gear-stats.json. IDs are the official trade site's IDs.
 * https://github.com/Kvan7/Exiled-Exchange-2/blob/572c1925e4737d2c5f79143d03280df9660c1d8f/renderer/public/data/en/stats.ndjson
 * These totals add actual printed values; quality is already represented there.
 */
export const TRADE_PSEUDO_SOURCE = {
  commit: '572c1925e4737d2c5f79143d03280df9660c1d8f',
  elemental: 'pseudo.pseudo_total_elemental_resistance',
  attributes: 'pseudo.pseudo_total_attributes',
} as const;

const ELEMENTAL: Readonly<Record<string, number>> = {
  stat_3372524247: 1, // Fire
  stat_4220027924: 1, // Cold
  stat_1671376347: 1, // Lightning
  stat_2901986750: 3, // all Elemental Resistances
  stat_2915988346: 2, // Fire and Cold
  stat_3441501978: 2, // Fire and Lightning
  stat_4277795662: 2, // Cold and Lightning
  stat_378817135: 1, // Fire and Chaos (only fire counts here)
  stat_3393628375: 1, // Cold and Chaos
  stat_3465022881: 1, // Lightning and Chaos
};
const ATTRIBUTES: Readonly<Record<string, number>> = {
  stat_4080418644: 1, // Strength
  stat_3261801346: 1, // Dexterity
  stat_328541901: 1, // Intelligence
  stat_1379411836: 3, // all Attributes
  stat_2897413282: 3, // alternative all Attributes trade ID
  stat_538848803: 2, // Strength and Dexterity
  stat_1535626285: 2, // Strength and Intelligence
  stat_2300185227: 2, // Dexterity and Intelligence
};

function multiplier(row: TradeFilterRow, table: Readonly<Record<string, number>>): number | undefined {
  if (row.origin === 'pseudo') return undefined;
  const values = row.ids.map((id) => table[id.slice(id.indexOf('.') + 1)]);
  const known = values.filter((value) => value !== undefined);
  // Every alternative must have the same meaning. Do not combine a mixed or
  // ambiguous ID list as if it were a verified resistance/attribute scalar.
  return known.length === values.length && known.length > 0 && known.every((value) => value === known[0])
    ? known[0] : undefined;
}

export function tradePseudoKind(row: TradeFilterRow): 'elemental-resistance' | 'attributes' | undefined {
  if (multiplier(row, ELEMENTAL) !== undefined) return 'elemental-resistance';
  if (multiplier(row, ATTRIBUTES) !== undefined) return 'attributes';
  return undefined;
}

/** The verified contribution of one source line to a pseudo total, counting aliases only once. */
export function tradePseudoMultiplier(
  row: TradeFilterRow,
  kind: 'elemental-resistance' | 'attributes',
): number | undefined {
  return multiplier(row, kind === 'elemental-resistance' ? ELEMENTAL : ATTRIBUTES);
}

/** Return optional, initially unchecked totals, without copying tier minima into
 * an alleged actual total. Unread totals remain presence-only with an explanation.
 * Each original line contributes once, regardless of its explicit/fractured aliases.
 * A broad total compares equivalent effects without requiring the same affix layout.
 */
export function buildTradePseudoRows(rows: readonly TradeFilterRow[]): TradeFilterRow[] {
  const unique = [...new Map(rows.map((row) => [row.key, row])).values()];
  return [
    { kind: 'elemental-resistance', label: '总元素抗性', id: TRADE_PSEUDO_SOURCE.elemental, table: ELEMENTAL },
    { kind: 'attributes', label: '总能力值', id: TRADE_PSEUDO_SOURCE.attributes, table: ATTRIBUTES },
  ].flatMap(({ kind, label, id, table }): TradeFilterRow[] => {
    const parts = unique.flatMap((row) => {
      const factor = multiplier(row, table);
      return factor === undefined ? [] : [{ row, factor }];
    });
    if (!parts.some(({ row }) => row.origin === 'actual' && Number.isFinite(row.actualValue))) return [];
    const complete = parts.every(({ row }) => row.origin === 'actual' && Number.isFinite(row.actualValue));
    const total = complete ? parts.reduce((sum, { row, factor }) => sum + row.actualValue! * factor, 0) : undefined;
    return [{
      key: 'pseudo:' + kind,
      label,
      sourceLabel: parts.map(({ row, factor }) => `${row.label}${factor > 1 ? ' ×' + factor : ''}`).join(' + '),
      ids: [id], enabled: false, min: total === undefined ? '' : String(total), max: '', origin: 'pseudo',
      ...(total === undefined ? {} : { actualValue: total }),
      warning: total === undefined
        ? '部分组成属性缺少已确认的实数，暂不填写合计数值，请核对原装备。'
        : '按已识别的装备词缀合计；固定、附魔等未列出的属性不计入此显示值，官网按物品完整总值检索。',
    }];
  });
}
