import { describe, expect, it } from 'vitest';
import { assessDamageGoal, damageGoalRows, enforceDamageGoalRows, resistanceGate, resistanceQueryRows } from './damageGoal';
import { deserializeLoadout, serializeLoadout } from './loadout';
import { equipmentSignature } from './characterPanel';
import { parseEquipment } from './genericEquipment';
import { buildEquipmentTrade, equipmentTradeRows } from './genericEquipmentTrade';
import { parsePobXml } from './pobImport';
import { combatXml } from './fixtures/pobCombat';
import { WEAPON_SAMPLE } from './fixtures/fullGear';
import { BOOTS_SAMPLE } from './fixtures/fullGear';
import { damageRing, damageState } from './fixtures/damageGoal';
describe('capped resistance then damage objective', () => {
  it('migrates old goals to the default damage objective and preserves an explicit custom mode', () => {
    expect(deserializeLoadout(JSON.stringify({ version: 1, slots: {}, goals: { priorities: [], minimums: {} } })).state?.goals.objective).toBe('capped-damage');
    const state = damageState(); state.goals.objective = 'balanced';
    expect(deserializeLoadout(serializeLoadout(state)).state?.goals.objective).toBe('balanced');
  });
  it('does not let life or excess resistance increase damage score, and rejects a higher damage item below any cap', () => {
    const state = damageState(), item = parseEquipment(damageRing)!;
    const rows = damageGoalRows(equipmentTradeRows(item, 'upgrade'), item, state);
    const defensive = parseEquipment(damageRing.replace('+70', '+300').replace('+30%', '+100%'))!;
    expect(assessDamageGoal(state, 'ring1', defensive, rows)).toMatchObject({ damageScore: 100, status: 'unchanged' });
    const unsafe = parseEquipment(damageRing.replace('10%', '50%').replace('+30%', '+5%'))!;
    expect(assessDamageGoal(state, 'ring1', unsafe, rows)).toMatchObject({ status: 'rejected', gate: { status: 'unmet' }, damageScore: 500 });
    const better = parseEquipment(damageRing.replace('10%', '15%').replace('+30%', '+15%'))!;
    expect(assessDamageGoal(state, 'ring1', better, rows)).toMatchObject({ status: 'candidate', gate: { status: 'met' }, damageScore: 150 });
  });
  it('uses each real cap including chaos, allows spending excess and retains stronger requested floors', () => {
    const state = damageState(); state.character!.caps.fireResistance = 80;
    state.goals.minimums.coldResistance = 85;
    const candidate = parseEquipment(damageRing.replace('+30%', '+20%'))!;
    const gate = resistanceGate(state, 'ring1', candidate);
    expect(gate.rows.find((row) => row.key === 'fireResistance')).toMatchObject({ after: 80, cap: 80, met: true });
    expect(gate.rows.find((row) => row.key === 'coldResistance')).toMatchObject({ after: 80, minimum: 85, met: false });
    expect(resistanceGate(state, 'ring1', parseEquipment(damageRing.replace('+12% to Chaos', '+0% to Chaos'))!).status).toBe('unmet');
  });
  it('turns required per-item resistance into locked official pseudo totals and never scores them', () => {
    const state = damageState(), item = parseEquipment(damageRing)!;
    const floors = resistanceQueryRows(state, 'ring1', item);
    expect(floors).toHaveLength(4);
    expect(floors.map((row) => row.min)).toEqual(['15', '15', '15', '12']);
    expect(floors.every((row) => row.locked && row.weight === '0')).toBe(true);
    const rows = enforceDamageGoalRows(equipmentTradeRows(item, 'upgrade').map((row) => ({ ...row, enabled: true, weight: '99' })), item, state, 'ring1');
    const query = buildEquipmentTrade({ equipment: item, league: 'Test', rows, ranking: true }).query;
    const weighted = query.query.stats.find((group) => group.type === 'weight')!;
    expect(weighted.filters.some((filter) => filter.id.startsWith('pseudo.'))).toBe(false);
    expect(query.query.stats.some((group) => group.type === 'and' && group.filters.some((filter) => filter.id === 'pseudo.pseudo_total_fire_resistance' && filter.value?.min === 15))).toBe(true);
    expect(rows.find((row) => /最大生命/.test(row.label))?.weight).toBe('0');
    expect(JSON.stringify(query)).not.toMatch(/[\u3400-\u9fff]/u);
  });
  it('does not infer caps from unknown or stale baselines, effective-only data or changed cap mechanics', () => {
    const state = damageState(), candidate = parseEquipment(damageRing)!;
    expect(resistanceGate({ ...state, slots: {}, character: undefined, source: undefined }, 'ring1', candidate).status).toBe('unknown');
    const sourceOnly = { ...state, character: undefined, source: { ...state.source!, reference: { values: { fireResistance: 90 }, caps: {}, effective: { coldResistance: 75 } } } };
    expect(resistanceGate(sourceOnly, 'ring1', candidate).status).toBe('unknown');
    expect(resistanceGate(state, 'ring1', parseEquipment(`${damageRing}\n+1% to maximum Fire Resistance`)!).status).toBe('unknown');
    expect(resistanceGate(damageState(damageRing.replace('+30% to all Elemental Resistances', '+30% to all Elemental Resistances [PoB数值待游戏文本核对]')), 'ring1', candidate).status).toBe('unknown');
  });
  it('uses the printed weapon DPS once instead of adding local physical and attack speed affixes again', () => {
    const state = damageState(); state.slots = { mainHand: WEAPON_SAMPLE };
    state.character!.equipmentSignature = equipmentSignature(state.slots);
    const current = parseEquipment(WEAPON_SAMPLE)!, candidate = parseEquipment(WEAPON_SAMPLE.replace('100-200', '200-400'))!;
    const rows = damageGoalRows(equipmentTradeRows(current, 'upgrade'), current, state);
    const result = assessDamageGoal(state, 'mainHand', candidate, rows);
    expect(result.basis).toContain('武器面板');
    expect(result.damageScore).toBeCloseTo(175, 3);
    const query = buildEquipmentTrade({ equipment: current, league: 'Test', rows, ranking: true, damageSort: true }).query;
    expect(query.sort).toEqual({ dps: 'desc' });
  });
  it('reads saturated PoB totals from saved overcap but never treats effective-only values as full totals', () => {
    const xml = combatXml.replace('<Build level="87" mainSocketGroup="3">', '<Build level="87" mainSocketGroup="3"><PlayerStat stat="FireResist" value="80"/><PlayerStat stat="FireResistOverCap" value="20"/><PlayerStat stat="ColdResist" value="75"/><PlayerStat stat="ChaosResist" value="57"/><PlayerStat stat="ChaosResistOverCap" value="0"/>');
    const ref = parsePobXml(xml).profile!.reference!;
    expect(ref.values.fireResistance).toBe(100); expect(ref.caps.fireResistance).toBe(80);
    expect(ref.values.coldResistance).toBeUndefined(); expect(ref.values.chaosResistance).toBe(57); expect(ref.caps.chaosResistance).toBeUndefined();
  });
  it('keeps a defensive-only slot searchable without inventing a life/resistance damage score', () => {
    const state = damageState(), boots = parseEquipment(BOOTS_SAMPLE)!;
    const rows = damageGoalRows(equipmentTradeRows(boots, 'upgrade'), boots, state);
    const query = buildEquipmentTrade({ equipment: boots, league: 'Test', rows, ranking: true, constraintOnly: true });
    expect(query.query.sort).toEqual({ price: 'asc' });
    expect(query.query.query.stats.some((group) => group.type === 'weight')).toBe(false);
    expect(query.warnings.join(' ')).toContain('伤害收益需要 PoB2');
  });
});
