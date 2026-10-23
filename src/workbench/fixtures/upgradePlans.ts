import { damageState } from './damageGoal';
import { equipmentSignature } from '../resistanceModel';
import { DEFAULT_WORKFLOW } from '../workflowPreferences';
import type { PlanCandidate } from '../upgradePlans';

const rawBoots = 'Rarity: Rare\nTest Boots\nLattice Sandals\n--------\nItem Level: 84\n--------\n+10% to Cold Resistance';
export function pairFixture() {
  const state = damageState(); state.slots.boots = rawBoots;
  state.character!.equipmentSignature = state.source!.equipmentSignature = equipmentSignature(state.slots);
  state.goals.workflow = { ...DEFAULT_WORKFLOW, budget: 10 };
  const quote = (id: string, amount: number) => ({ id, amount, currency: 'divine', sampledAt: new Date().toISOString() });
  const ring: PlanCandidate = { id: 'ring', slot: 'ring1', quote: quote('listing-ring', 6), raw: 'Rarity: Rare\nDamage Ring\nGold Ring\n--------\nItem Level: 84\n--------\n12% increased Attack Speed\nAdds 10 to 20 Lightning Damage to Attacks' };
  const boots: PlanCandidate = { id: 'boots', slot: 'boots', quote: quote('listing-boots', 4), raw: `${rawBoots}\n+30% to all Elemental Resistances\n+12% to Chaos Resistance` };
  return { state, ring, boots };
}
