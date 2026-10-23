import { activeGems, gemInfo, mainGem } from './pobCombat';
import { equipmentStatAliases, matchEquipmentStat, type Equipment, type EquipmentMod } from './genericEquipment';
import type { LoadoutState } from './loadout';
import type { PatchData, Mod } from '../../packages/engine/src/types';
import { TRADE_CATEGORY, type GearTrade } from '../lib/gearTrade';
import { tradeLineRangeMapping } from './tradeSearch';
import { referenceFor } from './equipmentT1';
import type { EquipmentTradeRow } from './genericEquipmentTrade';
import { activeSecondWeapons } from './weaponSets';

export interface MainSkillSelection { source: 'bd' | 'pob'; setId?: string; group?: number; id?: string; name?: string }
export interface SkillChoice { key: string; selection: MainSkillSelection; label: string }
export interface SkillPlan {
  label: string; name: string; tags: string[]; weapon?: string; source: string;
  supports: { name: string; label: string }[]; elements: string[]; crit: boolean;
  priorities: { family: string; weight: number; reason: string }[];
  notes: string[]; warnings: string[]; key: string;
}
const elementNames: Record<string, string> = { fire: '火焰', cold: '冰冷', lightning: '闪电', physical: '物理', chaos: '混沌' };
export function mainSkillChoices(state: LoadoutState): SkillChoice[] {
  const choices: SkillChoice[] = [];
  if (state.goals.build) choices.push({ key: 'bd', selection: { source: 'bd' }, label: `参考 BD · ${state.goals.build.main.label}` });
  for (const set of state.source?.combat?.sets ?? []) for (const group of set.groups) {
    const gem = activeGems(group, activeSecondWeapons(state)).find((entry) => !gemInfo(entry).support);
    if (!gem) continue;
    const info = gemInfo(gem);
    if (!info.tags.some((tag) => ['attack', 'spell', 'minion'].includes(tag)) || info.tags.includes('buff') || info.tags.includes('persistent') && !info.tags.includes('minion')) continue;
    choices.push({ key: `pob:${set.id}:${group.index}`, selection: { source: 'pob', setId: set.id, group: group.index, id: gem.id || gem.skillId, name: gem.name }, label: `${info.label} · PoB2 第 ${group.index} 组 · 等级 ${gem.level}` });
  }
  return choices;
}
export function readMainSkillSelection(value: unknown): MainSkillSelection | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Record<string, unknown>;
  if (row.source === 'bd') return { source: 'bd' };
  if (row.source !== 'pob' || typeof row.setId !== 'string' || row.setId.length > 100 || typeof row.group !== 'number' || !Number.isInteger(row.group) || row.group < 1 || row.group > 100
    || typeof row.id !== 'string' || row.id.length > 300 || typeof row.name !== 'string' || row.name.length > 200) return undefined;
  return { source: 'pob', setId: row.setId, group: row.group, id: row.id, name: row.name };
}
export function skillPlan(state: LoadoutState): SkillPlan | undefined {
  const selected = state.goals.mainSkill, bd = state.goals.build, combat = state.source?.combat;
  const fromBd = selected?.source === 'bd' || !selected && !!bd;
  let name: string, label: string, tags: string[], weapon: string | undefined, supports: SkillPlan['supports'], key: string, source: string;
  if (fromBd) {
    if (!bd) return undefined;
    const info = gemInfo({ id: bd.main.id, name: '', skillId: '' });
    name = info.name; label = bd.main.label; tags = bd.main.tags; weapon = bd.main.weapon || info.weapon;
    supports = bd.main.supports.map((support) => ({ name: gemInfo({ id: support.id, name: '', skillId: '' }).name, label: support.label }));
    key = 'bd'; source = '已采用的参考 BD';
  } else {
    if (!combat) return undefined;
    const set = combat.sets.find((entry) => entry.id === (selected?.setId ?? combat.activeSet));
    const group = set?.groups.find((entry) => entry.index === (selected?.group ?? combat.mainGroup));
    const gem = selected ? group?.gems.find((entry) => (entry.id || entry.skillId) === selected.id && entry.name === selected.name && !gemInfo(entry).support) : mainGem(combat);
    if (!group || !gem || !activeGems(group, activeSecondWeapons(state)).includes(gem)) return undefined;
    const info = gemInfo(gem); if (!info.known) return undefined;
    name = info.name; label = info.label; tags = info.tags; weapon = info.weapon;
    supports = activeGems(group, activeSecondWeapons(state)).filter((entry) => gemInfo(entry).support).map((entry) => ({ name: gemInfo(entry).name, label: gemInfo(entry).label }));
    key = `pob:${set!.id}:${group.index}`; source = selected ? '你指定的 PoB2 主输出技能' : 'PoB2 保存的主技能';
  }
  const elements = tags.filter((tag) => Object.prototype.hasOwnProperty.call(elementNames, tag)), notes: string[] = [], warnings: string[] = [];
  // Exact, versioned PoB facts; never infer a conversion percentage from a skill's name/tag.
  if (name === 'Lightning Spear') notes.push('PoB2 v0.23.1 的闪电长矛主长矛部分有 80% 基础物理转闪电；物理可作为转伤来源，闪电标签不代表最终伤害占比。');
  const sameBd = fromBd || bd?.main.label === label;
  const sameSavedSkill = !fromBd && activeSecondWeapons(state) === (state.source?.secondWeapons ?? false) && (!selected || selected.group === combat?.mainGroup && selected.setId === combat?.activeSet);
  const cannotCrit = tags.includes('spell') && supports.some((support) => support.name === 'Controlled Destruction') || sameBd && bd?.offense?.cannotCrit === true;
  if (cannotCrit) notes.push('已识别无法暴击的辅助／参考天赋，暴击词缀不参与此推荐。');
  const priorities: SkillPlan['priorities'] = [];
  const add = (family: string, weight: number, reason: string) => priorities.push({ family, weight, reason });
  if (tags.includes('attack')) { add('attackDamage', 4, `${label}是攻击技能，考虑武器与攻击附加伤害。`); add('attackSpeed', 4, '攻击速度方向；不把它换算成最终 DPS 百分比。'); }
  if (tags.includes('spell')) { add('spellDamage', 4, `${label}是法术，排除武器局部攻击伤害。`); add('castSpeed', 3, '施法速度方向，触发／冷却配置仍需核对。'); }
  if (tags.includes('projectile')) add('projectileDamage', 3, '主输出带投射物标签；投射物速度不等于伤害。');
  if (tags.includes('melee')) add('meleeDamage', 3, '主输出带近战标签。');
  if (tags.includes('minion')) add('minionDamage', 4, '召唤物伤害与角色自身攻击／法术伤害分开。');
  if (!cannotCrit && (sameSavedSkill && (combat?.stats.CritChance ?? 0) > 0 || sameBd && bd?.priorities.some((entry) => entry.family.startsWith('crit')))) {
    add('critChance', 3, '保存伤害或参考 BD 有暴击方向。'); add('critDamage', 3, '与已识别的暴击方向配合。');
  }
  add('skillLevels', 2, '仅考虑主输出相关技能等级；这是检索偏好，不是每级线性 DPS。');
  for (const priority of priorities) {
    const signal = bd?.priorities.find((entry) => entry.family === priority.family);
    if (signal && (!selected || selected.source === 'bd' || bd?.main.label === label)) { priority.weight = Math.max(priority.weight, signal.weight); priority.reason += ` 参考 BD：${signal.reason}`; }
  }
  if (bd && bd.main.label !== label) warnings.push(`当前指定技能为${label}，参考 BD 主技能为${bd.main.label}；未混用其暴击与伤害天赋权重。`);
  if (!fromBd && (state.source?.combat?.matchesEquipment === false || activeSecondWeapons(state) !== state.source?.secondWeapons)) warnings.push('技能来自另一装备快照或武器组，推荐方向可参考，最终收益需要更新 PoB2。');
  return { label, name, tags, weapon, supports, source, elements, crit: priorities.some((entry) => entry.family === 'critChance'), priorities, notes, warnings, key };
}

