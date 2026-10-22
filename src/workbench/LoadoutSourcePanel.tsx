import { METRICS, emptyLoadout, type LoadoutState } from './loadout';
import { loadoutChanges, sourceIsCurrent } from './loadoutIntegration';
import { translatePobLabel } from './localization';
import { equipmentDisplayName, parseEquipment } from './genericEquipment';

export function LoadoutChangePreview({ before, after }: { before: LoadoutState; after: LoadoutState }) {
  const change = loadoutChanges(before, after);
  return <section className="lo-import-diff" aria-label="整套装备更新对照">
    <p>{change.slots.length ? `${change.slots.length} 个栏位发生变化` : '装备栏位没有变化'}。只对照能够直接读取的装备属性，不能据此推断完整流派伤害或生存提升。</p>
    {!!change.slots.length && <ul>{change.slots.map((slot) => {
      const oldItem = parseEquipment(before.slots[slot.id] ?? ''), newItem = parseEquipment(after.slots[slot.id] ?? '');
      return <li key={slot.id} title={`${slot.before} → ${slot.after}`}>{slot.label}：{oldItem ? equipmentDisplayName(oldItem) : '未装备'} → {newItem ? equipmentDisplayName(newItem) : '未装备'}</li>;
    })}</ul>}
    {!!change.metrics.length && <div className="lo-table-scroll"><table className="lo-deltas"><thead><tr><th>装备贡献</th><th>更新前</th><th>更新后</th><th>变化</th></tr></thead><tbody>{change.metrics.map((metric) => <tr key={metric.key}><th>{metric.label}</th><td>{metric.before.toLocaleString('zh-CN')}{metric.unit}</td><td>{metric.after.toLocaleString('zh-CN')}{metric.unit}</td><td className={metric.delta > 0 ? 'positive' : 'negative'}>{metric.delta > 0 ? '+' : ''}{Number(metric.delta.toFixed(2))}{metric.unit}</td></tr>)}</tbody></table></div>}
    {!change.metrics.length && <p className="lo-footnote">可加总的装备贡献没有变化；特殊效果、未识别词缀及武器 DPS 请逐件核对。</p>}
  </section>;
}
export default function LoadoutSourcePanel({ state }: { state: LoadoutState }) {
  const source = state.source, current = sourceIsCurrent(state);
  return <>
    {source && <section className="lo-summary" aria-label="角色数据来源">
      <h3>PoB2 装备方案 · {source.fileName ?? source.setTitle}</h3>
      <p className="lo-footnote">{[source.level ? `等级 ${source.level}` : '', source.className ? translatePobLabel(source.className) : '', source.ascendancy ? translatePobLabel(source.ascendancy) : '', source.version ? `版本 ${source.version}` : '', translatePobLabel(source.setTitle), source.secondWeapons ? '第二套武器' : '第一套武器'].filter(Boolean).join(' · ')}</p>
      <p className="lo-footnote">导入：{new Date(source.importedAt).toLocaleString('zh-CN')}{source.savedAt ? ` · 文件保存：${new Date(source.savedAt).toLocaleString('zh-CN')}` : ''} · {current ? '对应当前装备快照' : '装备已手动变更，PoB2 快照需更新'}</p>
      {!!source.warnings?.length && <details><summary>导入核对记录 · {source.warnings.length} 项</summary><p className="lo-footnote">未导入栏位和未知效果可能影响完整方案；PoB2 面板参考保留其原方案配置。</p><ul className="lo-warnings">{source.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
      {source.reference && <details><summary>PoB2 保存时面板参考{!current ? '（已过期）' : ''}</summary>
        <p className="lo-footnote">这些是 PoB2 保存时的计算结果，受其天赋、技能和配置影响；不是游戏实测面板，也不会随工坊换装自动重算。换装判断仍使用装备差值与单独录入的游戏面板。</p>
        <div className="lo-total-grid">{METRICS.filter((metric) => source.reference!.values[metric.key] !== undefined).map((metric) => <div key={metric.key}><span>{metric.label}{metric.key.endsWith('Resistance') ? '未封顶总值' : ''}</span><strong>{source.reference!.values[metric.key]!.toLocaleString('zh-CN')}{metric.unit}</strong></div>)}</div>
        {Object.entries(source.reference.effective ?? {}).map(([key, value]) => <p className="lo-footnote" key={key}>{METRICS.find((metric) => metric.key === key)?.label}有效值（PoB2）：{value}%（与未封顶总值分开显示）</p>)}
        {source.reference.fullDps !== undefined && <p className="lo-footnote">保存时 PoB2 全技能汇总：{source.reference.fullDps > 0 ? Math.round(source.reference.fullDps).toLocaleString('zh-CN') : '未计入汇总（不表示角色伤害为零）'}。主技能及命中／持续伤害请展开“技能与构成”。</p>}
      </details>}
    </section>}
    {state.previous && <details className="lo-backup"><summary>最近一次整套更新对照</summary><LoadoutChangePreview before={{ ...emptyLoadout(), slots: state.previous.slots }} after={state} /></details>}
  </>;
}
