import { equipmentMetricDetails, parseEquipment, simplifyEquipmentText, type Equipment } from './genericEquipment';
import { projectCharacterResistances, validCharacterPanel, type CharacterPanelSnapshot } from './characterPanel';
import { readPobSource, type PobSource, type PreviousLoadout } from './loadoutSource';
import { readLoadoutQuotes, type LoadoutQuotes } from './loadoutQuotes';
import { readBuildProfile, type BuildProfile } from './buildProfile';
import { buildCandidateWarnings, buildConditionWarnings } from './buildAdvice';
import { compareDeferredEffects, type EffectComparisonRow } from './effectComparison';
import { assessDamageGoal, damageGoalRows, usesDamageGoal, type DamageGoalAssessment } from './damageGoal';
import { equipmentTradeRows } from './genericEquipmentTrade';
import type { EquipmentTradeRow } from './genericEquipmentTrade';
import { readMainSkillSelection, type MainSkillSelection } from './skillRecommendation';
import { readSkillRoutine } from './skillRoutine';
import { readWorkflow, type WorkflowPreferences } from './workflowPreferences';
import { knownFilledSockets, recordSocketEvidence, type SocketEvidence, type ResistanceContext } from './resistanceModel';
import { readWeaponPair, syncWeaponSets } from './weaponSets';

export const LOADOUT_STORAGE_KEY = 'poe2-workbench-loadout-v1';

export const LOADOUT_SLOTS = [
  { id: 'mainHand', label: '主手', kind: 'weapon' },
  { id: 'offHand', label: '副手', kind: 'offhand' },
  { id: 'helmet', label: '头盔', kind: 'helmet' },
  { id: 'body', label: '胸甲', kind: 'body' },
  { id: 'gloves', label: '手套', kind: 'gloves' },
  { id: 'boots', label: '鞋靴', kind: 'boots' },
  { id: 'belt', label: '腰带', kind: 'belt' },
  { id: 'amulet', label: '项链', kind: 'amulet' },
  { id: 'ring1', label: '左戒指', kind: 'ring' },
  { id: 'ring2', label: '右戒指', kind: 'ring' },
  { id: 'flask1', label: '药剂 1', kind: 'flask' },
  { id: 'flask2', label: '药剂 2', kind: 'flask' },
  { id: 'charm1', label: '护符 1', kind: 'charm' },
  { id: 'charm2', label: '护符 2', kind: 'charm' },
  { id: 'charm3', label: '护符 3', kind: 'charm' },
] as const;
export type LoadoutSlot = typeof LOADOUT_SLOTS[number]['id'];

export const METRICS = [
  { key: 'life', label: '最大生命', unit: '' },
  { key: 'mana', label: '最大魔力', unit: '' },
  { key: 'spirit', label: '精魂', unit: '' },
  { key: 'fireResistance', label: '火焰抗性', unit: '%' },
  { key: 'coldResistance', label: '冰霜抗性', unit: '%' },
  { key: 'lightningResistance', label: '闪电抗性', unit: '%' },
  { key: 'chaosResistance', label: '混沌抗性', unit: '%' },
  { key: 'strength', label: '力量', unit: '' },
  { key: 'dexterity', label: '敏捷', unit: '' },
  { key: 'intelligence', label: '智慧', unit: '' },
  { key: 'movementSpeed', label: '移动速度', unit: '%' },
  { key: 'armour', label: '护甲', unit: '' },
  { key: 'evasion', label: '闪避', unit: '' },
  { key: 'energyShield', label: '能量护盾', unit: '' },
  { key: 'lifeRegeneration', label: '每秒生命回复（固定值）', unit: '' },
  { key: 'globalArmourPercent', label: '全域护甲增加', unit: '%' },
  { key: 'globalEvasionPercent', label: '全域闪避增加', unit: '%' },
  { key: 'globalEnergyShieldPercent', label: '全域能量护盾增加', unit: '%' },
  { key: 'lifePercent', label: '最大生命增加', unit: '%' },
  { key: 'manaPercent', label: '最大魔力增加', unit: '%' },
  { key: 'physicalDps', label: '武器物理 DPS', unit: '' },
  { key: 'elementalDps', label: '武器元素 DPS', unit: '' },
  { key: 'totalDps', label: '武器总攻击 DPS', unit: '' },
] as const;
export type MetricKey = typeof METRICS[number]['key'];
export const RESISTANCE_KEYS = ['fireResistance', 'coldResistance', 'lightningResistance', 'chaosResistance'] as const;
export type ResistanceKey = typeof RESISTANCE_KEYS[number];
export const DEFAULT_PRIORITIES: MetricKey[] = ['life', 'fireResistance', 'coldResistance', 'lightningResistance'];