export function classifySkillMod(plan: SkillPlan, mod: Pick<EquipmentMod, 'ref' | 'statId'>, equipment: Pick<Equipment, 'slot'>): { weight: number; family: string; reason: string } {
  const ref = mod.ref ?? '', attack = plan.tags.includes('attack'), spell = plan.tags.includes('spell'), minion = plan.tags.includes('minion');
  const reject = (reason: string) => ({ weight: 0, family: '', reason });
  if (!ref || /Requirements|Cost|Duration|Damage taken|\bper\b|\bfor each\b|\bwhile\b|\bif\b|\bwhen\b|Recently|Nearby|During|Allies/i.test(ref)) return reject('条件／机制需单独核对，不按无条件伤害加分。');
  if (/Minion/i.test(ref)) return minion ? { weight: 4, family: 'minionDamage', reason: '主输出是召唤物，匹配召唤物属性。' } : reject('主输出未识别为召唤物。');
  if (minion) return reject('角色自身伤害不能直接当成召唤物伤害。');
  let family = '';
  if (/Level.*(?:Attack|Spell|Projectile|Melee|Fire|Cold|Lightning|Chaos|Physical|Skill)|Level of all/i.test(ref)) {
    if (/Attack/i.test(ref) && !attack || /Spell/i.test(ref) && !spell || /Projectile/i.test(ref) && !plan.tags.includes('projectile') || /Melee/i.test(ref) && !plan.tags.includes('melee')) return reject('技能等级类别与主输出不匹配。');
    const element = /\b(Fire|Cold|Lightning|Chaos|Physical)\b/.exec(ref)?.[1]?.toLowerCase();
    if (element && !plan.elements.includes(element)) return reject('元素技能等级与主技能标签不匹配。');
    family = 'skillLevels';
  } else if (/Critical (?:Damage|Hit|Strike)/i.test(ref)) {
    if (!plan.crit) return reject('当前未采用暴击方向，或存在无法暴击机制。');
    if (spell && equipment.slot === 'weapon' && mod.statId?.startsWith('local_')) return reject('武器局部暴击不是法术暴击。');
    family = /(?:Damage|Multiplier)/i.test(ref) ? 'critDamage' : 'critChance';
  } else if (/Attack Speed/i.test(ref)) family = attack ? 'attackSpeed' : '';
  else if (/Cast Speed/i.test(ref)) family = spell ? 'castSpeed' : '';
  else if (/Projectile Damage/i.test(ref)) family = plan.tags.includes('projectile') ? 'projectileDamage' : '';
  else if (/Melee Damage/i.test(ref)) family = plan.tags.includes('melee') ? 'meleeDamage' : '';
  else if (/Spell Damage/i.test(ref)) family = spell ? 'spellDamage' : '';
  else if (/^Adds # to # .+ Damage(?: to Attacks)?$/i.test(ref)) family = attack ? 'attackDamage' : '';
  else if (/^Adds # to # .+ Damage to Spells$/i.test(ref)) family = spell ? 'spellDamage' : '';
  else if (/increased (?:Physical|Elemental|Fire|Cold|Lightning|Chaos|Attack) Damage/i.test(ref)) {
    if (/Attack/i.test(ref) && !attack || spell && equipment.slot === 'weapon' && mod.statId?.startsWith('local_')) return reject('武器局部攻击词缀不作用于该法术方向。');
    family = attack ? 'attackDamage' : spell ? 'spellDamage' : '';
  }
  const priority = plan.priorities.find((entry) => entry.family === family);
  if (!priority) return reject('未匹配主输出的伤害方向。');
  const element = /\b(Fire|Cold|Lightning|Chaos|Physical)\b/.exec(ref)?.[1]?.toLowerCase();
  if (element && !plan.elements.includes(element)) {
    if (element === 'physical' && plan.name === 'Lightning Spear') return { weight: priority.weight, family, reason: '物理是闪电长矛已核对的转伤来源；不是最终物理伤害占比。' };
    return { weight: 1, family, reason: `非主标签${elementNames[element]}方向，可能有旁路收益，低权重候选需 PoB2 核对。` };
  }
  return { weight: priority.weight, family, reason: `${plan.label}：${priority.reason}` };
}

/** Derive possible scalar affixes from the actual base pool, never from the old item's affix list. */
export function skillTargetRows(equipment: Equipment, state: LoadoutState, data?: PatchData, trade?: GearTrade): EquipmentTradeRow[] {
  const plan = skillPlan(state); if (!plan || !data || !trade || equipment.rarity === 'unique') return [];
  const base = [...data.bases.values()].find((entry) => TRADE_CATEGORY[entry.category] === equipment.category && entry.bases?.some((name) => name.toLowerCase() === equipment.baseNameEnglish?.toLowerCase()));
  if (!base) return [];
  const ids = [...new Set([...base.pools.normal.prefixes, ...base.pools.normal.suffixes])];
  const pool = ids.flatMap((id) => data.mods.get(id) ?? []), found = new Map<string, EquipmentTradeRow>();
  for (const entry of pool) {
    if (entry.source !== 'normal' || entry.rune) continue;
    const tier = entry.tiers.at(-1); if (!tier) continue;
    for (const [line, mapping] of (trade.mods[entry.id] ?? []).entries()) {
      if (!mapping) continue;
      const shared = trade.rows[mapping[0]]; if (!shared?.ids.length) continue;
      const layout = tradeLineRangeMapping(entry, mapping, line);
      const mod = probeTier(entry, line, layout.first, layout.count);
      if (!mod || !mod.searchable || !mod.ref || (mod.value ?? 0) <= 0) continue;
      const priority = classifySkillMod(plan, mod, equipment); if (!priority.weight) continue;
      const reference = referenceFor(mod, pool, data, trade);
      if (reference.status !== 't1' || !reference.roll || reference.roll.max <= 0) continue;
      const original = equipment.mods.filter((row) => row.ref === mod.ref);
      const baseline = original.reduce((sum, row) => sum + (row.value ?? 0), 0);
      found.set(mod.ref, { key: original.length === 1 ? `mod:${original[0]!.key}` : `bd:${mod.ref}`, label: original.length === 1 ? original[0]!.label : mod.label.replace(/[+-]?\d+(?:\.\d+)?/g, '#'), ids: equipmentStatAliases(mod.ref, mod.ids, ['implicit', 'enchant', 'rune']), enabled: true,
        min: '', max: '', actualValue: baseline, weight: String(priority.weight), scoringRef: mod.ref,
        referenceScale: reference.roll.max, suggested: !original.length, recommendation: priority.reason,
        targetRange: reference.roll, targetFloor: { min: reference.min, max: reference.max }, targetPatch: data.patch,
        targetTiers: reference.tiers, affixType: entry.type, affixFamily: entry.family });
    }
  }
  return [...found.values()].sort((a, b) => Number(b.weight) - Number(a.weight)).slice(0, 12);
}
export function mergeSkillTargetRows(rows: EquipmentTradeRow[], targets: EquipmentTradeRow[], equipment: Equipment) {
  if (!targets.length) return rows;
  const references = new Set(targets.map((row) => row.scoringRef));
  return [...rows.filter((row) => {
    const mod = equipment.mods.find((entry) => `mod:${entry.key}` === row.key);
    return !references.has(mod?.ref ?? row.scoringRef);
  }), ...targets];
}
export function skillWeaponWarning(plan: SkillPlan, equipment: Equipment): string | undefined {
  if (equipment.slot !== 'weapon' || !plan.weapon) return undefined;
  const categories: Record<string, string> = { Spear: 'weapon.spear', Bow: 'weapon.bow', Crossbow: 'weapon.crossbow', Wand: 'weapon.wand', Sceptre: 'weapon.sceptre', Staff: 'weapon.staff', Quarterstaff: 'weapon.warstaff' };
  const expected = categories[plan.weapon];
  return expected && equipment.category !== expected ? `${plan.label}需要${plan.weapon}类别，候选武器类别不匹配。` : undefined;
}
function probeTier(mod: Mod, line: number, first: number, count: number) {
  const tier = mod.tiers.at(-1)!;
  const ranges = tier.ranges.slice(first, first + count);
  if (!count || ranges.length !== count) return undefined;
  let at = 0, template = mod.text?.split('\n')[line] ?? '';
  if (count === 2 && /^Adds (?:#|\d+) to (?:#|\d+)/i.test(template)) template = template.replace(/^Adds (?:#|\d+) to (?:#|\d+)/i, 'Adds # to #');
  return { ...matchEquipmentStat(template.replace(/#/g, () => String(ranges[at++]?.[1] ?? NaN))), affixType: mod.type };
}
