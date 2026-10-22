import { addNormalAffixProbability, annulProbability } from '../../packages/engine/src/probability.ts';
import type { NormalAddCurrency } from '../../packages/engine/src/probability.ts';
import { familiesOf, modTierWeight } from '../../packages/engine/src/pool.ts';
import { limitsOf } from '../../packages/engine/src/item.ts';
import { CURRENCY_FLOOR } from '../../packages/engine/src/types.ts';
import type { CurrencyTier, ItemState, PatchData } from '../../packages/engine/src/types.ts';
import { currencyKey, stepCost } from '../../packages/optimizer/src/cost.ts';
import type { PricedStep } from '../../packages/optimizer/src/cost.ts';
import type { Engine, ExistingItem } from '../lib/engine.ts';
import type { ItemModInput } from '../lib/engineTypes.ts';
import { buildItemState } from '../lib/engineMap.ts';

type Currency = NormalAddCurrency | 'annul' | 'chaos' | 'alchemy';

export interface CraftAction {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly feasible: boolean;
  readonly reason?: string;
  /** Price-sheet units; zero with priceKnown=false means unpriced, not free. */
  readonly cost: number;
  readonly priceKnown: boolean;
}

export interface CraftOutcome {
  readonly item: ExistingItem;
  readonly action: string;
  readonly description: string;
  readonly cost: number;
  readonly priceKnown: boolean;
  readonly added: readonly ItemModInput[];
  readonly removed: readonly ItemModInput[];
  /** Probability of this ordered, tier-level draw path, not the unordered final item. */
  readonly probability: number;
  readonly probabilityKind: 'sampled-path';
  readonly assumedOdds: boolean;
  readonly note: string;
}

interface ActionSpec {
  readonly id: string;
  readonly currency: Currency;
  readonly tier: CurrencyTier;
  readonly label: string;
  readonly description: string;
}

interface Draw {
  readonly mod: ItemModInput;
  readonly side: 'prefix' | 'suffix';
  readonly probability: number;
}

const BASE_ACTIONS: readonly ActionSpec[] = [
  { id: 'transmute', currency: 'transmute', tier: 'base', label: '蜕变石', description: '普通装备变为魔法装备，随机新增 1 条词缀。' },
  { id: 'augment', currency: 'augment', tier: 'base', label: '增幅石', description: '为魔法装备随机新增 1 条词缀；魔法装备最多 1 前缀、1 后缀。' },
  { id: 'regal', currency: 'regal', tier: 'base', label: '富豪石', description: '魔法装备变为稀有装备，随机新增 1 条词缀。' },
  { id: 'exalt', currency: 'exalt', tier: 'base', label: '崇高石', description: '为稀有装备的空余词缀槽随机新增 1 条词缀。' },
  { id: 'annul', currency: 'annul', tier: 'base', label: '无效石', description: '随机移除 1 条未破碎的词缀，保持当前稀有度。' },
  { id: 'chaos', currency: 'chaos', tier: 'base', label: '混沌石', description: '稀有装备随机移除 1 条未破碎词缀，再按剩余词缀池新增 1 条。' },
  { id: 'alchemy', currency: 'alchemy', tier: 'base', label: '点金石', description: '按本地引擎规则，将普通装备变为带 4 条随机词缀的稀有装备。' },
];

function isAdd(currency: Currency): currency is NormalAddCurrency {
  return currency === 'transmute' || currency === 'augment' || currency === 'regal' || currency === 'exalt';
}

function pricedStep(spec: ActionSpec): PricedStep {
  return { currency: spec.currency, tier: spec.tier };
}

function actionSpecs(engine: Engine): ActionSpec[] {
  const specs = [...BASE_ACTIONS];
  for (const base of BASE_ACTIONS) {
    if (!isAdd(base.currency)) continue;
    for (const tier of ['greater', 'perfect'] as const) {
      const spec = {
        ...base,
        id: `${base.id}_${tier}`,
        tier,
        label: `${tier === 'greater' ? '高阶' : '完美'}${base.label}`,
        description: `${base.description}最低词缀等级 ${CURRENCY_FLOOR[base.currency][tier]}。`,
      };
      if (engine.prices.currency[currencyKey(pricedStep(spec))] !== undefined) specs.push(spec);
    }
  }
  return specs;
}

