/** Synthetic snapshots for two weapon pairs; no account data. */
export const firstWeapon = 'Rarity: Rare\nFirst Weapon\nCrude Bow\n--------\nPhysical Damage: 10-20\nAttacks per Second: 1.5\n--------\n+10 to maximum Life';
export const secondWeapon = 'Rarity: Rare\nSecond Weapon\nBone Wand\n--------\n+20 to maximum Life\n+20% to Fire Resistance';
export const secondOffhand = 'Rarity: Rare\nSecond Shield\nAged Tower Shield\n--------\n+15% to Chaos Resistance';
export const sharedRing = 'Rarity: Rare\nShared Loop\nGold Ring\n--------\n+40 to maximum Life';
export const dualWeaponsXml = `<PathOfBuilding2><Build level="87" mainSocketGroup="1">
<PlayerStat stat="Life" value="1500"/><PlayerStat stat="FireResistTotal" value="100"/><PlayerStat stat="FireResistMax" value="75"/>
<PlayerStat stat="ColdResistTotal" value="100"/><PlayerStat stat="ColdResistMax" value="75"/>
<PlayerStat stat="LightningResistTotal" value="100"/><PlayerStat stat="LightningResistMax" value="75"/>
<PlayerStat stat="ChaosResistTotal" value="75"/><PlayerStat stat="ChaosResistMax" value="75"/>
<PlayerStat stat="CritChance" value="40"/><PlayerStat stat="CombinedDPS" value="1234"/></Build>
<Items activeItemSet="1"><Item id="1"><![CDATA[${firstWeapon}]]></Item><Item id="2"><![CDATA[${secondWeapon}]]></Item>
<Item id="3"><![CDATA[${secondOffhand}]]></Item><Item id="4"><![CDATA[${sharedRing}]]></Item>
<ItemSet id="1" title="Current" useSecondWeaponSet="false"><Slot name="Weapon 1" itemId="1"/><Slot name="Weapon 2" itemId="0"/>
<Slot name="Weapon 1 Swap" itemId="2"/><Slot name="Weapon 2 Swap" itemId="3"/><Slot name="Ring 1" itemId="4"/></ItemSet></Items>
<Skills activeSkillSet="1"><SkillSet id="1"><Skill enabled="true" mainActiveSkill="1"><Gem nameSpec="Lightning Spear" gemId="Metadata/Items/Gems/SkillGemLightningSpear" enabled="true" enableGlobal1="true" enableGlobal2="false"/></Skill>
<Skill enabled="true" mainActiveSkill="1"><Gem nameSpec="Fireball" gemId="Metadata/Items/Gems/SkillGemFireball" enabled="true" enableGlobal1="false" enableGlobal2="true"/></Skill></SkillSet></Skills></PathOfBuilding2>`;
