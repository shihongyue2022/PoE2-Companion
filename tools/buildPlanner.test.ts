import { describe, expect, it } from 'vitest';
import { analyzeBuildPlan } from './buildPlanner';
import { profileForSkill, readBuildProfile } from '../src/workbench/buildProfile';
import { compareCandidate, emptyLoadout, serializeLoadout, deserializeLoadout } from '../src/workbench/loadout';
import { loadoutUpgradeRows } from '../src/workbench/loadoutIntegration';
import { equipmentTradeRows } from '../src/workbench/genericEquipmentTrade';
import { parseEquipment } from '../src/workbench/genericEquipment';
const file = { fileName: 'Synthetic.build', modifiedAt: '2026-10-22T10:00:00Z' };
const plan = {
  name: 'Synthetic', ascendancy: 'Mercenary3',
  passives: ['criticals45', 'criticals45', { id: 'evasion21', weapon_set: 2 },
    { id: 'passive_keystone_dance_with_death', level_interval: [80, 100] }, { id: 'unknown-new-node' }, { id: 'criticals46', level_interval: 50 }],
  skills: [{ id: 'Metadata/Items/Gems/SkillGemWhirlingSlash', support_skills: ['Metadata/Items/Gems/SupportGemMartialTempoThree'] },
    { id: 'Metadata/Items/Gem/SkillGemTwister', support_skills: [{ id: 'Metadata/Items/Gem/SupportGemSalvo', level_interval: [90, 100] }] },
    { id: 'Metadata/Items/Gems/SkillGemHeraldOfIce' }],
};
describe('BuildPlanner reference analysis and equipment advice', () => {
  it('joins exact passive and game gem IDs, keeps support tiers and filters stage and weapon set without inventing missing records', () => {
    const result = analyzeBuildPlan(plan, file, 87, 1)!;
    expect(result).toMatchObject({ totalPassives: 3, matchedPassives: 2, unknownPassives: 1, constraints: { emptyOffhand: true } });
    expect(result.skills[0]).toMatchObject({ label: '回旋斩', known: true, supports: [{ known: true }] });
    expect(result.skills[0]!.supports[0]!.id).toContain('MartialTempoThree');
    expect(result.skills[1]).toMatchObject({ label: '旋风', known: true, supports: [] });
    expect(result.warnings.join()).toContain('单值 level_interval');
    expect(analyzeBuildPlan(plan, file, 50, 2)?.constraints.emptyOffhand).toBe(false);
    expect(analyzeBuildPlan({ ...plan, passives: ['constructor'] }, file, 87, 1)?.matchedPassives).toBe(0);
    expect(analyzeBuildPlan({ ...plan, passives: Array(2001).fill('criticals45') }, file, 87, 1)).toBeNull();
  });
  it('separates selected attack groups from persistent buffs, persists valid goals and rejects forged priorities', () => {
    const result = analyzeBuildPlan(plan, file, 87, 1)!;
    const whirling = profileForSkill(result, 'skill:0')!, twister = profileForSkill(result, 'skill:1')!;
    expect(whirling.priorities.some((priority) => priority.family === 'meleeDamage')).toBe(true);
    expect(twister.priorities.some((priority) => priority.family === 'meleeDamage')).toBe(false);
    expect(twister.priorities.some((priority) => priority.family === 'projectileDamage')).toBe(true);
    expect(profileForSkill(result, 'skill:2')).toBeUndefined();
    expect(readBuildProfile(twister)).toEqual(twister);
    expect(readBuildProfile({ ...twister, priorities: [{ family: 'constructor', weight: 999, reason: 'fake' }] })).toBeUndefined();
    const state = emptyLoadout(); state.goals.build = twister;
    expect(deserializeLoadout(serializeLoadout(state)).state?.goals.build).toEqual(twister);
  });
  it('uses BD priorities for matching affixes and warns when a candidate breaks an explicit passive condition', () => {
    const profile = profileForSkill(analyzeBuildPlan(plan, file, 87, 1)!, 'skill:1')!;
    const raw = 'Rarity: RARE\nSynthetic Ring\nGold Ring\n--------\nItem Level: 82\n--------\n12% increased Attack Speed\n+100 to maximum Mana';
    const item = parseEquipment(raw)!;
    const state = { ...emptyLoadout(), slots: { ring1: raw }, goals: { ...emptyLoadout().goals, build: profile } };
    const rows = loadoutUpgradeRows(equipmentTradeRows(item, 'upgrade'), item, { state, raw, slot: 'ring1' });
    expect(rows.find((row) => /攻击速度/.test(row.label))?.weight).toBe('4');
    expect(rows.find((row) => /魔力/.test(row.label))?.weight).toBe('1');
    const candidate = parseEquipment('Rarity: NORMAL\nTwig Focus\n--------\nItem Level: 80')!;
    expect(compareCandidate(state, 'offHand', candidate).warnings.join()).toContain('副手留空');
  });
});
