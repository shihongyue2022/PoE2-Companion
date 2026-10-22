/** Synthetic clipboard fixtures, containing no account or character identifiers. */
export const BOOTS_SAMPLE = `Item Class: Boots
Rarity: Rare
Dusk Trail
Adherent Leggings
--------
Armour: 200 (augmented)
Energy Shield: 80 (augmented)
--------
Requirements:
Level: 60
--------
Item Level: 82
--------
{ Prefix Modifier "Healthy" (Tier: 1) — Life }
+100(90-100) to maximum Life
{ Suffix Modifier "of the Ice" (Tier: 2) — Cold, Resistance }
+35(31-35)% to Cold Resistance
{ Suffix Modifier "of Haste" (Tier: 1) — Speed }
30(25-30)% increased Movement Speed`;

export const BOOTS_UPGRADE = BOOTS_SAMPLE.replace('Dusk Trail', 'Dawn Trail')
  .replace('+100(90-100)', '+120(110-120)').replace('200 (augmented)', '250 (augmented)');

export const WEAPON_SAMPLE = `Item Class: Bows
Rarity: Rare
Storm Branch
Crude Bow
--------
Physical Damage: 100-200 (augmented)
Elemental Damage: 10-20, 30-40 (augmented)
Attacks per Second: 1.50 (augmented)
--------
Item Level: 82
--------
100% increased Physical Damage
20% increased Attack Speed`;
