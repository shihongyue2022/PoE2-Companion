import type { BuildFamily, BuildProfile } from './buildProfile';
import { parseEquipment, type Equipment, type EquipmentMod } from './genericEquipment';
import type { LoadoutState, LoadoutSlot } from './loadout';

export function buildModFamily(profile: BuildProfile, mod: EquipmentMod): BuildFamily | undefined {
  const ref = mod.ref ?? '';
  if (/Minion|Allies|Enemy|Enemies/i.test(ref)) return undefined;
  if (/Energy Shield/i.test(ref)) return 'energyShield';
  if (/Evasion/i.test(ref)) return 'evasion';
  if (/Armour/i.test(ref)) return 'armour';
  if (/Resistance/i.test(ref)) return 'resistances';
  if (/maximum Life/i.test(ref)) return 'life';
  if (/maximum Mana/i.test(ref)) return 'mana';
  if (/Movement Speed/i.test(ref)) return 'movementSpeed';
  if (/Critical (?:Damage|Strike Multiplier|Hit Damage)/i.test(ref)) return 'critDamage';
  if (/Critical (?:Hit|Strike) Chance/i.test(ref)) return 'critChance';
  if (/Attack Speed/i.test(ref) && profile.main.tags.includes('attack')) return 'attackSpeed';
  if (/Projectile Damage/i.test(ref) && profile.main.tags.includes('projectile')) return 'projectileDamage';
  if (/Melee Damage/i.test(ref) && profile.main.tags.includes('melee')) return 'meleeDamage';
  if (/Spell Damage/i.test(ref) && profile.main.tags.includes('spell')) return 'spellDamage';
  if (/Damage/i.test(ref) && /Attacks|Attack Skills|increased (?:Physical|Elemental|Fire|Cold|Lightning|Chaos|Attack) Damage|^Adds # to #/i.test(ref)
    && profile.main.tags.includes('attack')) return 'attackDamage';
  return undefined;
}
export function buildModWeight(profile: BuildProfile | undefined, mod: EquipmentMod): number {
  if (!profile) return 1;
  const family = buildModFamily(profile, mod);
  return profile.priorities.find((priority) => priority.family === family)?.weight ?? 1;
}
export function buildConditionWarnings(profile: BuildProfile | undefined, slots: LoadoutState['slots']): string[] {
  if (!profile) return [];
  const main = parseEquipment(slots.mainHand ?? '');
  const warnings: string[] = [];
  if (profile.main.weapon === 'Spear' && main && main.category !== 'weapon.spear') warnings.push('参考 BD 的主攻技能要求长矛，当前主手类别不匹配。');
  if (!profile.constraints.emptyOffhand) return warnings;
  if (slots.offHand) warnings.push('BD 的 Dance with Death 要求副手留空；这套装备不满足此条件，不能按该天赋的技能速度收益判断。');
  if (main && !['weapon.spear', 'weapon.onemace', 'weapon.oneaxe', 'weapon.onesword', 'weapon.dagger', 'weapon.claw', 'weapon.flail'].includes(main.category)) {
    warnings.push('BD 的 Dance with Death 要求主手为单手近战武器；当前主手不符合已核对的类别。');
  }
  return warnings;
}
export function buildSlotPriorities(profile: BuildProfile, slot: LoadoutSlot) {
  const offensive = new Set<BuildFamily>(['attackDamage', 'attackSpeed', 'critChance', 'critDamage', 'projectileDamage', 'meleeDamage', 'spellDamage', 'skillLevels']);
  return profile.priorities.filter(({ family }) => slot === 'mainHand' ? offensive.has(family)
    : /^(?:flask|charm)/.test(slot) ? false
      : offensive.has(family) ? /^(?:ring|amulet|gloves)/.test(slot)
        : family === 'movementSpeed' ? slot === 'boots' : true)
    .sort((a, b) => b.weight - a.weight);
}
export function buildCandidateWarnings(state: LoadoutState, slot: LoadoutSlot, item: Equipment): string[] {
  if (!state.goals.build) return [];
  return buildConditionWarnings(state.goals.build, { ...state.slots, [slot]: item.raw });
}
