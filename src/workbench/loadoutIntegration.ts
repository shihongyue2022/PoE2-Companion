import { equipmentDisplayName, equipmentMetricDetails, parseEquipment, type Equipment } from './genericEquipment';
import { LOADOUT_SLOTS, METRICS, loadoutTotals, type LoadoutSlot, type LoadoutState, type MetricKey } from './loadout';
import type { EquipmentTradeRow } from './genericEquipmentTrade';
import { equipmentSignature } from './characterPanel';
import type { PobSource } from './loadoutSource';
import { readLoadoutQuotes } from './loadoutQuotes';
import type { Currency } from './finance';
import { buildModWeight } from './buildAdvice';
import { damageGoalRows, resistanceQueryRows, usesDamageGoal } from './damageGoal';

export function applyPobLoadout(current: LoadoutState, slots: LoadoutState['slots'], source?: PobSource): LoadoutState {
  return { ...current, slots, character: undefined, source, quotes: readLoadoutQuotes(current.quotes, slots),
    previous: Object.keys(current.slots).length ? { slots: current.slots, source: current.source, replacedAt: new Date().toISOString() } : undefined };
}
export function loadoutChanges(before: LoadoutState, after: LoadoutState) {
  const totalsBefore = loadoutTotals(before), totalsAfter = loadoutTotals(after);
  return {
    slots: LOADOUT_SLOTS.flatMap((slot) => before.slots[slot.id] === after.slots[slot.id] ? [] : [{ ...slot,
      before: parseEquipment(before.slots[slot.id] ?? '')?.name ?? '未装备', after: parseEquipment(after.slots[slot.id] ?? '')?.name ?? '未装备' }]),
    metrics: METRICS.filter((metric) => !metric.key.endsWith('Dps')).map((metric) => ({ ...metric,
      before: totalsBefore[metric.key] ?? 0, after: totalsAfter[metric.key] ?? 0, delta: (totalsAfter[metric.key] ?? 0) - (totalsBefore[metric.key] ?? 0),
    })).filter((row) => Math.abs(row.delta) > 0.0001),
  };
}
export function chooseComparisonSlot(state: LoadoutState, item: Equipment, preferred?: LoadoutSlot): LoadoutSlot | undefined {
  const suitable = LOADOUT_SLOTS.filter((slot) => slot.kind === item.slot || slot.id === 'offHand' && item.slot === 'weapon' && !item.twoHanded);
  if (preferred && suitable.some((slot) => slot.id === preferred)) return preferred;
  return suitable.find((slot) => state.slots[slot.id])?.id ?? suitable[0]?.id;
}
export interface LoadoutContext { state: LoadoutState; slot: LoadoutSlot; raw: string }
export function liveLoadoutContext(context: LoadoutContext): boolean { return context.state.slots[context.slot] === context.raw; }

/** Increase importance of explicitly chosen character priorities without inventing a combat model. */
export function loadoutUpgradeRows(rows: EquipmentTradeRow[], equipment: Equipment, context?: LoadoutContext): EquipmentTradeRow[] {
  if (!context || !liveLoadoutContext(context)) return rows;
  if (usesDamageGoal(context.state)) return [...damageGoalRows(rows, equipment, context.state), ...resistanceQueryRows(context.state, context.slot, equipment)];
  return rows.map((row) => {
    const mod = equipment.mods.find((entry) => `mod:${entry.key}` === row.key);
    if (!mod || mod.value === undefined || !mod.ref) return row;
    const one = { ...equipment, properties: [], mods: [mod] };
    const metrics = equipmentMetricDetails(one).values;
    const priority = context.state.goals.priorities.some((key) => (metrics[key] ?? 0) !== 0);
    const weight = Math.max(priority ? 3 : 1, buildModWeight(context.state.goals.build, mod));
    return row.enabled && !row.presenceOnly ? { ...row, weight: String(weight) } : row;
  });
}
export function sourceIsCurrent(state: LoadoutState): boolean { return !!state.source && state.source.equipmentSignature === equipmentSignature(state.slots); }
export interface LoadoutAssetInput { itemKey: string; label: string; quantity: number; price: number | null; currency: Currency }
export async function loadoutAssetInputs(state: LoadoutState, league: string, defaultCurrency: Currency): Promise<LoadoutAssetInput[]> {
  const grouped = new Map<string, LoadoutAssetInput>();
  const quotes = readLoadoutQuotes(state.quotes, state.slots);
  for (const slot of LOADOUT_SLOTS) {
    const raw = state.slots[slot.id]; if (!raw) continue;
    const item = parseEquipment(raw); if (!item) continue;
    // Slot-independent identity: moving a ring must not create a duplicate asset. Equal copies count twice.
    const fingerprint = new TextEncoder().encode(raw.trim().replace(/\r/g, ''));
    const digest = await crypto.subtle.digest('SHA-256', fingerprint);
    const itemKey = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const quote = quotes[slot.id]?.league === league ? quotes[slot.id] : undefined;
    const prior = grouped.get(itemKey);
    if (prior) {
      prior.quantity++;
      if (!quote || prior.currency !== quote.currency || prior.price !== quote.amount) prior.price = null;
    } else {
      const translated = equipmentDisplayName(item);
      grouped.set(itemKey, { itemKey, label: (translated === item.name ? translated : `${translated}（${item.name}）`).slice(0, 270), quantity: 1, price: quote?.amount ?? null, currency: quote?.currency ?? defaultCurrency });
    }
  }
  return [...grouped.values()];
}
export const priorityNames = (keys: readonly MetricKey[]) => METRICS.filter((metric) => keys.includes(metric.key)).map((metric) => metric.label);
