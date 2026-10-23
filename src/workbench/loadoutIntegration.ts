import { equipmentDisplayName, equipmentMetricDetails, parseEquipment, type Equipment } from './genericEquipment';
import { LOADOUT_SLOTS, METRICS, loadoutTotals, type LoadoutSlot, type LoadoutState, type MetricKey } from './loadout';
import type { EquipmentTradeRow } from './genericEquipmentTrade';
import { equipmentSignature } from './characterPanel';
import type { PobSource } from './loadoutSource';
import { readLoadoutQuotes } from './loadoutQuotes';
import type { Currency } from './finance';
import { buildModWeight } from './buildAdvice';
import { damageGoalRows, resistanceQueryRows, usesDamageGoal } from './damageGoal';
import { activeSecondWeapons, activeWeaponSet, syncWeaponSets } from './weaponSets';
import { equipmentRevision, revisionMetrics, revisionWeaponPair } from './equipmentRevision';

export function applyPobLoadout(current: LoadoutState, slots: LoadoutState['slots'], source?: PobSource): LoadoutState {
  const at = new Date().toISOString();
  const next = syncWeaponSets({ ...current, slots, weaponSets: source?.weaponSets ? { ...source.weaponSets, active: source.secondWeapons ? 2 : 1 } : undefined,
    character: undefined, socketEvidence: undefined, source, quotes: readLoadoutQuotes(current.quotes, slots) });
  const changes = loadoutChanges(current, next), equipmentChanges = changes.slots.filter((row) => ['added', 'removed', 'modified'].includes(row.revision.status)).length;
  const shouldRecord = equipmentChanges > 0 || !current.previous && changes.slots.length > 0;
  return { ...next,
    lastImport: { at, equipmentChanges, formatOnly: changes.formatOnly, newlyRead: changes.slots.filter((row) => row.revision.status === 'newly-read').length,
      informationChanges: changes.slots.filter((row) => row.revision.status === 'information').length },
    previous: Object.keys(current.slots).length && shouldRecord ? { slots: current.slots, weaponSets: syncWeaponSets(current).weaponSets, source: current.source, replacedAt: at,
      after: { slots: next.slots, weaponSets: next.weaponSets } } : current.previous };
}
export function loadoutChanges(before: LoadoutState, after: LoadoutState) {
  const totalsBefore = loadoutTotals(before), totalsAfter = loadoutTotals(after);
  interface RevisionSlot { id: LoadoutSlot; label: string; kind: string; key: string; beforeRaw?: string; afterRaw?: string; beforeKnown: boolean; afterKnown: boolean }
  const entries = LOADOUT_SLOTS.flatMap<RevisionSlot>((slot) => {
    if (slot.id !== 'mainHand' && slot.id !== 'offHand') return [{ ...slot, key: slot.id, beforeRaw: before.slots[slot.id], afterRaw: after.slots[slot.id], beforeKnown: true, afterKnown: true }];
    return ([1, 2] as const).map((number) => {
      const a = revisionWeaponPair(before, number), b = revisionWeaponPair(after, number);
      return { ...slot, label: `武器组 ${number === 1 ? 'I' : 'II'} · ${slot.label}`, key: `${number}:${slot.id}`, beforeRaw: a?.[slot.id], afterRaw: b?.[slot.id], beforeKnown: !!a, afterKnown: !!b };
    });
  }).map((slot) => ({ ...slot, revision: equipmentRevision(slot.beforeRaw, slot.afterRaw, slot.beforeKnown, slot.afterKnown) }));
  const sameWeaponSet = activeWeaponSet(before) === activeWeaponSet(after);
  return {
    slots: entries.filter((row) => row.revision.status !== 'unchanged').map((row) => ({ ...row,
      before: row.revision.before?.name ?? '未装备', after: row.revision.after?.name ?? '未装备',
      metrics: (() => {
        const values = revisionMetrics(row.revision.before, row.revision.after, row.beforeKnown);
        return METRICS.flatMap((metric) => {
          const a = values.beforePending.includes(metric.key) || !row.beforeKnown ? undefined : values.before[metric.key] ?? (row.revision.before ? undefined : 0);
          const b = values.afterPending.includes(metric.key) || !row.afterKnown ? undefined : values.after[metric.key] ?? (row.revision.after ? undefined : 0);
          if (a === b || a === undefined || b === undefined) return [];
          return [{ ...metric, before: a, after: b, delta: Number((b - a).toFixed(6)) }];
        });
      })() })),
    formatOnly: entries.filter((row) => row.revision.formatOnly).length,
    sameWeaponSet,
    metrics: (sameWeaponSet ? METRICS.filter((metric) => !metric.key.endsWith('Dps')) : []).map((metric) => ({ ...metric,
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
export function sourceIsCurrent(state: LoadoutState): boolean { return !!state.source && state.source.secondWeapons === activeSecondWeapons(state) && state.source.equipmentSignature === equipmentSignature(state.slots); }
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
