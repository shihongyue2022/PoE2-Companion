import type { Equipment } from './genericEquipment';

/** Manually checked references, not a replacement for official trade IDs or engine rules.
 * Checked 2026-10-22. Facts are linked to individual item pages for review. */
export const POE2DB_MODIFIERS = 'https://poe2db.tw/us/Modifiers';
export const POE2DB_REVIEWED_AT = '2026-10-22';
export const englishPoe2dbUrl = (name: string) => `https://poe2db.tw/us/${encodeURIComponent(name.replace(/['’]/g, '').replace(/ /g, '_'))}`;
const page = englishPoe2dbUrl;
const sources: Record<string, string> = {
  local_display_grants_spear_throw_skill: 'The Ordained',
  'local_+%_weapon_range': 'The Ordained',
  'local_physical_damage_+%': 'The Ordained',
  local_maximum_added_lightning_damage: 'The Ordained',
  local_minimum_added_lightning_damage: 'The Ordained',
  local_critical_strike_chance: 'The Ordained',
  life_leech_also_recovers_based_on_lightning_damage: 'The Ordained',
  manifest_a_fragment_of_divinity_in_your_presence_every_4_seconds: 'The Ordained',
  'local_armour_and_evasion_and_energy_shield_+%': 'Morior Invictus',
  'local_global_armour_evasion_energy_shield_+%_per_rune_or_soul_core': 'Morior Invictus',
  'local_base_life_regeneration_rate_per_minute_+_per_rune_or_soul_core': 'Morior Invictus',
  life_recovery_from_regeneration_is_not_applied: 'Igniferis',
  recover_1_life_per_x_life_regeneration_per_minute_every_4_seconds: 'Igniferis',
  'damage_+%_per_enemy_elemental_ailment': 'The Taming',
  wind_skills_can_be_empowered_by_multiple_elements: 'The Taming',
  wind_skills_count_as_empowered_by_chilled_ground: 'The Taming',
};
export function poe2dbStatReference(statId?: string): string | undefined {
  return statId && sources[statId] ? page(sources[statId]) : undefined;
}

/** Display-only game flag confirmed in the item's Stats/Family block. The database
 * identifier is NOT an official trade identifier, and its boolean value is NOT power. */
export function poe2dbUnmappedStat(text: string) {
  if (!/^(?:Grants Skill:\s*Spear Throw|赋予技能[:：]\s*长矛投掷|local display grants spear throw skill\s*\[1\])$/i.test(text.trim())) return undefined;
  return { ref: 'Grants Skill: Spear Throw', statId: 'local_display_grants_spear_throw_skill',
    label: '赋予技能: 长矛投掷', referenceUrl: page('The Ordained') };
}

export function equipmentPoe2dbLinks(equipment: Equipment): { label: string; url: string }[] {
  const links = [{ label: 'PoE2DB 词缀总表', url: POE2DB_MODIFIERS }];
  if (equipment.nameEnglish && equipment.rarity === 'unique') links.push({ label: '这件传奇的词缀与机制', url: page(equipment.nameEnglish) });
  if (equipment.baseNameEnglish) links.push({ label: '当前底座资料', url: page(equipment.baseNameEnglish) });
  return links;
}
