/** Fixed-roll PoB export matching the reported weapon; no account or item identifiers. */
export const ORDAINED_POB_ITEM = `Rarity: UNIQUE
The Ordained
Grand Spear
Item Level: 84
Quality: 21
Sockets: S
Rune: Soul Core of Quipolatl
LevelReq: 79
Implicits: 4
{enchant}{rune}5% increased Attack Speed
25% increased Melee Strike Range with this weapon
Grants Skill: Spear Throw
Grants Skill: Level 19 Righteous Descent
220% increased Physical Damage
Adds 1 to 257 Lightning Damage
+7.2% to Critical Hit Chance
Life Leech recovers based on your Lightning damage as well as Physical damage
Create a Fragment of Divinity in your Presence every 4 seconds
Corrupted`;
export const ordainedPobXml = (item = ORDAINED_POB_ITEM) => `<PathOfBuilding2><Items activeItemSet="1"><Item id="1"><![CDATA[${item}]]></Item><ItemSet id="1" title="Current"><Slot name="Weapon 1" itemId="1"/></ItemSet></Items></PathOfBuilding2>`;

export const LEGACY_ORDAINED_RAW = `Rarity: UNIQUE
The Ordained
Grand Spear
--------
Item Level: 84
Quality: 21
Sockets: S
--------
5% increased Attack Speed [PoB数值待游戏文本核对] (rune)
25% increased Melee Strike Range with this weapon [PoB数值待游戏文本核对] (implicit)
Grants Skill: Spear Throw [PoB数值待游戏文本核对] (implicit)
Grants Skill: Level 19 Righteous Descent [PoB数值待游戏文本核对] (implicit)
220% increased Physical Damage [PoB数值待游戏文本核对]
Adds 1 to 257 Lightning Damage [PoB数值待游戏文本核对]
+7.2% to Critical Hit Chance [PoB数值待游戏文本核对]
Life Leech recovers based on your Lightning damage as well as Physical damage [PoB数值待游戏文本核对]
Create a Fragment of Divinity in your Presence every 4 seconds [PoB数值待游戏文本核对]
Corrupted`;
