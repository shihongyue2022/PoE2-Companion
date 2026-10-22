/** Fixed values from the reported ring; no account or item identifiers. */
export const TAMING_POB_ITEM = `Rarity: UNIQUE
The Taming
Prismatic Ring
Item Level: 80
LevelReq: 42
Implicits: 2
{enchant}+14 to Dexterity
+12% to all Elemental Resistances
+26% to all Elemental Resistances
24% increased Damage for each type of Elemental Ailment on Enemy
Wind Skills which can be boosted by Elemental Ground Surfaces can be boosted by multiple Elemental Ground Surfaces
Wind Skills which can be boosted by Elemental Ground Surfaces count
as being boosted by Ignited, Shocked, and Chilled Ground
Twice Corrupted`;
export const TAMING_LEGACY_RAW = `Rarity: UNIQUE
The Taming
Prismatic Ring
--------
Item Level: 80
--------
+14 to Dexterity [PoB数值待游戏文本核对] (enchant)
+12% to all Elemental Resistances [PoB数值待游戏文本核对] (implicit)
+26% to all Elemental Resistances [PoB数值待游戏文本核对]
24% increased Damage for each type of Elemental Ailment on Enemy [PoB数值待游戏文本核对]
Wind Skills which can be boosted by Elemental Ground Surfaces can be boosted by multiple Elemental Ground Surfaces [PoB数值待游戏文本核对]
Wind Skills which can be boosted by Elemental Ground Surfaces count [PoB数值待游戏文本核对]
as being boosted by Ignited, Shocked, and Chilled Ground [PoB数值待游戏文本核对]
Twice Corrupted`;
export const tamingPobXml = () => `<PathOfBuilding2><Items activeItemSet="1"><Item id="1"><![CDATA[${TAMING_POB_ITEM}]]></Item><ItemSet id="1" title="Current"><Slot name="Ring 2" itemId="1"/></ItemSet></Items></PathOfBuilding2>`;
