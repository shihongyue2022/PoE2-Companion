import { LOADOUT_SLOTS, loadoutTotals, METRICS, type LoadoutState } from './loadout';
import { activeWeaponSet, switchWeaponSet } from './weaponSets';
import { equipmentDisplayName, parseEquipment } from './genericEquipment';
import { activeGems } from './pobCombat';
import { resistanceBaseline } from './resistanceModel';

export default function WeaponContributionPanel({ state }: { state: LoadoutState }) {
  if (!state.weaponSets) return null;
  const groups = ([1, 2] as const).map((number) => {
    const group = switchWeaponSet(state, number), totals = loadoutTotals(group), baseline = resistanceBaseline(group);
    const combat = state.source?.combat;
    const skillSet = combat?.sets.find((set) => set.id === combat.activeSet);
    return { number, group, totals, baseline, gems: skillSet ? skillSet.groups.reduce((sum, skill) => sum + activeGems(skill, number === 2).length, 0) : undefined };
  });
  const metrics = METRICS.filter((metric) => !metric.key.endsWith('Dps') && groups.some((group) => (group.totals[metric.key] ?? 0) !== 0));
  return <details className="lo-backup"><summary>武器组 I / II · 装备贡献与面板依据</summary>
    <p className="lo-footnote">当前启用 {activeWeaponSet(state) === 1 ? 'I' : 'II'}。两组互斥；共同防具与饰品各算一次，只加入本组主副手。下表是装备可加总属性，不是完整角色面板。</p>
    <div className="lo-revision-raw">{groups.map(({ number, group, baseline, gems }) => <section key={number}><h4>武器组 {number === 1 ? 'I' : 'II'}</h4>{LOADOUT_SLOTS.filter((slot) => slot.id === 'mainHand' || slot.id === 'offHand').map((slot) => { const item = parseEquipment(group.slots[slot.id] ?? ''); return <p className="lo-footnote" key={slot.id}>{slot.label}：{item ? equipmentDisplayName(item) : '未装备'}</p>; })}<p className="lo-footnote">技能组可用宝石：{gems ?? '未读取'} · 角色抗性依据：{baseline.origin ?? '缺少本组基准'}</p></section>)}</div>
    <div className="lo-table-scroll"><table className="lo-deltas"><thead><tr><th>装备可加总贡献</th><th>I</th><th>II</th><th>II − I</th></tr></thead><tbody>{metrics.map((metric) => { const a = groups[0]!.totals[metric.key] ?? 0, b = groups[1]!.totals[metric.key] ?? 0; return <tr key={metric.key}><th>{metric.label}</th><td>{Number(a.toFixed(2))}{metric.unit}</td><td>{Number(b.toFixed(2))}{metric.unit}</td><td>{b > a ? '+' : ''}{Number((b - a).toFixed(2))}{metric.unit}</td></tr>; })}</tbody></table></div>
    <p className="wb-inline-warning">还不能完整重算两组的最终面板。武器组天赋、技能启用、精魂预留、持续增益与条件效果会影响结果；没有本组角色基准时，不借用另一组总抗性或伤害。准确结果请在 PoB2 分别启用两组重算，或在游戏中切组后校准。</p>
    <a className="wb-link" href="https://www.pathofexile.com/forum/view-thread/3740562" target="_blank" rel="noreferrer">GGG 官方 0.2.0 更新说明：技能的武器组限制与切组持续增益修复 ↗</a>
  </details>;
}
