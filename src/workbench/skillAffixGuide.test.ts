import { expect, it } from 'vitest';
import { loadShippedPatch } from '../../packages/engine/src/loadPatch';
import { loadGearTrade } from '../lib/gearTrade';
import { twisterGuideState } from './fixtures/skillAffixGuide';
import { classifySkillMod, skillPlan } from './skillRecommendation';
import { matchEquipmentStat, parseEquipment } from './genericEquipment';
import { resolveSkillAffixSearch, skillAffixDirections, skillGuideFacts, type SkillAffixSearch } from './skillAffixGuide';
import { equipmentSearchOptions } from './equipmentSearchOptions';
import { equipmentTradeRows } from './genericEquipmentTrade';
import { corePriceAxes, jointCorePriceQuery } from './corePricing';
import { rareAlternative } from './equipmentAffixes';
import { validateEstimate } from '../../tools/workbenchServer';

const data = loadShippedPatch('data/patches/0.5.0'), trade = await loadGearTrade();

it('recognizes projectile speed as damage only with the enabled applicable Acceleration III support', () => {
  const state = twisterGuideState(), speed = matchEquipmentStat('20% increased Projectile Speed');
  expect(classifySkillMod(skillPlan(state)!, speed, { slot: 'amulet' })).toMatchObject({ family: 'projectileSpeed', weight: 5 });
  const group = state.source!.combat!.sets.find((entry) => entry.id === '2')!.groups[2]!;
  group.gems.find((entry) => entry.name === 'Projectile Acceleration III')!.enabled = false;
  expect(classifySkillMod(skillPlan(state)!, speed, { slot: 'amulet' }).weight).toBe(0);
  expect(skillGuideFacts('Twister', skillPlan(state)!.supports).some((entry) => entry.label.includes('投速参与增伤'))).toBe(false);
});

it('finds actual ordinary affix locations and carries a chosen native roll floor into both market sorts', () => {
  const state = twisterGuideState(), before = JSON.stringify(state);
  const directions = skillAffixDirections(state, data, trade), speed = directions.find((entry) => entry.family === 'projectileSpeed')!;
  expect(speed, directions.map((entry) => entry.ref).join('\n')).toBeDefined();
  expect(directions[0]!.family).toBe('projectileSpeed');
  expect(speed.locations.length).toBeGreaterThan(0);
  expect(speed.locations.every((entry) => entry.row.affixType && entry.row.targetTiers?.length)).toBe(true);
  const location = speed.locations[0]!, gem = state.source!.combat!.sets.find((entry) => entry.id === '2')!.groups[2]!.gems[0]!;
  const request: SkillAffixSearch = { selection: { source: 'pob', setId: '2', group: 3, id: gem.id, name: gem.name }, slot: location.slot, baseId: location.baseId, ref: speed.ref, preset: 'tier:1', requiredRune: location.row.requiredRune };
  expect(request.requiredRune).toBe('kolrs-hunt');
  expect(resolveSkillAffixSearch(state, request, data, trade)?.row.scoringRef).toBe(speed.ref);
  const item = rareAlternative(parseEquipment(location.raw)!, data, trade), rows = equipmentSearchOptions(item, equipmentTradeRows(item), data, trade, [speed.ref], [request.requiredRune!]);
  const target = corePriceAxes(item, rows).find((row) => row.scoringRef === speed.ref)!;
  expect(target).toBeDefined();
  for (const overview of [false, true]) {
    const query = jointCorePriceQuery({ equipment: item, league: 'Test', rows }, [{ row: target, preset: 'tier:1' }], target.key, overview).query;
    expect(validateEstimate({ league: 'Test', search: query }).search).toEqual(query);
    expect(JSON.stringify(query)).not.toMatch(/[\u3400-\u9fff]/u);
    expect(query.query.stats.flatMap((entry) => entry.filters).some((filter) => filter.value?.min === location.row.targetFloor!.min)).toBe(true);
  }
  expect(JSON.stringify(state)).toBe(before);
  expect(resolveSkillAffixSearch(state, { ...request, ref: 'invented' }, data, trade)).toBeUndefined();
});

it('keeps Twister hit timing, rage eligibility and enemy resistance inversion explicit instead of fabricating DPS multipliers', () => {
  const plan = skillPlan(twisterGuideState())!, facts = skillGuideFacts(plan.name, plan.supports);
  expect(facts.some((entry) => entry.detail.includes('0.66'))).toBe(true);
  expect(facts.some((entry) => entry.detail.includes('40% more 投速不能直接算成'))).toBe(true);
  expect(facts.some((entry) => entry.label.includes('抗性反转'))).toBe(true);
  expect(plan.warnings.join(' ')).toContain('近战命中');
  expect(facts.every((entry) => entry.url.startsWith('https://'))).toBe(true);
});
