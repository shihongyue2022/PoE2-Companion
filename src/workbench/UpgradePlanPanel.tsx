import { useMemo, useState } from 'react';
import type { PatchData } from '../../packages/engine/src/types';
import type { GearTrade } from '../lib/gearTrade';
import { equipmentDisplayName, parseEquipment } from './genericEquipment';
import { LOADOUT_SLOTS, slotLabel, type LoadoutSlot, type LoadoutState } from './loadout';
import { assessUpgradePlan, buildUpgradePlans, planBasis } from './upgradePlans';
import { rememberUpgradeCandidate, useUpgradeCandidatePool, writeCandidatePool } from './upgradePlanStore';
import { workflowPreferences } from './workflowPreferences';
import type { UpgradeCandidateInput } from './upgradeWorkflow';

export default function UpgradePlanPanel({ state, candidate, slot, data, trade, onSave, onPrice }: {
  state: LoadoutState; candidate?: UpgradeCandidateInput; slot: LoadoutSlot; data?: PatchData; trade?: GearTrade | null;
  onSave: (state: LoadoutState) => boolean; onPrice: (raw: string, intent?: 'price' | 'upgrade', slot?: LoadoutSlot) => void;
}) {
  const pool = useUpgradeCandidatePool(), [message, setMessage] = useState('');
  const basis = planBasis(state), stale = pool && pool.basis !== basis, current = pool && !stale ? pool : undefined;
  const plans = useMemo(() => current ? buildUpgradePlans(state, current, data, trade) : [], [state, current, data, trade]);
  const visible = plans.slice(0, 6), preferences = workflowPreferences(state);
  return <details className="lo-summary wf-plans"><summary>候选组合 · {current?.candidates.length ?? 0} 件 · {preferences.replacement === 'single' ? '单件' : '联动两件'}核对</summary>
    <p className="lo-footnote">市场候选送回比较时自动带入挂牌价；这里枚举已收藏的一件／两件组合，检查最终整套四抗和总购买成本。伤害方向分不等于 DPS，未重算的联动仍需 PoB 验证。</p>
    {stale && <p className="lo-footnote">角色装备、武器组或面板已更新，旧候选组合已失效；请重新检索。</p>}
    {candidate && <button type="button" className="wb-text-button" onClick={() => setMessage(rememberUpgradeCandidate(state, { id: `${candidate.quote?.id ?? candidate.id}:${slot}`, slot, raw: candidate.raw, quote: candidate.quote }))}>加入当前候选到组合</button>}
    {message && <p role="status" className="lo-footnote">{message}</p>}
    {!!current?.candidates.length && <div className="wf-pool">{current.candidates.map((entry) => <span key={entry.id}>{slotLabel(entry.slot)} · {equipmentDisplayName(parseEquipment(entry.raw)!)} <button type="button" className="wb-text-button" aria-label={`移除组合候选：${entry.id}`} onClick={() => setMessage(writeCandidatePool({ ...current, candidates: current.candidates.filter((other) => other.id !== entry.id) }))}>×</button></span>)}</div>}
    {!visible.length && <p className="lo-footnote">先检索两个不同部位，把候选送回比较。缺少报价的粘贴装备可记录，但不会当作零成本。</p>}
    {visible.map((plan) => <article key={plan.id} className="wf-plan"><strong>{plan.candidates.map((entry) => slotLabel(entry.slot)).join('＋')} · {plan.status === 'feasible' ? '四抗与预算通过 · 待 PoB' : plan.status === 'rejected' ? '不符合约束' : '资料待核对'}</strong>
      <p className="lo-footnote">购买价 {plan.total === undefined ? '待核对' : plan.total} {plan.currency === 'divine' ? '神圣石' : '崇高石'} · 增伤方向变化 {plan.directionDelta === undefined ? '未计算' : `${plan.directionDelta > 0 ? '+' : ''}${plan.directionDelta.toFixed(3)} 分`}</p>
      {plan.directionDelta !== undefined && plan.directionDelta <= 0 && <p className="lo-footnote">尚未发现已识别的伤害方向提升，保留为补抗备选。</p>}
      <div className="wf-resistances">{plan.gate?.rows.map((row) => <span key={row.key}>{row.label} {row.effectiveAfter ?? '未知'} / {row.minimum ?? '未知'}%</span>)}</div>
      {plan.reasons.map((reason) => <p key={reason} className="lo-footnote">{reason}</p>)}
      {plan.gate?.status === 'unmet' && <details><summary>下一件从哪里补抗</summary><p className="lo-footnote">缺口：{plan.gate.rows.filter((row) => row.met === false).map((row) => `${row.label} ${row.after === undefined || row.minimum === undefined ? '待核对' : Math.max(0, row.minimum - row.after)}%`).join('、')}。下面打开其他部位的词池检索，收藏候选后在此核对组合。</p><div className="lo-actions">{LOADOUT_SLOTS.filter((entry) => !['flask', 'charm', 'weapon', 'offhand'].includes(entry.kind) && !plan.candidates.some((candidate) => candidate.slot === entry.id) && state.slots[entry.id]).map((entry) => <button key={entry.id} type="button" className="wb-text-button" onClick={() => onPrice(state.slots[entry.id]!, 'upgrade', entry.id)}>从{entry.label}找补抗候选</button>)}</div></details>}
      <div className="lo-actions">{plan.candidates.map((entry) => <button key={entry.id} type="button" className="wb-text-button" onClick={() => onPrice(entry.raw, 'price', entry.slot)}>复核{slotLabel(entry.slot)}挂牌</button>)}
        <button type="button" className="wb-button" disabled={plan.status !== 'feasible' || (plan.directionDelta ?? 0) <= 0} onClick={() => {
          if (!current || current.basis !== planBasis(state)) { setMessage('角色资料已变化，请重新构建组合。'); return; }
          const latest = assessUpgradePlan(state, plan.candidates, data, trade);
          if (latest.status !== 'feasible' || (latest.directionDelta ?? 0) <= 0) { setMessage('组合约束或报价已变化，请重新核对。'); return; }
          if (onSave(latest.state)) { writeCandidatePool(); setMessage('已采用整套候选组合；请在 PoB2 重算并核对实际技能伤害。'); }
        }}>采用此组合</button></div>
    </article>)}
  </details>;
}
