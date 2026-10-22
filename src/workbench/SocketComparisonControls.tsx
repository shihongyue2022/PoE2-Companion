import { equipmentMetricDetails, hasSocketScaling, occupiedSockets, type Equipment } from './genericEquipment';

export default function SocketComparisonControls({ before, after, beforeFilled, afterFilled, onBefore, onAfter, onFull }: {
  before: Equipment | null; after: Equipment; beforeFilled?: number; afterFilled?: number;
  onBefore: (value?: number) => void; onAfter: (value?: number) => void; onFull: () => void;
}) {
  if (!hasSocketScaling(after) && (!before || !hasSocketScaling(before))) return null;
  const complete = (!before || !hasSocketScaling(before) || occupiedSockets(before, { filledSockets: beforeFilled }) !== undefined)
    && (!hasSocketScaling(after) || occupiedSockets(after, { filledSockets: afterFilled }) !== undefined);
  return <section className="lo-socket-comparison" aria-label="镶嵌数量与联动效果">
    <div className="lo-detail-heading"><h4>确认镶嵌数量，再比较插槽收益</h4>{!complete && <button type="button" className="wb-button" onClick={onFull}
      disabled={hasSocketScaling(after) && !after.sockets || !!before && hasSocketScaling(before) && !before.sockets}>按两件全部镶嵌比较</button>}</div>
    <p className="lo-footnote">S 表示孔位，不能证明已镶嵌。选择实际数量，或按全部镶嵌的情景比较；只用于本次比较，不改写装备和角色面板。</p>
    <div className="lo-socket-grid">{([{ label: '当前装备', item: before, count: beforeFilled, onChange: onBefore }, { label: '候选装备', item: after, count: afterFilled, onChange: onAfter }]).map(({ label, item, count, onChange }) => {
      if (!item || !hasSocketScaling(item)) return <div key={label}><strong>{label}</strong><p>无每插槽联动词缀。</p></div>;
      const actual = occupiedSockets(item, { filledSockets: count });
      const preview = item.sockets && actual === undefined ? equipmentMetricDetails(item, { filledSockets: item.sockets.count }) : equipmentMetricDetails(item, { filledSockets: actual });
      return <div key={label}><label>{label}已镶嵌数量<select aria-label={`${label}已镶嵌数量`} value={actual ?? ''} disabled={!item.sockets} onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}>
        <option value="">未确认</option>{Array.from({ length: (item.sockets?.count ?? 0) + 1 }, (_, index) => <option key={index} value={index}>{index} / {item.sockets?.count}</option>)}</select></label>
        {actual === undefined && <p className="lo-footnote">{item.sockets ? `以下为 ${item.sockets.count} 孔全部镶嵌的预览，尚未计入比较。` : '复制文本没有可确认的插槽数量，请补充完整物品文本。'}</p>}
        {item.sockets?.filled !== undefined && count === undefined && <p className="lo-footnote">数量来自 PoB2 完整的 Rune 列表。</p>}
        {preview.explanations.map((line) => <p className="lo-socket-formula" key={line}>{line}</p>)}
      </div>;
    })}</div>
    <p className="lo-footnote">装备显示的护甲、闪避、能量护盾已包含本地词缀、品质和镶嵌加成，只比较一次。全域增加百分比另列，不能当作最终防御提升百分比。满孔情景只展开每插槽词缀；换符文后的本地防御须重新复制装备核对。</p>
  </section>;
}
