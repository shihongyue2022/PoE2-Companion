import type { PatchData } from '../../packages/engine/src/types';
import type { GearTrade } from '../lib/gearTrade';
import type { Equipment } from './genericEquipment';
import { equipmentTradeRows, type EquipmentTradeRow } from './genericEquipmentTrade';
import type { LoadoutSlot, LoadoutState } from './loadout';
import { liveLoadoutContext, loadoutUpgradeRows, type LoadoutContext } from './loadoutIntegration';
import { usesDamageGoal } from './damageGoal';
import { automaticUtilityRows } from './searchGuidance';
import { mergeSkillTargetRows, skillTargetRows } from './skillRecommendation';
import { addResistanceAffixRows, availableAffixes } from './equipmentAffixes';
import { activeWeaponSet } from './weaponSets';

/** Shared defaults for market ranking and the equipment comparison page. */
export function upgradeSearchRows(equipment: Equipment, context?: LoadoutContext, data?: PatchData, trade?: GearTrade | null, allowedRunes: readonly string[] = []): EquipmentTradeRow[] {
  const targets = context && liveLoadoutContext(context) && usesDamageGoal(context.state)
    ? skillTargetRows(equipment, context.state, data, trade ?? undefined, 12, allowedRunes) : [];
  const rows = mergeSkillTargetRows(equipmentTradeRows(equipment, 'upgrade'), targets, equipment);
  return addResistanceAffixRows(automaticUtilityRows(loadoutUpgradeRows(rows, equipment, context), equipment), equipment,
    context, availableAffixes(equipment, data, trade, allowedRunes), data?.patch);
}

export interface UpgradeSearchSnapshot { slot: LoadoutSlot; sourceRaw: string; contextKey: string; rows: readonly EquipmentTradeRow[] }
export interface UpgradeMarketQuote { id: string; amount: number; currency: string; sampledAt: string }
export interface UpgradeCandidateInput { id: string; raw: string; slot?: LoadoutSlot; search?: UpgradeSearchSnapshot; quote?: UpgradeMarketQuote }
// Quotes and UI selection do not change the combat context; all gear, goals and calibration do.
function contextKey(state: LoadoutState) { return JSON.stringify({ slots: state.slots, weaponSet: activeWeaponSet(state), goals: state.goals, source: state.source, character: state.character, socketEvidence: state.socketEvidence }); }
export function captureUpgradeSearch(context: LoadoutContext | undefined, rows: readonly EquipmentTradeRow[]): UpgradeSearchSnapshot | undefined {
  return context && liveLoadoutContext(context) ? { slot: context.slot, sourceRaw: context.raw, contextKey: contextKey(context.state), rows: structuredClone(rows) } : undefined;
}
export function comparisonSearchRows(snapshot: UpgradeSearchSnapshot | undefined, state: LoadoutState, slot: LoadoutSlot): readonly EquipmentTradeRow[] | undefined {
  return snapshot && snapshot.slot === slot && state.slots[slot] === snapshot.sourceRaw && snapshot.contextKey === contextKey(state) ? snapshot.rows : undefined;
}
