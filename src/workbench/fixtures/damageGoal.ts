import { emptyLoadout, type LoadoutState } from '../loadout';
import { equipmentSignature } from '../characterPanel';
import { parsePobXml } from '../pobImport';
import { combatXml } from './pobCombat';

/** Synthetic items and character values, without account identifiers. */
export const damageRing = 'Rarity: RARE\nTest Loop\nGold Ring\n--------\n+30% to all Elemental Resistances\n+12% to Chaos Resistance\n10% increased Attack Speed\n+70 to maximum Life';
export function damageState(raw = damageRing): LoadoutState {
  const state = { ...emptyLoadout(), slots: { ring1: raw } };
  return { ...state, source: { kind: 'pob', importedAt: new Date().toISOString(), setId: '1', setTitle: 'Current', secondWeapons: false,
    equipmentSignature: equipmentSignature(state.slots), combat: parsePobXml(combatXml).profile!.combat },
    character: { recordedAt: new Date().toISOString(), equipmentSignature: equipmentSignature(state.slots),
      values: { fireResistance: 90, coldResistance: 90, lightningResistance: 90, chaosResistance: 75 },
      caps: { fireResistance: 75, coldResistance: 75, lightningResistance: 75, chaosResistance: 75 } } };
}
