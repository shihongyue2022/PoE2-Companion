import { useState } from 'react';
import type { EngineMod, ExistingItem, ItemModInput, TargetInput } from '../lib/engineTypes';
import type { CheckpointReview, CraftCheckpoint } from './craftCheckpoint';
import { translateBase, translateCurrency, translateModAtTier } from './localization';

export interface CraftCheckpointPanelProps {
  readonly item: ExistingItem;
  readonly baseName: string;
  readonly targets: readonly TargetInput[];
  readonly mods: ReadonlyMap<string, EngineMod>;
  readonly anchor: CraftCheckpoint | null;
  readonly review: CheckpointReview | null;
  readonly suggestedAction?: string;
  readonly onAnchor: (anchor: CraftCheckpoint | null) => void;
  readonly onCheckText: (raw: string) => void;
  readonly onRecalculate: () => void;
}

const targetKey = (target: TargetInput): string => `${target.modId}:${target.tierDisplay}:${target.slot ?? ''}`;
const copyItem = (item: ExistingItem): ExistingItem => ({
  ...item, prefixes: item.prefixes.map((entry) => ({ ...entry })), suffixes: item.suffixes.map((entry) => ({ ...entry })),
  ...(item.runes ? { runes: [...item.runes] } : {}),
});
const initialMode = (action?: string): CraftCheckpoint['mode'] => /Annul|剥离/i.test(action ?? '') ? 'remove'
  : /Exalt|崇高|Augment|增幅|Regal|富豪|Transmut|蜕变/i.test(action ?? '') ? 'add' : action ? 'goals' : 'remove';
const defaultAction: Readonly<Record<CraftCheckpoint['mode'], string>> = { remove: '剥离石', add: '崇高石', goals: '混沌石' };
const defaultPreserves = (item: ExistingItem, targets: readonly TargetInput[]): string[] => [
  ...new Set([...item.prefixes, ...item.suffixes].filter((entry) => entry.fractured
    || targets.some((target) => target.modId === entry.modId && entry.tierDisplay <= target.tierDisplay)).map((entry) => entry.modId)),
];

