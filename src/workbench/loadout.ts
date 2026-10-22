import { equipmentMetricDetails, parseEquipment, type Equipment } from './genericEquipment';

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
  { key: 'physicalDps', label: '武器物理 DPS', unit: '' },
  { key: 'elementalDps', label: '武器元素 DPS', unit: '' },
  { key: 'totalDps', label: '武器总攻击 DPS', unit: '' },
] as const;
export type MetricKey = typeof METRICS[number]['key'];
export const RESISTANCE_KEYS = ['fireResistance', 'coldResistance', 'lightningResistance', 'chaosResistance'] as const;
export type ResistanceKey = typeof RESISTANCE_KEYS[number];
export const DEFAULT_PRIORITIES: MetricKey[] = ['life', 'fireResistance', 'coldResistance', 'lightningResistance'];

export interface LoadoutGoals {
  priorities: MetricKey[];
  minimums: Partial<Record<ResistanceKey, number>>;
}
export interface LoadoutState {
  version: 1;
  slots: Partial<Record<LoadoutSlot, string>>;
  goals: LoadoutGoals;
}
export function emptyLoadout(): LoadoutState {
  return { version: 1, slots: {}, goals: { priorities: [...DEFAULT_PRIORITIES], minimums: {} } };
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
export function equipRaw(state: LoadoutState, slot: LoadoutSlot, raw: string): EquipResult {
  if (raw.trim().length > 100_000) return { ok: false, error: '单件装备文本过长，请粘贴游戏内复制的单件物品。' };
  const item = parseEquipment(raw);
  if (!item) return { ok: false, error: '没有读到装备。请在游戏内复制完整物品文字，包含物品类别与稀有度。' };
  const error = equipmentSlotError(slot, item, state);
  if (error) return { ok: false, error };
  return { ok: true, state: { ...state, slots: { ...state.slots, [slot]: raw.trim() } }, item };
}
export function removeSlot(state: LoadoutState, slot: LoadoutSlot): LoadoutState {
  const slots = { ...state.slots };
  delete slots[slot];
  return { ...state, slots };
}
export function loadoutWarnings(state: LoadoutState): string[] {
  const warnings: string[] = [];
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

/** Weapon DPS, recovery, conditional modifiers and increased-percent modifiers are not set-wide sums. */
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
}
export interface ResistanceTarget {
  key: ResistanceKey; label: string; minimum: number; before: number; after: number; met: boolean;
}
export type ComparisonStatus = 'upgrade' | 'downgrade' | 'tradeoff' | 'equal' | 'insufficient';
export interface EquipmentComparison {
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
}
const round = (value: number) => Math.round(value * 100) / 100;
const sameLines = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

export function compareCandidate(state: LoadoutState, slot: LoadoutSlot, candidate: Equipment): EquipmentComparison {
  const current = parseEquipment(state.slots[slot] ?? '');
  const conflict = equipmentSlotError(slot, candidate, state);
  const oldDetails = current ? equipmentMetricDetails(current) : { values: {}, uncounted: [] };
  const newDetails = equipmentMetricDetails(candidate);
  const metrics = METRICS.map((metric) => ({ ...metric,
    before: round(oldDetails.values[metric.key] ?? 0), after: round(newDetails.values[metric.key] ?? 0),
    delta: round((newDetails.values[metric.key] ?? 0) - (oldDetails.values[metric.key] ?? 0)),
    priority: state.goals.priorities.includes(metric.key),
  })).filter((metric) => metric.before !== 0 || metric.after !== 0 || metric.priority);
  const changed = metrics.filter((metric) => metric.delta !== 0);
  const priorityChanges = changed.filter((metric) => metric.priority);
  const positive = changed.some((metric) => metric.delta > 0);
  const negative = changed.some((metric) => metric.delta < 0);
  const priorityPositive = priorityChanges.some((metric) => metric.delta > 0);
  const priorityNegative = priorityChanges.some((metric) => metric.delta < 0);
  const priorityDirection = !state.goals.priorities.length ? '未选择优先属性'
    : priorityPositive && priorityNegative ? '优先属性互有升降' : priorityPositive ? '优先属性提升'
      : priorityNegative ? '优先属性下降' : '优先属性持平';
  const warnings: string[] = [];
  if (conflict) warnings.push(conflict);
  if (!current) warnings.push('当前栏位为空，没有旧装备可比较。');
  if (!candidate.identified || (current && !current.identified)) warnings.push('含未鉴定装备，未知词缀不能按零属性比较。');
  const changedEffects = !sameLines(oldDetails.uncounted, newDetails.uncounted);
  if (changedEffects) warnings.push('未计入加总的词缀发生变化，技能、条件效果与流派收益需要单独核对。');
  const parserWarnings = [...(current?.warnings ?? []), ...candidate.warnings];
  warnings.push(...new Set(parserWarnings));
  const insufficient = !current || !candidate.identified || !current.identified || !!conflict || changedEffects || parserWarnings.length > 0;
  let status: ComparisonStatus = insufficient ? 'insufficient' : positive && negative ? 'tradeoff' : positive ? 'upgrade' : negative ? 'downgrade' : 'equal';
  const beforeTotals = loadoutTotals(state);
  const targets = RESISTANCE_KEYS.flatMap((key): ResistanceTarget[] => {
    const minimum = state.goals.minimums[key];
    if (minimum === undefined) return [];
    const before = beforeTotals[key] ?? 0;
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
  return { status, title: titles[status], reason: reasons[status], priorityDirection, metrics,
    uncountedBefore: oldDetails.uncounted, uncountedAfter: newDetails.uncounted, targets, warnings, canEquip: !conflict };
}

export function serializeLoadout(state: LoadoutState): string { return JSON.stringify(state, null, 2); }
export function deserializeLoadout(text: string): { state: LoadoutState | null; error: string } {
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
  if (data.goals && typeof data.goals === 'object') {
    const goals = data.goals as Record<string, unknown>;
    if (Array.isArray(goals.priorities)) state.goals.priorities = [...new Set(goals.priorities.filter((key): key is MetricKey => typeof key === 'string' && isMetricKey(key)))];
    if (goals.minimums && typeof goals.minimums === 'object') {
      const minimums = goals.minimums as Record<string, unknown>;
      for (const key of RESISTANCE_KEYS) {
        const minimum = minimums[key];
        if (typeof minimum === 'number' && Number.isFinite(minimum) && minimum >= -200 && minimum <= 1000) state.goals.minimums[key] = minimum;
      }
    }
  }
  return { state, error: '' };
}