export interface LoadoutGoals {
  resistanceCaps?: Partial<Record<ResistanceKey, number>>;
  objective?: 'capped-damage' | 'balanced';
  priorities: MetricKey[];
  minimums: Partial<Record<ResistanceKey, number>>;
  build?: BuildProfile;
  mainSkill?: MainSkillSelection;
  skillBar?: MainSkillSelection[];
  workflow?: WorkflowPreferences;
}
export interface LoadoutState {
  lastImport?: { at: string; equipmentChanges: number; formatOnly: number; newlyRead: number; informationChanges: number };
  weaponSets?: import('./weaponSets').WeaponSets;
  socketEvidence?: SocketEvidence[];
  version: 1;
  slots: Partial<Record<LoadoutSlot, string>>;
  goals: LoadoutGoals;
  character?: CharacterPanelSnapshot;
  source?: PobSource;
  previous?: PreviousLoadout;
  quotes?: LoadoutQuotes;
}
export function emptyLoadout(): LoadoutState {
  return { version: 1, slots: {}, goals: { objective: 'capped-damage', priorities: [...DEFAULT_PRIORITIES], minimums: {} } };
}
export function slotLabel(slot: LoadoutSlot): string {
  return LOADOUT_SLOTS.find((entry) => entry.id === slot)?.label ?? slot;
}
export function isLoadoutSlot(value: string): value is LoadoutSlot {
  return LOADOUT_SLOTS.some((slot) => slot.id === value);
}
export function isMetricKey(value: string): value is MetricKey {
  return METRICS.some((metric) => metric.key === value);
}
export function isBow(item: Equipment): boolean { return item.category === 'weapon.bow'; }
export function isQuiver(item: Equipment): boolean { return item.category === 'armour.quiver'; }

/** Empty paired slots are allowed while assembling a set. Existing gear is never silently removed. */
export function equipmentSlotError(slot: LoadoutSlot, item: Equipment, state: LoadoutState): string | null {
  const descriptor = LOADOUT_SLOTS.find((entry) => entry.id === slot)!;
  const kindMatches = slot === 'offHand'
    ? item.slot === 'offhand' || (item.slot === 'weapon' && !item.twoHanded)
    : descriptor.kind === item.slot;
  if (!kindMatches) {
    if (slot === 'offHand' && item.twoHanded) return '双手武器须放入主手；不会自动清空现有装备。';
    const possible = LOADOUT_SLOTS.filter((entry) => entry.kind === item.slot).map((entry) => entry.label);
    return `这件装备不能放入${descriptor.label}。${possible.length ? `可用栏位：${possible.join('、')}。` : '该物品类型暂无可用穿戴栏位。'}`;
  }
  if (slot !== 'mainHand' && slot !== 'offHand') return null;
  const main = slot === 'mainHand' ? item : parseEquipment(state.slots.mainHand ?? '');
  const off = slot === 'offHand' ? item : parseEquipment(state.slots.offHand ?? '');
  if (!main || !off) return null;
  if (isBow(main)) return isQuiver(off) ? null : '弓的副手栏只能记录箭袋；请先移除当前副手或改用箭袋。';
  if (main.twoHanded) return '主手是双手武器，与当前副手冲突。请先移除其中一件；特殊天赋例外未建模。';
  if (isQuiver(off)) return '箭袋需要主手为弓，当前主副手组合不匹配。';
  return null;
}
export type EquipResult = { ok: true; state: LoadoutState; item: Equipment } | { ok: false; error: string };
export function equipRaw(state: LoadoutState, slot: LoadoutSlot, raw: string, context: ResistanceContext = {}): EquipResult {
  if (raw.trim().length > 100_000) return { ok: false, error: '单件装备文本过长，请粘贴游戏内复制的单件物品。' };
  const item = parseEquipment(raw);
  if (!item) return { ok: false, error: '没有读到装备。请在游戏内复制完整物品文字，包含物品类别与稀有度。' };
  const error = equipmentSlotError(slot, item, state);
  if (error) return { ok: false, error };
  const evidence = recordSocketEvidence(state, parseEquipment(state.slots[slot] ?? ''), item, context);
  return { ok: true, state: syncWeaponSets({ ...state, ...(evidence ? { socketEvidence: evidence } : {}), slots: { ...state.slots, [slot]: raw.trim() } }), item };
}
export function removeSlot(state: LoadoutState, slot: LoadoutSlot): LoadoutState {
  const slots = { ...state.slots };
  delete slots[slot];
  return syncWeaponSets({ ...state, slots });
}
export function loadoutWarnings(state: LoadoutState): string[] {
  const warnings: string[] = [];
  warnings.push(...buildConditionWarnings(state.goals.build, state.slots));
  const main = parseEquipment(state.slots.mainHand ?? '');
  const off = parseEquipment(state.slots.offHand ?? '');
  if (off && !main) warnings.push('尚无主手，无法核对副手搭配。箭袋需要弓；双持限制与天赋例外请在游戏内核对。');
  if (off && main) {
    const conflict = equipmentSlotError('offHand', off, state);
    if (conflict) warnings.push(conflict);
    else if (off.slot === 'weapon') warnings.push('已记录双持武器；武器组合限制、双持攻速与角色技能伤害未计算。');
  }
  for (const entry of LOADOUT_SLOTS) {
    const raw = state.slots[entry.id];
    if (!raw) continue;
    const item = parseEquipment(raw);
    if (!item) warnings.push(`${entry.label}：装备文本无法识别，请重新导入。`);
    else if (!item.identified) warnings.push(`${entry.label}：未鉴定，仅记录物品；未知词缀不计入汇总。`);
  }
  return warnings;
}