/** Called only when the player locks a step, never while rendering a draft. */
function checkpointIdentity(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `checkpoint-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** An explicit, local checkpoint. This component does not send input or currency actions to the game. */
export function CraftCheckpointPanel(props: CraftCheckpointPanelProps) {
  const [configuring, setConfiguring] = useState(false);
  const signature = props.anchor ? `anchor:${props.anchor.id}`
    : `draft:${JSON.stringify({ item: props.item, baseName: props.baseName, targets: props.targets })}`;
  // Replacing the item/goals starts a fresh draft; a different locked checkpoint also
  // gets its own paste field. Keep the explicit open/close intent outside that key so
  // "重新设定锚点" can clear the anchor and open its fresh form in the same click.
  return <CheckpointBody key={signature} {...props} configuring={configuring} setConfiguring={setConfiguring} />;
}

function CheckpointBody({
  item, baseName, targets, mods, anchor, review, suggestedAction, onAnchor, onCheckText, onRecalculate,
  configuring, setConfiguring,
}: CraftCheckpointPanelProps & { configuring: boolean; setConfiguring: (value: boolean) => void }) {
  const [mode, setMode] = useState<CraftCheckpoint['mode']>(initialMode(suggestedAction));
  const [action, setAction] = useState(suggestedAction ? translateCurrency(suggestedAction) : defaultAction.remove);
  const [removeIds, setRemoveIds] = useState<string[]>([]);
  const [preserveIds, setPreserveIds] = useState<string[]>(() => defaultPreserves(item, targets));
  const [targetKeys, setTargetKeys] = useState<string[]>(() => targets.map(targetKey));
  const [raw, setRaw] = useState('');

  const held = [...item.prefixes, ...item.suffixes];
  const nameOf = (entry: ItemModInput | TargetInput): string => {
    const mod = mods.get(entry.modId);
    return mod ? translateModAtTier(mod, entry.tierDisplay) : '未识别词缀';
  };
  const selectedTargets = targets.filter((target) => targetKeys.includes(targetKey(target)));
  const error = !action.trim() ? '请填写本次计划使用的通货。'
    : mode === 'remove' && !removeIds.length ? '请明确选择本步允许移除的词缀。'
    : mode !== 'remove' && !selectedTargets.length ? '请先选择本步必须达成的词缀目标。' : '';

  function resetDraft() {
    const nextMode = initialMode(suggestedAction);
    setMode(nextMode);
    setAction(suggestedAction ? translateCurrency(suggestedAction) : defaultAction[nextMode]);
    setRemoveIds([]);
    setPreserveIds(defaultPreserves(item, targets));
    setTargetKeys(targets.map(targetKey));
    setRaw('');
    setConfiguring(true);
  }

  function lock() {
    if (error) return;
    const fractureIds = held.filter((entry) => entry.fractured).map((entry) => entry.modId);
    onAnchor({
      id: checkpointIdentity(),
      createdAt: new Date().toISOString(), baseName, before: copyItem(item), action: action.trim(), mode,
      removeModIds: mode === 'remove' ? [...removeIds] : [],
      preserveModIds: [...new Set([...preserveIds, ...fractureIds])],
      targets: mode === 'remove' ? [] : selectedTargets.map((target) => ({ ...target })),
    });
    setConfiguring(false);
  }

  const frozenHeld = anchor ? [...anchor.before.prefixes, ...anchor.before.suffixes] : [];
  const canRecalculate = review !== null && review.status !== 'unresolved' && review.status !== 'mismatch';

  return <section className="wb-panel wb-checkpoint" aria-label="制作步骤校验">
    <div className="wb-section-head"><div><h3>制作锚点 · {anchor ? '本步已锁定' : '用通货后核对结果'}</h3></div>{!anchor && !configuring && <button className="wb-button" onClick={resetDraft}>设置制作锚点</button>}</div>
    {(anchor || configuring) && <p className="wb-fine">先锁定本步要改变和保留的词缀。在游戏中手动使用通货后，重新复制装备并粘贴校验；达标后再计算后续策略。</p>}

    {!anchor && configuring && <div className="wb-checkpoint-draft">
      <p className="wb-fine">当前快照：{translateBase(baseName)} · 物等 {item.level} · {held.length} 条词缀。锚点只核对词缀与阶层，不保证具体数值或品质。</p>
      <div className="wb-fields">
        <label>本步目标类型<select aria-label="本步目标类型" value={mode} onChange={(event) => {
          const next = event.target.value as CraftCheckpoint['mode'];
          setMode(next); setAction(defaultAction[next]);
        }}><option value="remove">移除一条指定词缀</option><option value="add">增加一条目标词缀</option><option value="goals">达成指定阶段目标</option></select></label>
        <label>计划使用的通货<input aria-label="计划使用的通货" value={action} onChange={(event) => setAction(event.target.value)} /></label>
      </div>

      {mode === 'remove' ? <fieldset className="wb-checkpoint-choices"><legend>本步允许移除的词缀（任选其一）</legend>
        {held.length ? held.map((entry) => <label className="wb-check" key={entry.modId}><input type="checkbox" aria-label={`允许移除：${nameOf(entry)}`} disabled={entry.fractured} checked={removeIds.includes(entry.modId)} onChange={(event) => {
          const checked = event.target.checked;
          setRemoveIds((old) => checked ? [...old, entry.modId] : old.filter((id) => id !== entry.modId));
          if (checked) setPreserveIds((old) => old.filter((id) => id !== entry.modId));
        }} /><span>{nameOf(entry)} · T{entry.tierDisplay}{entry.fractured ? '（破裂，不能移除）' : ''}</span></label>) : <p className="wb-fine">当前装备没有可移除的词缀。</p>}
      </fieldset> : <fieldset className="wb-checkpoint-choices"><legend>本步必须达成的目标</legend>
        {targets.length ? targets.map((target) => <label className="wb-check" key={targetKey(target)}><input type="checkbox" aria-label={`本步目标：${nameOf(target)}`} checked={targetKeys.includes(targetKey(target))} onChange={(event) => {
          const checked = event.target.checked;
          setTargetKeys((old) => checked ? [...old, targetKey(target)] : old.filter((key) => key !== targetKey(target)));
        }} /><span>{nameOf(target)} · T{target.tierDisplay} 或更好</span></label>) : <p className="wb-fine">请先在制作目标中添加所需词缀，再设置本步锚点。</p>}
        <p className="wb-fine">{mode === 'add' ? '只接受新增一条选定目标词缀，其余原有词缀不能改变。' : '用于混沌石、完美精华等单步替换；所有勾选目标须同时满足。'}</p>
      </fieldset>}

      <fieldset className="wb-checkpoint-choices"><legend>必须保留的现有词缀</legend>
        {held.length ? held.map((entry) => <label className="wb-check" key={entry.modId}><input type="checkbox" aria-label={`必须保留：${nameOf(entry)}`} checked={Boolean(entry.fractured) || preserveIds.includes(entry.modId)} disabled={entry.fractured} onChange={(event) => {
          const checked = event.target.checked;
          setPreserveIds((old) => checked ? [...old, entry.modId] : old.filter((id) => id !== entry.modId));
          if (checked) setRemoveIds((old) => old.filter((id) => id !== entry.modId));
        }} /><span>{nameOf(entry)} · T{entry.tierDisplay}{entry.fractured ? '（破裂，强制保留）' : ''}</span></label>) : <p className="wb-fine">当前没有已有词缀需要保护。</p>}
      </fieldset>
      {error && <p className="wb-fine">{error}</p>}
      <div className="wb-actions"><button className="wb-button primary" disabled={Boolean(error)} onClick={lock}>锁定本步目标</button><button className="wb-text-button" onClick={() => setConfiguring(false)}>取消设置</button></div>
    </div>}

    {anchor && <div className="wb-checkpoint-locked">
      <div className="wb-section-head"><h3>本步锚点已锁定</h3><button className="wb-text-button" onClick={() => { onAnchor(null); resetDraft(); }}>重新设定锚点</button></div>
      <p><strong>{translateCurrency(anchor.action)}</strong> · {translateBase(anchor.baseName)} · 物等 {anchor.before.level}</p>
      <p className="wb-fine">{anchor.mode === 'remove' ? '本步允许移除以下任一词缀：' : anchor.mode === 'add' ? '本步新增词缀须命中选定目标，且满足全部条件：' : '本步必须同时达成以下目标：'}</p>
      <ul>{anchor.mode === 'remove' ? frozenHeld.filter((entry) => anchor.removeModIds.includes(entry.modId)).map((entry) => <li key={entry.modId}>{nameOf(entry)} · T{entry.tierDisplay}</li>)
        : anchor.targets.map((target) => <li key={targetKey(target)}>{nameOf(target)} · T{target.tierDisplay} 或更好</li>)}</ul>
      {frozenHeld.some((entry) => entry.fractured || anchor.preserveModIds.includes(entry.modId)) && <><p className="wb-fine">必须保留：</p><ul>{frozenHeld.filter((entry) => entry.fractured || anchor.preserveModIds.includes(entry.modId)).map((entry) => <li key={entry.modId}>{nameOf(entry)} · T{entry.tierDisplay}{entry.fractured ? '（破裂锁定）' : ''}</li>)}</ul></>}
      <label className="wb-checkpoint-paste">操作后装备文本<textarea aria-label="操作后装备文本" value={raw} onChange={(event) => setRaw(event.target.value)} rows={6} placeholder="在游戏中执行本步后，重新复制装备完整文本并粘贴到这里。" /></label>
      <div className="wb-actions"><button className="wb-button primary" disabled={!raw.trim()} onClick={() => onCheckText(raw)}>校验本步结果</button></div>
      {review && <div className={`wb-checkpoint-review ${review.status === 'met' ? 'positive' : 'wb-inline-warning'}`} data-status={review.status} role="status"><strong>{review.title}</strong>{review.details.map((detail, index) => <p key={index}>{detail}</p>)}</div>}
      {review && <><p className="wb-fine">{review.status === 'met' ? '本步条件已达成。重新计算策略后，再决定下一步操作。'
        : review.status === 'missed' ? '本步未达标；请按真实结果重新计算修复策略，不能直接沿用原来的下一步。'
        : review.status === 'unchanged' ? '尚未确认本步发生变化；可以重算当前状态，但这不代表本步已完成。'
        : '请先解决文本识别或装备不匹配的问题，再重新计算。'}</p><button className="wb-button" disabled={!canRecalculate} onClick={onRecalculate}>重新计算后续策略</button></>}
    </div>}
  </section>;
}

export default CraftCheckpointPanel;
