export const combatRing = 'Rarity: RARE\nTest Loop\nGold Ring\n--------\n+70 to maximum Life\n+20% to Fire Resistance';
export const combatXml = `<PathOfBuilding2>
<Build level="87" mainSocketGroup="3"><PlayerStat stat="AverageDamage" value="1331.668"/>
<PlayerStat stat="TotalDPS" value="174.4095"/><PlayerStat stat="TotalDotDPS" value="0.0473"/>
<PlayerStat stat="IgniteDPS" value="0.0473"/><PlayerStat stat="CombinedDPS" value="174.4568"/>
<PlayerStat stat="FullDPS" value="0"/><PlayerStat stat="CritChance" value="17.16"/>
<PlayerStat stat="HitChance" value="100"/><PlayerStat stat="Speed" value="0.1284"/>
<PlayerStat stat="CritMultiplier" value="4.3"/><PlayerStat stat="AccountSecret" value="123"/></Build>
<Items activeItemSet="1"><Item id="1"><![CDATA[${combatRing}]]></Item>
<ItemSet id="1"><Slot name="Ring 1" itemId="1"/></ItemSet><ItemSet id="2"/></Items>
<Skills activeSkillSet="2"><SkillSet id="1"><Skill><Gem nameSpec="Twister" level="18"/></Skill></SkillSet>
<SkillSet id="2"><Skill enabled="false"><Gem nameSpec="Twister" level="18"/></Skill>
<Skill source="Item:1:Test Spear" slot="Weapon 1 Swap"><Gem nameSpec="Spear Throw" level="1"/></Skill>
<Skill enabled="true" mainActiveSkill="1" includeInFullDPS="nil">
<Gem nameSpec="Lightning Spear" gemId="Metadata/Items/Gems/SkillGemLightningSpear" skillId="LightningSpearPlayer" level="18" quality="20" enabled="true" enableGlobal1="true" enableGlobal2="false"/>
<Gem nameSpec="Elemental Armament II" level="2" enabled="true"/>
<Gem nameSpec="Lightning Mastery" level="1" enabled="false"/>
</Skill><Skill source="Tree:11641"><Gem nameSpec="Virtuous Barrier" level="19"/></Skill></SkillSet></Skills>
</PathOfBuilding2>`;