/** Item contributions only; increased-percent bonuses remain separate metrics, never final sheet totals. */
export function loadoutTotals(state: LoadoutState): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const raw of Object.values(state.slots)) {
    const item = parseEquipment(raw);
    if (!item || !item.identified || item.slot === 'flask' || item.slot === 'charm') continue;
    const { values } = equipmentMetricDetails(item);
    for (const metric of METRICS) {
      if (metric.key.endsWith('Dps')) continue;
      const value = values[metric.key];
      if (value !== undefined && Number.isFinite(value)) totals[metric.key] = (totals[metric.key] ?? 0) + value;
    }
  }
  return totals;
}

export interface MetricDelta {
  key: MetricKey; label: string; unit: string; before: number; after: number; delta: number; priority: boolean;
  beforeUnknown?: boolean; afterUnknown?: boolean;
  relativeDelta?: number;
}
export interface ResistanceTarget {
  key: ResistanceKey; label: string; minimum: number; before: number; after: number; met: boolean;
}
export type ComparisonStatus = 'upgrade' | 'downgrade' | 'tradeoff' | 'equal' | 'insufficient';
export interface EquipmentComparison {
  characterResistances: ReturnType<typeof projectCharacterResistances>;
  status: ComparisonStatus;
  title: string;
  reason: string;
  priorityDirection: string;
  metrics: MetricDelta[];
  uncountedBefore: string[];
  uncountedAfter: string[];
  targets: ResistanceTarget[];
  warnings: string[];
  canEquip: boolean;
  identical: boolean;
  sameItemText: boolean;
  notesBefore: string[]; notesAfter: string[];
  effects: EffectComparisonRow[];
  paperStatus: ComparisonStatus;
  damageGoal?: DamageGoalAssessment;
}
const round = (value: number) => Math.round(value * 100) / 100;

