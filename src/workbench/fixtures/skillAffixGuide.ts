import { damageState } from './damageGoal';
import { equipmentSignature } from '../resistanceModel';
import type { PobGem } from '../pobCombat';

export function twisterGuideState() {
  const state = damageState(), combat = state.source!.combat!;
  const group = combat.sets.find((set) => set.id === combat.activeSet)!.groups.find((entry) => entry.index === combat.mainGroup)!;
  group.gems[0] = { ...group.gems[0]!, name: 'Twister', id: 'Metadata/Items/Gems/SkillGemTwister', skillId: 'TwisterPlayer' };
  const support = (name: string): PobGem => ({ name, id: '', skillId: '', level: 1, quality: 0, enabled: true, weapon1: true, weapon2: false });
  group.gems.push(support('Projectile Acceleration III'), support("Rakiata's Flow"), support('Rage II'), support('Salvo'));
  state.slots.mainHand = 'Rarity: Rare\nExample Spear\nGrand Spear\n--------\nPhysical Damage: 100-200\nAttacks per Second: 1.50\n--------\nItem Level: 84\n--------\n30% increased Physical Damage';
  state.slots.gloves = 'Rarity: Rare\nExample Bracers\nGrand Bracers\n--------\nItem Level: 84\n--------\n+70 to maximum Life\n+10% to Fire Resistance';
  state.character!.equipmentSignature = state.source!.equipmentSignature = equipmentSignature(state.slots);
  return state;
}

export function linkedGuideState() {
  const state = twisterGuideState(), combat = state.source!.combat!, set = combat.sets.find((entry) => entry.id === combat.activeSet)!;
  const main = set.groups.find((entry) => entry.index === combat.mainGroup)!;
  set.groups.push({ ...main, index: 5, gems: [{ ...main.gems[0]!, id: 'Metadata/Items/Gems/SkillGemWhirlingSlash', skillId: 'WhirlingSlashPlayer', name: 'Whirling Slash' }] });
  return state;
}

export function threeSkillRoutineState() {
  const state = linkedGuideState(), combat = state.source!.combat!, set = combat.sets.find((entry) => entry.id === combat.activeSet)!;
  const template = set.groups.find((entry) => entry.index === combat.mainGroup)!;
  const gem = template.gems[0]!;
  set.groups.push({ ...template, index: 6, gems: [{ ...gem, id: 'Metadata/Items/Gems/SkillGemExplosiveSpear', skillId: 'ExplosiveSpearPlayer', name: 'Explosive Spear' },
    { ...gem, id: '', skillId: '', name: 'Fire Penetration II' }] });
  set.groups.push({ ...template, index: 7, gems: [{ ...gem, id: 'Metadata/Items/Gems/SkillGemLightningSpear', skillId: 'LightningSpearPlayer', name: 'Lightning Spear' }] });
  combat.mainGroup = 7;
  return state;
}
