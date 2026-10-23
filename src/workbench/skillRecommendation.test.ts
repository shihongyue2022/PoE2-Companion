import { describe, expect, it } from 'vitest';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch';
import { loadGearTrade } from '../lib/gearTrade';
import { damageState, damageRing } from './fixtures/damageGoal';
import { classifySkillMod, mainSkillChoices, mergeSkillTargetRows, readMainSkillSelection, skillPlan, skillTargetRows } from './skillRecommendation';
import { parseEquipment, matchEquipmentStat } from './genericEquipment';
import { equipmentTradeRows, buildEquipmentTrade } from './genericEquipmentTrade';
import { assessDamageGoal, enforceDamageGoalRows } from './damageGoal';
import { scoreUpgrade, upgradeComponents } from './upgradeRanking';
import { deserializeLoadout, serializeLoadout, compareCandidate } from './loadout';
import type { BuildProfile } from './buildProfile';
import { parsePobXml } from './pobImport';
import { combatXml } from './fixtures/pobCombat';

const data = loadShippedPatch('data/patches/0.5.0'), trade = await loadGearTrade();
const fireProfile = (): BuildProfile => ({ version: 1, fileName: 'test.build', name: 'Fire Spell', modifiedAt: new Date().toISOString(), level: 87, weaponSet: 1,
  main: { key: 'fire', id: 'Metadata/Items/Gems/SkillGemFireball', label: '火球', tags: ['spell', 'fire', 'projectile'], known: true, supports: [] },
  priorities: [{ family: 'spellDamage', weight: 5, reason: '参考 BD 法术天赋' }, { family: 'critChance', weight: 5, reason: '参考 BD 暴击天赋' }], metrics: [],
  constraints: { emptyOffhand: false, helmetEsEvasion: false, gemColours: false, manaBeforeLife: false }, matchedPassives: 10, unknownPassives: 0, warnings: [] });
