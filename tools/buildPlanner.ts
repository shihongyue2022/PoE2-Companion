import vocabulary from '../src/workbench/data/build-planner-index.json';
import type { BuildAnalysis, BuildFamily, BuildSkill } from '../src/workbench/buildProfile';
interface Node { name: string; stats: Record<string, number>; text: string[]; keystone?: boolean }
interface Gem { name: string; label: string; tags: string[]; weapon?: string }
const index = vocabulary as unknown as { nodes: Record<string, Node>; skills: Record<string, Gem>; aliases: Record<string, Gem> };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown, max = 500) => typeof value === 'string' ? value.slice(0, max) : undefined;
const idOf = (value: unknown) => typeof value === 'string' ? value.slice(0, 300) : record(value) ? string(value.id, 300) : undefined;
const lookup = <T>(table: Record<string, T>, id: string): T | undefined => Object.prototype.hasOwnProperty.call(table, id) ? table[id] : undefined;
const gem = (id: string) => lookup(index.skills, id) ?? (/^Metadata\/Items\/Gems?\//.test(id) ? lookup(index.aliases, id.split('/').pop()!) : undefined);
function active(value: unknown, level: number, weaponSet: number): boolean {
  if (!record(value)) return typeof value === 'string';
  if (value.weapon_set !== undefined && value.weapon_set !== 0 && value.weapon_set !== weaponSet) return false;
  const range = value.level_interval;
  if (range === undefined) return true;
  // The docs allow a uint but do not specify whether it is a starting level or
  // a single level. Do not fold an unverified stage into a recommendation.
  if (typeof range === 'number') return false;
  return Array.isArray(range) && range.length === 2 && range.every((bound) => Number.isInteger(bound) && bound >= 0 && bound <= 100)
    && range[0] <= range[1] && level >= range[0] && level <= range[1];
}
const families: Partial<Record<BuildFamily, RegExp>> = {
  critChance: /critical_strike_chance|attack_additional_critical_strike_chance/,
  critDamage: /critical_strike_multiplier/,
  energyShield: /maximum_energy_shield|global_armour_evasion_energy_shield/,
  evasion: /evasion_rating|global_armour_evasion_energy_shield/,
  armour: /physical_damage_reduction_rating|global_armour_evasion_energy_shield/,
  life: /^maximum_life/, mana: /^(?:maximum_mana|base_damage_removed_from_mana_before_life_%)/,
};
export function analyzeBuildPlan(value: unknown, file: { fileName: string; modifiedAt: string }, level: number, weaponSet: number): BuildAnalysis | null {
  if (!record(value) || !Array.isArray(value.passives) || !Array.isArray(value.skills) || value.passives.length > 2000 || value.skills.length > 100) return null;
  const warnings: string[] = [];
  if ([...value.passives, ...value.skills].some((entry) => record(entry) && typeof entry.level_interval === 'number')) warnings.push('含单值 level_interval：等级语义尚未核验，这些记录未用于建议。');
  const signalMap = new Map<BuildFamily, { count: number; evidence: string[] }>();
  const nodes = [...new Set(value.passives.filter((entry) => active(entry, level, weaponSet)).map(idOf).filter((id): id is string => !!id))];
  const resolved = nodes.flatMap((id) => { const node = lookup(index.nodes, id); return node ? [{ id, ...node }] : []; });
  for (const [family, pattern] of Object.entries(families) as [BuildFamily, RegExp][]) for (const node of resolved) {
    if (!Object.entries(node.stats).some(([stat, number]) => number > 0 && pattern.test(stat))) continue;
    const signal = signalMap.get(family) ?? { count: 0, evidence: [] }; signal.count++;
    if (signal.evidence.length < 4) signal.evidence.push(`${node.id} · ${node.name}`);
    signalMap.set(family, signal);
  }
  const skills: BuildSkill[] = value.skills.flatMap((entry, position) => {
    if (!active(entry, level, weaponSet)) return [];
    const id = idOf(entry); if (!id) return [];
    const match = gem(id);
    const supports = (record(entry) && Array.isArray(entry.support_skills) ? entry.support_skills.slice(0, 20) : [])
      .filter((support) => active(support, level, weaponSet)).flatMap((support) => {
        const id = idOf(support); if (!id) return [];
        const matched = gem(id); return [{ id, label: matched?.label ?? id.split('/').pop()!, known: !!matched }];
      });
    return [{ key: `skill:${position}`, id, label: match?.label ?? id.split('/').pop()!, tags: match?.tags ?? [], weapon: match?.weapon, known: !!match, supports }];
  });
  const unknownPassives = nodes.length - resolved.length;
  if (unknownPassives) warnings.push(`${unknownPassives} 条当前阶段的天赋 ID 未匹配，未用于建议。`);
  const unknownSkills = skills.filter((skill) => !skill.known).length + skills.reduce((sum, skill) => sum + skill.supports.filter((support) => !support.known).length, 0);
  if (unknownSkills) warnings.push(`${unknownSkills} 个技能／辅助 ID 未匹配，保留原 ID 供核对。`);
  const stat = (key: string) => resolved.some((node) => (node.stats[key] ?? 0) > 0);
  const hints = (Array.isArray(value.inventory_slots) ? value.inventory_slots.slice(0, 30) : []).filter((entry) => active(entry, level, weaponSet)).flatMap((entry) => {
    if (!record(entry) || typeof entry.inventory_id !== 'string') return [];
    return [{ slot: entry.inventory_id.slice(0, 100), unique: string(entry.unique_name, 200), text: string(entry.additional_text, 2000) }];
  });
  return { ...file, name: string(value.name, 200) ?? file.fileName, author: string(value.author, 200), ascendancy: string(value.ascendancy, 100), level, weaponSet, skills,
    totalPassives: nodes.length, matchedPassives: resolved.length, unknownPassives,
    signals: [...signalMap].map(([family, signal]) => ({ family, ...signal })),
    constraints: { emptyOffhand: stat('keystone_dance_with_death'), helmetEsEvasion: stat('evasion_rating_+_per_1_helmet_energy_shield'),
      gemColours: stat('movement_speed_penalty_+%_final_while_performing_action_if_green_support_count_highest'), manaBeforeLife: stat('base_damage_removed_from_mana_before_life_%') },
    keystones: resolved.filter((node) => node.keystone).map((node) => ({ name: node.name, text: node.text })), hints, warnings };
}
