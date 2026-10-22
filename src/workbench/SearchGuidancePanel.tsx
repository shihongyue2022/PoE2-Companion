import type { EquipmentTradeRow } from './genericEquipmentTrade';
import type { RollGuide, SearchAmbition } from './searchGuidance';
import './searchGuidance.css';

const number = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 3 });
const range = (value: { min: number; max: number }) => value.min === value.max ? number(value.min) : `${number(value.min)}–${number(value.max)}`;
export function RollRangeHint({ guide }: { guide?: RollGuide }) {
  if (!guide) return null;
  return <span className="wb-roll-hint">
    {guide.current && <small>{guide.unique ? '传奇词缀范围' : '当前阶层范围'} {range(guide.current)}{guide.currentPercent !== undefined ? ` · ${guide.unique ? '词缀' : '本阶层'} roll ${Math.round(guide.currentPercent)}%` : ''}</small>}
    {guide.top && (guide.tierFloor || !guide.current) && <small>{guide.tierFloor ? 'T1 阶层范围' : '传奇资料范围'} {range(guide.top)}{guide.source ? ` · ${guide.source}` : ''}</small>}
    {guide.note && <small>{guide.note}</small>}
  </span>;
}
export function SearchConditionHint({ row, upgrading }: { row: EquipmentTradeRow; upgrading: boolean }) {
  return <span className="wb-condition-hint">{!row.enabled ? '不参与搜索' : row.locked ? `自动保抗 ≥ ${row.min}%`
    : row.referenceOnly || row.presenceOnly || row.actualValue === undefined ? row.min || row.max ? `条件 ${row.min ? `≥ ${row.min}` : ''}${row.max ? ` ≤ ${row.max}` : ''}` : '保留此机制'
      : row.min || row.max ? `${row.min ? `≥ ${row.min}` : ''}${row.max ? ` ≤ ${row.max}` : ''}` : upgrading ? '自动择优 · 不设单项门槛' : '不限制数值'}</span>;
}
export default function SearchGuidancePanel({ ambition, onChoose, guideCount, note, busy, onLookup, unique }: {
  ambition: SearchAmbition | 'custom'; onChoose: (value: SearchAmbition) => void;
  guideCount: number; note: string; busy: boolean; onLookup?: () => void; unique: boolean;
}) {
  return <section className="wb-search-guidance" aria-label="自动设置搜索条件">
    <h4>搜索条件由工坊生成，无需手填 roll 范围</h4>
    <p className="wb-fine">默认自动择优，单项允许取舍；使用四抗目标时自动保抗。若要收紧候选，选下方档位即可。T1 是词缀阶层，满 roll 是阶层内的数值高低。</p>
    <div className="wb-guidance-choices" role="group" aria-label="自动搜索档位">{([
      ['auto', '系统推荐', '自动约束与排序'], ['current', '保留当前数值', '已选属性不降低'],
      ['t1', '已核对项达 T1', '采用 T1 起点'], ['near-max', '接近满 roll', '已知最高阶层区间的 90%'],
    ] as const).map(([value, title, detail]) => <button type="button" key={value} className={ambition === value ? 'active' : ''} aria-pressed={ambition === value} disabled={value === 't1' && unique || (value === 't1' || value === 'near-max') && guideCount === 0} onClick={() => onChoose(value)}><strong>{title}</strong><small>{value === 't1' && unique ? '传奇不套普通 T1' : value === 'near-max' && unique ? '已确认传奇范围的 90%' : detail}</small></button>)}</div>
    <p className="wb-fine" role="status">{note || `已确认 ${guideCount} 项可用于自动门槛的范围。未确认的项目继续自动择优，不需要你猜数字。`}</p>
    {onLookup && <button type="button" className="wb-text-button" disabled={busy} onClick={onLookup}>{busy ? '正在核对英文范围资料…' : '核对传奇英文 roll 范围'}</button>}
  </section>;
}