describe('BD and main output skill recommendations', () => {
  it('resolves the active main and supports and keeps verified physical conversion relevant', () => {
    const state = damageState(), plan = skillPlan(state)!;
    expect(plan).toMatchObject({ name: 'Lightning Spear', label: '闪电长矛', weapon: 'Spear', crit: true });
    expect(plan.notes.join(' ')).toContain('80%');
    expect(classifySkillMod(plan, matchEquipmentStat('30% increased Physical Damage'), { slot: 'ring' })).toMatchObject({ weight: 1 });
    expect(classifySkillMod(plan, { ref: '#% increased Physical Damage', statId: 'local_physical_damage_+%' }, { slot: 'weapon' })).toMatchObject({ weight: 4 });
    expect(classifySkillMod(plan, matchEquipmentStat('30% increased Melee Damage'), { slot: 'ring' }).weight).toBe(0);
    expect(classifySkillMod(plan, matchEquipmentStat('30% increased Spell Damage'), { slot: 'ring' }).weight).toBe(0);
    expect(classifySkillMod(plan, matchEquipmentStat('Adds 10 to 20 Lightning Damage to Attacks'), { slot: 'ring' }).weight).toBeGreaterThan(classifySkillMod(plan, matchEquipmentStat('Adds 10 to 20 Fire Damage to Attacks'), { slot: 'ring' }).weight);
  });
  it('generates achievable new affix directions absent from the current item, without requiring all of them', () => {
    const state = damageState(), item = parseEquipment(damageRing)!;
    const targets = skillTargetRows(item, state, data, trade);
    expect(targets.length).toBeGreaterThan(2);
    expect(targets.some((row) => row.suggested && row.actualValue === 0 && /Lightning/.test(row.scoringRef ?? ''))).toBe(true);
    expect(targets.every((row) => row.referenceScale && row.recommendation && row.targetRange)).toBe(true);
    const rows = enforceDamageGoalRows(mergeSkillTargetRows(equipmentTradeRows(item, 'upgrade'), targets, item), item, state, 'ring1');
    const query = buildEquipmentTrade({ equipment: item, rows, league: 'Test', ranking: true }).query;
    expect(query.query.stats[0]?.type).toBe('weight');
    const required = query.query.stats.filter((group) => group.type !== 'weight').flatMap((group) => group.filters.map((filter) => filter.id));
    expect(targets.filter((row) => row.suggested).every((row) => row.ids.every((id) => !required.includes(id)))).toBe(true);
    expect(JSON.stringify(query)).not.toMatch(/[\u3400-\u9fff]/u);
    const candidate = parseEquipment(`${damageRing}\nAdds 20 to 30 Lightning Damage to Attacks\n30% increased Lightning Damage`)!;
    const scored = scoreUpgrade(candidate, upgradeComponents(rows));
    expect(scored.score).toBeGreaterThan(scored.baselineScore);
    const assessment = assessDamageGoal(state, 'ring1', candidate, rows);
    expect(assessment.status).toBe('candidate');
    expect(compareCandidate(state, 'ring1', candidate, { damageRows: rows }).damageGoal?.damageScore).toBe(assessment.damageScore);
  });
  it('applies BD spell weights and disables attack-only affixes and impossible critical directions', () => {
    const state = damageState(); state.goals.build = fireProfile();
    let plan = skillPlan(state)!;
    expect(plan.label).toBe('火球'); expect(plan.priorities.find((entry) => entry.family === 'spellDamage')?.weight).toBe(5);
    expect(classifySkillMod(plan, matchEquipmentStat('10% increased Attack Speed'), { slot: 'ring' }).weight).toBe(0);
    expect(classifySkillMod(plan, matchEquipmentStat('Adds 10 to 20 Lightning Damage'), { slot: 'weapon' }).weight).toBe(0);
    state.goals.build.offense = { cannotCrit: true };
    plan = skillPlan(state)!;
    expect(plan.crit).toBe(false);
    expect(classifySkillMod(plan, matchEquipmentStat('30% increased Critical Hit Chance'), { slot: 'ring' }).weight).toBe(0);
    const item = parseEquipment(damageRing)!;
    expect(skillTargetRows(item, state, data, trade).every((row) => !/Attack Speed|Critical/.test(row.scoringRef ?? ''))).toBe(true);
  });
  it('allows an explicit PoB main choice without borrowing another BD skill weights, and rejects stale selection identities', () => {
    const state = damageState(); state.goals.build = { ...fireProfile(), offense: { cannotCrit: true } };
    const choice = mainSkillChoices(state).find((entry) => entry.key === 'pob:2:3')!;
    expect(choice).toBeDefined(); state.goals.mainSkill = choice.selection;
    expect(skillPlan(state)).toMatchObject({ label: '闪电长矛', crit: true });
    expect(skillPlan(state)!.warnings.join(' ')).toContain('未混用');
    const restored = deserializeLoadout(serializeLoadout(state)).state!;
    expect(restored.goals.mainSkill).toEqual(choice.selection);
    state.goals.mainSkill = { ...choice.selection, id: 'another-skill' };
    expect(skillPlan(state)).toBeUndefined();
    expect(readMainSkillSelection({ source: 'pob', setId: '2', group: 99999, id: '', name: '' })).toBeUndefined();
  });
  it('does not fabricate ordinary affix targets on a unique or an unknown base', () => {
    const state = damageState();
    expect(skillTargetRows(parseEquipment('Rarity: Unique\nIgniferis\nCrimson Amulet\n--------\n+17% to Fire Resistance')!, state, data, trade)).toEqual([]);
    expect(skillTargetRows({ ...parseEquipment(damageRing)!, baseNameEnglish: 'Unknown Base' }, state, data, trade)).toEqual([]);
  });
  it('uses only enabled applicable supports when deciding whether a spell can crit', () => {
    for (const enabled of [true, false]) {
      const state = damageState();
      state.source!.combat = parsePobXml(combatXml.replace('nameSpec="Lightning Spear"', 'nameSpec="Fireball"').replace('SkillGemLightningSpear', 'SkillGemFireball').replace('LightningSpearPlayer', 'FireballPlayer')
        .replace('nameSpec="Elemental Armament II" level="2" enabled="true"', `nameSpec="Controlled Destruction" level="1" enabled="${enabled}"`)).profile!.combat;
      const plan = skillPlan(state)!;
      expect(plan.name).toBe('Fireball');
      expect(plan.crit).toBe(!enabled);
      expect(plan.supports.some((support) => support.name === 'Controlled Destruction')).toBe(enabled);
    }
  });
});