export function compareCandidate(state: LoadoutState, slot: LoadoutSlot, candidate: Equipment,
  context: { beforeFilledSockets?: number; afterFilledSockets?: number; damageRows?: readonly EquipmentTradeRow[] } = {}): EquipmentComparison {
  const current = parseEquipment(state.slots[slot] ?? '');
  const conflict = equipmentSlotError(slot, candidate, state);
  const oldDetails: ReturnType<typeof equipmentMetricDetails> = current ? equipmentMetricDetails(current, { filledSockets: knownFilledSockets(state, current, context.beforeFilledSockets) }) : { values: {}, uncounted: [], pending: [], explanations: [], effects: [] };
  const newDetails = equipmentMetricDetails(candidate, { filledSockets: knownFilledSockets(state, candidate, context.afterFilledSockets) });
  const metrics = METRICS.map((metric) => ({ ...metric,
    before: round(oldDetails.values[metric.key] ?? 0), after: round(newDetails.values[metric.key] ?? 0),
    delta: round((newDetails.values[metric.key] ?? 0) - (oldDetails.values[metric.key] ?? 0)),
    relativeDelta: oldDetails.values[metric.key] ? round(((newDetails.values[metric.key] ?? 0) / oldDetails.values[metric.key]! - 1) * 100) : undefined,
    priority: state.goals.priorities.includes(metric.key),
    beforeUnknown: oldDetails.pending.includes(metric.key), afterUnknown: newDetails.pending.includes(metric.key),
  })).filter((metric) => metric.before !== 0 || metric.after !== 0 || metric.beforeUnknown || metric.afterUnknown);
  const characterResistances = projectCharacterResistances(state, slot, candidate, context);
  const changed = metrics.map((metric) => {
    const projected = characterResistances.find((resistance) => resistance.key === metric.key);
    return projected ? { ...metric, delta: projected.effectiveDelta } : metric;
  }).filter((metric) => !metric.beforeUnknown && !metric.afterUnknown && metric.delta !== 0);
  const priorityChanges = changed.filter((metric) => metric.priority);
  const positive = changed.some((metric) => metric.delta > 0);
  const negative = changed.some((metric) => metric.delta < 0);
  const priorityPositive = priorityChanges.some((metric) => metric.delta > 0);
  const priorityNegative = priorityChanges.some((metric) => metric.delta < 0);
  const priorityDirection = metrics.some((metric) => metric.priority && (metric.beforeUnknown || metric.afterUnknown)) ? '优先属性待确认插槽'
    : !state.goals.priorities.length ? '未选择优先属性'
    : !metrics.some((metric) => metric.priority) ? '本栏未涉及已设优先属性'
    : priorityPositive && priorityNegative ? '优先属性互有升降' : priorityPositive ? '优先属性提升'
      : priorityNegative ? '优先属性下降' : '优先属性持平';
  const warnings: string[] = [];
  if ([...oldDetails.pending, ...newDetails.pending].some((key) => !key.endsWith('Dps'))) warnings.push('每插槽效果需要确认实际镶嵌数量；待确认属性未按零收益比较。插槽 S 只表示孔位。');
  if ([...oldDetails.pending, ...newDetails.pending].some((key) => key.endsWith('Dps'))) warnings.push('武器伤害或攻速面板不完整；若已读到附加元素伤害词缀但缺少物品元素伤害面板，元素与总攻击 DPS 保留待确认。已具备完整数据的部分仍可比较，请复制完整游戏物品文字补齐缺项。');
  if (metrics.some((metric) => metric.key.startsWith('global') && (metric.before || metric.after || metric.beforeUnknown || metric.afterUnknown))) warnings.push('全域防御增加与其他 increased 加成相加，未直接乘到装备防御或角色面板；实际收益取决于天赋、技能及其他装备。');
  if (characterResistances.length) warnings.push('角色抗性按已录入的未封顶总值与装备差值估算，其他天赋、技能及条件保持不变；生命和防御仍只比较装备贡献。');
  warnings.push(...buildCandidateWarnings(state, slot, candidate));
  if (state.character && !validCharacterPanel(state)) warnings.push('装备已变化，生命与防御旧面板需更新；可核对的抗性按原角色基准与整套累计差值推算。天赋或状态改变时请更新 PoB2／游戏基准。');
  if (conflict) warnings.push(conflict);
  if (!current) warnings.push('当前栏位为空，没有旧装备可比较。');
  if (!candidate.identified || (current && !current.identified)) warnings.push('含未鉴定装备，未知词缀不能按零属性比较。');
  const effects = compareDeferredEffects(current, candidate, oldDetails.uncounted, newDetails.uncounted);
  const changedEffects = effects.some((effect) => effect.changed);
  if (changedEffects) warnings.push('下方已逐项列出技能与特殊词缀的变化；物品面板差值有效，整体流派收益还需结合这些变化判断。');
  const parserWarnings = [...(current?.warnings ?? []), ...candidate.warnings];
  warnings.push(...new Set(parserWarnings));
  const comparableText = (raw: string) => simplifyEquipmentText(raw).replace(/\r/g, '').split('\n').map((line) => line.trim()).filter((line) => line && !/^(?:Note|备注|备註)[:：]/i.test(line)).join('\n');
  const sameItemText = !!current && current.identified && candidate.identified && !conflict && comparableText(current.raw) === comparableText(candidate.raw);
  const identical = sameItemText
    && (context.beforeFilledSockets ?? current.sockets?.filled) === (context.afterFilledSockets ?? candidate.sockets?.filled);
  if (sameItemText && !identical) warnings.push('两件的物品文字相同，差异仅来自本次镶嵌数量设置。请先核对或补齐现有装备，不必据此购买另一件。');
  const blockingWarnings = parserWarnings.filter((warning) => !/^\d+ 项效果已识别，但无独立交易条件/.test(warning));
  const insufficient = !current || !candidate.identified || !current.identified || !!conflict || changedEffects || blockingWarnings.length > 0 || oldDetails.pending.length > 0 || newDetails.pending.length > 0
    || !!state.character && !validCharacterPanel(state) && !characterResistances.length;
  const paperStatus: ComparisonStatus = !current || !candidate.identified || !current.identified || !!conflict || !metrics.some((metric) => !metric.beforeUnknown && !metric.afterUnknown) ? 'insufficient'
    : positive && negative ? 'tradeoff' : positive ? 'upgrade' : negative ? 'downgrade' : 'equal';
  let status: ComparisonStatus = insufficient ? 'insufficient' : paperStatus;
  if (identical && !conflict) status = 'equal';
  const beforeTotals = loadoutTotals(state);
  const targets = RESISTANCE_KEYS.flatMap((key): ResistanceTarget[] => {
    const minimum = state.goals.minimums[key];
    if (minimum === undefined || oldDetails.pending.includes(key) || newDetails.pending.includes(key)) return [];
    const before = characterResistances.find((resistance) => resistance.key === key)?.before ?? beforeTotals[key] ?? 0;
    const after = round(before - (oldDetails.values[key] ?? 0) + (newDetails.values[key] ?? 0));
    return [{ key, label: METRICS.find((metric) => metric.key === key)!.label, minimum, before, after, met: after >= minimum }];
  });
  if (status === 'upgrade' && targets.some((target) => target.before >= target.minimum && !target.met)) status = 'tradeoff';
  const titles: Record<ComparisonStatus, string> = {
    upgrade: '已比较属性提升', downgrade: '已比较属性下降', tradeoff: '有取舍', equal: '已比较属性持平', insufficient: '信息不足，暂不能判定升级',
  };
  const reasons: Record<ComparisonStatus, string> = {
    upgrade: '列出的纸面属性至少一项增加，其他已比较属性没有下降。',
    downgrade: '列出的纸面属性至少一项减少，其他已比较属性没有增加。',
    tradeoff: '部分属性增加、部分属性下降，请结合优先属性与抗性目标选择。',
    equal: '本次能够加总的纸面属性没有变化；这不代表两件装备的实战表现相同。',
    insufficient: '下方仍显示能够读到的差值；补齐或核对提示后，再判断这件装备是否适合角色。',
  };
  if (characterResistances.length && status !== 'insufficient') {
    reasons[status] = status === 'equal'
      ? '已比较的装备贡献与封顶后的有效抗性未发生收益变化；抗性溢出的变化仍在下方列出。'
      : '按非抗性装备贡献与封顶后的有效抗性判断，溢出抗性不重复视为当前收益；生命与防御差值不代表角色最终变化。';
  }
  const partial = status === 'insufficient' && paperStatus !== 'insufficient';
  const partialTitles = { upgrade: '物品面板提升，整体收益待确认', downgrade: '物品面板下降，特殊效果需权衡', tradeoff: '物品面板有取舍，特殊效果待确认', equal: '物品面板持平，需比较特殊效果', insufficient: titles.insufficient };
  const damageGoal = usesDamageGoal(state) && current && !conflict ? assessDamageGoal(state, slot, candidate, context.damageRows ?? damageGoalRows(equipmentTradeRows(current, 'upgrade'), current, state), context) : undefined;
  return { status, paperStatus, damageGoal, effects, identical, sameItemText, notesBefore: oldDetails.explanations, notesAfter: newDetails.explanations,
    title: identical ? '装备文本相同，未发现升级差异' : partial ? partialTitles[paperStatus] : titles[status],
    reason: identical ? '当前与候选的复制文本及镶嵌比较条件相同，无需重复替换。未确认插槽和未建模效果仍需核对。'
      : partial ? '已确认的属性变化见下表；技能、未识别效果或待确认属性单独列出，不抵消已经算出的面板结论。该结论不等同于角色最终伤害或生存收益。' : reasons[status], priorityDirection, metrics, characterResistances,
    uncountedBefore: oldDetails.uncounted, uncountedAfter: newDetails.uncounted, targets, warnings, canEquip: !conflict };
}