/** Reject incomplete/illegal input before buildItemState's intentionally permissive tier clamp. */
function validatedState(data: PatchData, item: ExistingItem): ItemState {
  const flags = item as ExistingItem & { readonly corrupted?: boolean; readonly mirrored?: boolean };
  if (flags.corrupted || flags.mirrored) throw new Error('腐化或镜像装备暂不支持制作模拟。');
  if (!Number.isInteger(item.level) || item.level < 1 || item.level > 100) throw new Error('物品等级必须是 1～100 的整数。');
  if (!data.bases.has(item.baseId)) throw new Error('本地规则数据中找不到这个底座。');
  if (!['normal', 'magic', 'rare'].includes(item.rarity)) throw new Error('不支持这个装备稀有度。');
  const occupied = new Set<string>();
  let crafted = 0;
  for (const side of ['prefix', 'suffix'] as const) {
    const inputs = side === 'prefix' ? item.prefixes : item.suffixes;
    for (const placed of inputs) {
      const mod = data.mods.get(placed.modId);
      if (!mod || mod.type !== side) throw new Error('装备存在未识别或前后缀位置错误的词缀。');
      if (!Number.isInteger(placed.tierDisplay) || placed.tierDisplay < 1 || placed.tierDisplay > mod.tiers.length) {
        throw new Error('装备词缀阶级无效，请先确认词缀阶级。');
      }
      const tier = mod.tiers[mod.tiers.length - placed.tierDisplay]!;
      if (tier.ilvl > item.level) throw new Error('现有词缀阶级超过物品等级允许的范围。');
      const families = familiesOf(mod);
      if (families.some((family) => occupied.has(family))) throw new Error('现有词缀存在互斥冲突。');
      for (const family of families) occupied.add(family);
      if (mod.source === 'essence' || mod.source === 'perfect_essence') crafted++;
    }
  }
  const state = buildItemState(data, item);
  const caps = limitsOf(state.base);
  if (crafted > caps.crafted) throw new Error(`当前底座最多允许 ${caps.crafted} 条精华／合金制作词缀。`);
  for (const placed of [...item.prefixes, ...item.suffixes]) {
    const mod = data.mods.get(placed.modId)!;
    const pool = mod.source === 'normal' ? state.base.pools.normal
      : mod.source === 'desecrated' ? state.base.pools.desecrated : state.base.pools.essence;
    const side = mod.type === 'prefix' ? pool.prefixes : pool.suffixes;
    if (!side.includes(mod.id)) throw new Error('现有词缀不属于该底座允许的词缀池。');
  }
  const prefixCap = item.rarity === 'normal' ? 0 : item.rarity === 'magic' ? 1 : caps.prefixes;
  const suffixCap = item.rarity === 'normal' ? 0 : item.rarity === 'magic' ? 1 : caps.suffixes;
  if (item.prefixes.length > prefixCap || item.suffixes.length > suffixCap) throw new Error('现有词缀数量超过该稀有度的槽位限制。');
  return state;
}

/** Exact tier-level draw probabilities under the loaded snapshot, using engine legality and weights. */
function additions(data: PatchData, state: ItemState, currency: NormalAddCurrency, tier: CurrencyTier): Draw[] {
  const draws: Draw[] = [];
  const floor = CURRENCY_FLOOR[currency][tier];
  const ids = new Set([...state.base.pools.normal.prefixes, ...state.base.pools.normal.suffixes]);
  for (const modId of ids) {
    const probability = addNormalAffixProbability(data, state, currency, modId, { currencyTier: tier });
    if (probability <= 0) continue;
    const mod = data.mods.get(modId)!;
    const weight = modTierWeight(mod, floor, state.level);
    mod.tiers.forEach((entry, index) => {
      if (entry.ilvl < floor || entry.ilvl > state.level || entry.weight <= 0) return;
      draws.push({
        mod: { modId, tierDisplay: mod.tiers.length - index },
        side: mod.type,
        probability: probability * entry.weight / weight,
      });
    });
  }
  return draws;
}

function removals(data: PatchData, state: ItemState, item: ExistingItem): Draw[] {
  return [
    ...item.prefixes.map((mod) => ({ mod, side: 'prefix' as const, probability: annulProbability(data, state, mod.modId) })),
    ...item.suffixes.map((mod) => ({ mod, side: 'suffix' as const, probability: annulProbability(data, state, mod.modId) })),
  ].filter((draw) => draw.probability > 0);
}

function unavailable(data: PatchData, item: ExistingItem, state: ItemState, spec: ActionSpec): string | undefined {
  const currency = spec.currency;
  if (currency === 'annul' || currency === 'chaos') {
    if (currency === 'chaos' && item.rarity !== 'rare') return '混沌石只能用于稀有装备。';
    if (item.rarity === 'normal') return '普通装备没有可移除的词缀。';
    if (removals(data, state, item).length === 0) return '没有可移除的词缀；破碎词缀不会被移除。';
    return undefined;
  }
  if (currency === 'alchemy') {
    if (item.rarity !== 'normal') return '点金石只能用于普通装备。';
    if (additions(data, { ...state, rarity: 'rare' }, 'exalt', 'base').length === 0) return '当前物品等级没有可抽取的词缀。';
    return undefined;
  }
  const requiredRarity = currency === 'transmute' ? 'normal' : currency === 'exalt' ? 'rare' : 'magic';
  if (item.rarity !== requiredRarity) return `需要${requiredRarity === 'normal' ? '普通' : requiredRarity === 'magic' ? '魔法' : '稀有'}装备。`;
  if (additions(data, state, currency, spec.tier).length === 0) return '没有可添加的词缀：槽位已满，或等级、互斥条件不满足。';
  return undefined;
}

