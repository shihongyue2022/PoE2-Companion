import { BUILD_FAMILIES } from './buildProfile';
import { buildConditionWarnings, buildSlotPriorities, buildModFamily } from './buildAdvice';
import { equipmentDisplayName, parseEquipment } from './genericEquipment';
import { slotLabel, type LoadoutSlot, type LoadoutState } from './loadout';
import { translatePobLabel } from './localization';

export default function BuildAdvicePanel({ state, selected, onSearch, onClear }: {
  state: LoadoutState; selected: LoadoutSlot; onSearch: () => void; onClear: () => void;
}) {
  const profile = state.goals.build; if (!profile) return null;
  const item = parseEquipment(state.slots[selected] ?? '');
  const warnings = buildConditionWarnings(profile, state.slots);
  const priorities = buildSlotPriorities(profile, selected);
  const present = new Set(item?.mods.filter((mod) => mod.searchable).map((mod) => buildModFamily(profile, mod)));
  if (item?.properties.some((property) => property.name === 'energyShield' && (property.values[0] ?? 0) > 0)) present.add('energyShield');
  if (item?.properties.some((property) => property.name === 'evasion' && (property.values[0] ?? 0) > 0)) present.add('evasion');
  const helmet = parseEquipment(state.slots.helmet ?? '');
  const es = helmet?.properties.find((property) => property.name === 'energyShield')?.values[0];
  const differentClass = state.source?.ascendancy && profile.ascendancy && translatePobLabel(state.source.ascendancy) !== translatePobLabel(profile.ascendancy);
  return <section className="lo-summary lo-local-game" aria-label="BD 配装建议">
    <h3>BD 配装方向 · {profile.main.label}</h3>
    <details className="wb-fold"><summary>查看天赋依据、辅助组合与本栏侧重</summary><p>{profile.fileName} · 等级 {profile.level} · 武器组 {profile.weaponSet} · {profile.matchedPassives} 条天赋 ID 已匹配{profile.unknownPassives ? `，${profile.unknownPassives} 条未匹配` : ''}</p>
    <p className="lo-footnote">建议依据参考 BD 的主攻技能标签与天赋信号，不是当前角色的完整 DPS 模拟。相对权重用于综合搜索，不能当作提升百分比。</p>
    {differentClass && <p className="lo-alert">BD 升华与当前 PoB2 存档不同，请先核对是否选择了正确的参考方案。</p>}
    <p>辅助组合：{profile.main.supports.map((support) => support.label).join('、') || '此组合未记录辅助'}。</p>
    {profile.constraints.emptyOffhand && <p>关键条件：Dance with Death 要求副手留空，且主手使用单手近战武器；工坊会在换装比较中提醒条件冲突。</p>}
    {profile.constraints.helmetEsEvasion && <p>头盔联动：参考天赋按头盔的物品能量护盾提供闪避{es !== undefined ? `；当前头盔物品能量护盾为 ${es}` : '；当前未读到头盔物品能量护盾'}。换头时同时核对护盾来源与闪避收益，工坊不会将其重复加到角色面板。</p>}
    {profile.constraints.gemColours && <p>辅助颜色数量会影响参考升华效果；这里尚未重算实际插槽颜色占比，换辅助时需另行核对。</p>}
    {profile.constraints.manaBeforeLife && <p>参考天赋让部分伤害由魔力承受，配装应同时核对魔力池与回复，不能只比较生命或护盾。</p>}

    <h4>{slotLabel(selected)}的配装侧重{item ? ` · ${equipmentDisplayName(item)}` : ''}</h4>
    {priorities.length ? <ul>{priorities.map((priority) => <li key={priority.family}><strong>{BUILD_FAMILIES[priority.family]} · 权重 {priority.weight}</strong>
      {item ? ` · ${present.has(priority.family) ? '当前可识别属性中已读到' : '当前可识别属性中未读到，候选可重点核对'}` : ''}<br /><span className="lo-footnote">{priority.reason}</span></li>)}</ul>
      : <p>药剂与护符的条件效果暂不使用常驻装备权重，需要结合实际战斗与触发条件核对。</p>}
    <p className="lo-footnote">原 BD 缺少完整装备与战斗配置，不能计算精确属性需求、触发覆盖率、实际伤害增幅或“毕业”预算。未识别词缀不等于没有收益；抗性最低要求仍由角色目标控制。</p>
    <p className="lo-footnote">使用四抗伤害目标时，搜索会从匹配底座的词池补充主输出相关的潜在属性；旧装备没有的词缀也能参与候选评分。未核对的机制不当作已计算的 DPS。</p>
    {!!profile.warnings.length && <details><summary>参考数据核对提示</summary><ul>{profile.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
    </details>{warnings.map((warning) => <p className="lo-alert" key={warning}>{warning}</p>)}<div className="lo-actions"><button className="wb-button" disabled={!item || !priorities.length} onClick={onSearch}>按 BD 方向寻找本栏升级</button>
      <button className="wb-text-button" onClick={onClear}>清除 BD 方向</button></div>
  </section>;
}