export function serializeLoadout(state: LoadoutState): string { return JSON.stringify(syncWeaponSets(state), null, 2); }
export function deserializeLoadout(text: string): { state: LoadoutState | null; error: string } {
  const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  if (text.length > 1_500_000) return { state: null, error: '装备方案文件过大。' };
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { state: null, error: '不是有效的 JSON 装备方案。' }; }
  if (!value || typeof value !== 'object') return { state: null, error: '装备方案结构不正确。' };
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || !data.slots || typeof data.slots !== 'object' || Array.isArray(data.slots)) return { state: null, error: '仅支持 version: 1 的全身装备方案。' };
  let state = emptyLoadout();
  const entries = Object.entries(data.slots);
  if (entries.some(([key, raw]) => !isLoadoutSlot(key) || typeof raw !== 'string')) return { state: null, error: '方案包含未知栏位或无效装备文本。' };
  // Main hand first so the same compatibility rules apply regardless of JSON property order.
  entries.sort(([a], [b]) => a === 'mainHand' ? -1 : b === 'mainHand' ? 1 : 0);
  for (const [key, raw] of entries) {
    if (!isLoadoutSlot(key) || typeof raw !== 'string' || !raw.trim()) continue;
    const result = equipRaw(state, key, raw);
    if (!result.ok) return { state: null, error: `${slotLabel(key)}：${result.error}` };
    state = result.state;
  }
  if (data.weaponSets !== undefined) {
    const sets = data.weaponSets;
    if (!record(sets) || sets.active !== 1 && sets.active !== 2) return { state: null, error: '武器组记录无效。' };
    const first = readWeaponPair(sets.first), second = readWeaponPair(sets.second);
    if (!first || !second) return { state: null, error: '武器组包含无效的主副手组合。' };
    state = syncWeaponSets({ ...state, weaponSets: { active: sets.active, first, second } });
    if (record(sets.caps)) {
      const caps: NonNullable<NonNullable<LoadoutState['weaponSets']>['caps']> = {};
      for (const side of ['first', 'second'] as const) if (record(sets.caps[side])) {
        const values = sets.caps[side];
        caps[side] = {};
        for (const key of RESISTANCE_KEYS) {
          const value = values[key]; if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100) caps[side][key] = value;
        }
      }
      state.weaponSets = { ...state.weaponSets!, caps };
    }
  }
  if (data.goals && typeof data.goals === 'object') {
    const goals = data.goals as Record<string, unknown>;
    if (record(goals.resistanceCaps)) {
      const caps: Partial<Record<ResistanceKey, number>> = {};
      for (const key of RESISTANCE_KEYS) { const cap = goals.resistanceCaps[key]; if (typeof cap === 'number' && Number.isFinite(cap) && cap >= 0 && cap <= 100) caps[key] = cap; }
      state.goals.resistanceCaps = caps;
    }
    state.goals.mainSkill = readMainSkillSelection(goals.mainSkill);
    const routine = readSkillRoutine(goals.skillBar);
    if (routine !== undefined) state.goals.skillBar = routine;
    const workflow = readWorkflow(goals.workflow); if (workflow) state.goals.workflow = workflow;
    if (goals.objective === 'balanced' || goals.objective === 'capped-damage') state.goals.objective = goals.objective;
    const build = readBuildProfile(goals.build); if (build) state.goals.build = build;
    if (Array.isArray(goals.priorities)) state.goals.priorities = [...new Set(goals.priorities.filter((key): key is MetricKey => typeof key === 'string' && isMetricKey(key)))];
    if (goals.minimums && typeof goals.minimums === 'object') {
      const minimums = goals.minimums as Record<string, unknown>;
      for (const key of RESISTANCE_KEYS) {
        const minimum = minimums[key];
        if (typeof minimum === 'number' && Number.isFinite(minimum) && minimum >= -200 && minimum <= 1000) state.goals.minimums[key] = minimum;
      }
    }
  }
  if (data.character !== undefined) {
    const panel = data.character;
    if (!record(panel) || typeof panel.equipmentSignature !== 'string' || panel.equipmentSignature.length > 1_000_000
      || typeof panel.recordedAt !== 'string' || !record(panel.values) || !record(panel.caps)) {
      return { state: null, error: '角色面板基准无效。' };
    }
    const values: CharacterPanelSnapshot['values'] = {}, caps: CharacterPanelSnapshot['caps'] = {}, itemValues: CharacterPanelSnapshot['values'] = {};
    for (const metric of METRICS) {
      const value = panel.values[metric.key];
      if (typeof value === 'number' && Number.isFinite(value) && value >= -200 && value <= 1e9) values[metric.key] = value;
      const itemValue = record(panel.itemValues) ? panel.itemValues[metric.key] : undefined;
      if (typeof itemValue === 'number' && Number.isFinite(itemValue) && itemValue >= 0 && itemValue <= 1e9) itemValues[metric.key] = itemValue;
    }
    for (const key of RESISTANCE_KEYS) {
      const cap = panel.caps[key];
      if (typeof cap === 'number' && Number.isFinite(cap) && cap >= 0 && cap <= 100) caps[key] = cap;
    }
    state.character = { values, caps, itemValues, equipmentSignature: panel.equipmentSignature, recordedAt: panel.recordedAt,
      ...(panel.weaponSet === 1 || panel.weaponSet === 2 ? { weaponSet: panel.weaponSet } : {}) };
  }
  state.source = readPobSource(data.source);
  const lastImport = data.lastImport;
  if (record(lastImport) && typeof lastImport.at === 'string' && Number.isFinite(Date.parse(lastImport.at))
    && ['equipmentChanges', 'formatOnly', 'newlyRead', 'informationChanges'].every((key) => typeof lastImport[key] === 'number' && Number.isInteger(lastImport[key]) && lastImport[key] >= 0 && lastImport[key] <= 50)) {
    state.lastImport = { at: lastImport.at, equipmentChanges: lastImport.equipmentChanges as number, formatOnly: lastImport.formatOnly as number,
      newlyRead: lastImport.newlyRead as number, informationChanges: lastImport.informationChanges as number };
  }
  if (Array.isArray(data.socketEvidence)) state.socketEvidence = data.socketEvidence.slice(0, 50).flatMap((entry) => {
    if (!record(entry) || typeof entry.itemText !== 'string' || entry.itemText.length > 100_000 || typeof entry.filled !== 'number') return [];
    const item = parseEquipment(entry.itemText);
    return item && knownFilledSockets({ ...state, socketEvidence: undefined }, item, entry.filled) !== undefined ? [{ itemText: entry.itemText, filled: entry.filled, ...(entry.assumed === true ? { assumed: true } : {}) }] : [];
  });
  const quotes = readLoadoutQuotes(data.quotes, state.slots);
  if (Object.keys(quotes).length) state.quotes = quotes;
  if (record(data.previous) && typeof data.previous.replacedAt === 'string' && Number.isFinite(Date.parse(data.previous.replacedAt))) {
    const previous = deserializeLoadout(JSON.stringify({ version: 1, slots: data.previous.slots, weaponSets: data.previous.weaponSets }));
    if (previous.state) state.previous = { slots: previous.state.slots, weaponSets: previous.state.weaponSets, source: readPobSource(data.previous.source), replacedAt: data.previous.replacedAt };
    if (state.previous && record(data.previous.after)) {
      const after = deserializeLoadout(JSON.stringify({ version: 1, slots: data.previous.after.slots, weaponSets: data.previous.after.weaponSets }));
      if (after.state) state.previous.after = { slots: after.state.slots, weaponSets: after.state.weaponSets };
    }
  }
  return { state, error: '' };
}