/** All supported buttons, including disabled buttons with an explanation. */
export function getCraftActions(engine: Engine, item: ExistingItem): CraftAction[] {
  let state: ItemState | undefined;
  let invalid: string | undefined;
  try { state = validatedState(engine.data, item); } catch (error) { invalid = error instanceof Error ? error.message : '装备状态无效。'; }
  return actionSpecs(engine).map((spec) => {
    const price = engine.prices.currency[currencyKey(pricedStep(spec))];
    const priceKnown = price !== undefined && Number.isFinite(price) && price >= 0;
    const reason = invalid ?? unavailable(engine.data, item, state!, spec);
    return {
      id: spec.id, label: spec.label, description: spec.description,
      feasible: reason === undefined, ...(reason ? { reason } : {}),
      cost: priceKnown ? stepCost(engine.prices, pricedStep(spec)) : 0, priceKnown,
    };
  });
}

export const availableCraftActions = getCraftActions;

function select(draws: readonly Draw[], rng: () => number): Draw {
  if (draws.length === 0) throw new Error('当前规则数据中没有合法抽样结果。');
  const total = draws.reduce((sum, draw) => sum + draw.probability, 0);
  if (!Number.isFinite(total) || Math.abs(total - 1) > 1e-7) throw new Error('当前词缀池概率不完整，已停止模拟。');
  const random = rng();
  if (!Number.isFinite(random) || random < 0 || random >= 1) throw new Error('随机数必须位于 [0, 1) 范围内。');
  let remaining = random * total;
  for (const draw of draws) {
    remaining -= draw.probability;
    if (remaining < 0) return draw;
  }
  return draws[draws.length - 1]!;
}

/** One immutable orb use. Values inside a tier are deliberately not invented: this simulates tiers. */
export function simulateCraft(engine: Engine, item: ExistingItem, action: string, rng: () => number = Math.random): CraftOutcome {
  const spec = actionSpecs(engine).find((entry) => entry.id === action);
  if (!spec) throw new Error('暂不支持这种制作操作。');
  const state = validatedState(engine.data, item);
  const reason = unavailable(engine.data, item, state, spec);
  if (reason) throw new Error(reason);
  const button = getCraftActions(engine, item).find((entry) => entry.id === action)!;
  let next: ExistingItem = { ...item, prefixes: [...item.prefixes], suffixes: [...item.suffixes] };
  const added: ItemModInput[] = [];
  const removed: ItemModInput[] = [];
  let probability = 1;
  let assumedOdds = false;

  const removeOne = (): void => {
    const draw = select(removals(engine.data, buildItemState(engine.data, next), next), rng);
    removed.push(draw.mod);
    probability *= draw.probability;
    const key = draw.side === 'prefix' ? 'prefixes' : 'suffixes';
    const index = next[key].indexOf(draw.mod);
    next = { ...next, [key]: next[key].filter((_, position) => position !== index) };
  };
  const addOne = (currency: NormalAddCurrency, tier: CurrencyTier, allowEmpty = false): void => {
    const current = buildItemState(engine.data, next);
    const draws = additions(engine.data, current, currency, tier);
    if (allowEmpty && draws.length === 0) return; // Upstream Chaos rule: removal stands if no mod can roll.
    const draw = select(draws, rng);
    // A placeholder weight of 1 must never be promoted to verified odds just because it sums to 1.
    assumedOdds ||= draws.some((entry) => {
      const mod = engine.data.mods.get(entry.mod.modId)!;
      const rolledTier = mod.tiers[mod.tiers.length - entry.mod.tierDisplay]!;
      return mod.rune !== undefined || rolledTier.weight === 1;
    });
    added.push(draw.mod);
    probability *= draw.probability;
    const key = draw.side === 'prefix' ? 'prefixes' : 'suffixes';
    const rarity = currency === 'transmute' || currency === 'augment' ? 'magic' : 'rare';
    next = { ...next, rarity, [key]: [...next[key], draw.mod] };
  };

  if (spec.currency === 'annul') removeOne();
  else if (spec.currency === 'chaos') { removeOne(); addOne('exalt', 'base', true); }
  else if (spec.currency === 'alchemy') {
    next = { ...next, rarity: 'rare' };
    for (let roll = 0; roll < 4; roll++) addOne('exalt', 'base');
  } else addOne(spec.currency, spec.tier);

  return {
    item: next, action, cost: button.cost, priceKnown: button.priceKnown,
    description: `${spec.label}：${removed.length ? `移除 ${removed.length} 条词缀` : ''}${removed.length && added.length ? '，' : ''}${added.length ? `新增 ${added.length} 条词缀` : ''}。`,
    added, removed, probability, probabilityKind: 'sampled-path', assumedOdds,
    note: '按本地数据快照的权重抽取词缀和阶级，不生成阶级内的实际数值；概率并非当前游戏实测值。',
  };
}
