import type { ResistanceGate } from './resistanceModel';
const percent = (value?: number) => value === undefined ? '未知' : `${Number(value.toFixed(2))}%`;
export default function ResistanceComparisonPanel({ gate, onConfirmCaps }: { gate: ResistanceGate; onConfirmCaps: () => void }) {
  return <section className="lo-resistance-check" aria-label="全身四抗换装检查"><h4>整套装备换完后的四抗</h4>
    <p className="lo-footnote">全元素抗性＝火、冰、雷，不含混沌。溢出减少但仍达上限，不算有效抗性下降。依据：{gate.origin ?? '尚未读取角色总抗性'}。</p>
    {gate.notes.some((note) => note.includes('满孔镶嵌情景')) && <p className="lo-footnote">镶嵌数量包含满孔情景，请在游戏中核对；推算结果不等于实际面板。</p>}
    <div className="lo-resistance-grid">{gate.rows.map((row) => <article key={row.key} aria-label={row.label} className={row.met === false ? 'unmet' : ''}>
      <strong>{row.label} · {row.met === true ? '达标' : row.met === false ? `缺 ${percent((row.minimum ?? 0) - (row.after ?? 0))}` : '待核对'}</strong>
      <p>有效：{percent(row.effectiveBefore)} → {percent(row.effectiveAfter)} · 上限 {percent(row.cap)}</p>
      <p>总值：{percent(row.before)} → {percent(row.after)}</p><p>溢出：{percent(row.overflowBefore)} → {percent(row.overflowAfter)}</p>
    </article>)}</div>
    {gate.rows.some((row) => row.cap === undefined) && <button className="wb-button" type="button" onClick={onConfirmCaps}>确认我的四项抗性上限均为 75%</button>}
    {gate.notes.length > 0 && <details open={gate.status === 'unknown'}><summary>抗性计算依据与待核对项</summary>{gate.notes.map((note) => <p className="lo-footnote" key={note}>{note}</p>)}</details>}
  </section>;
}
