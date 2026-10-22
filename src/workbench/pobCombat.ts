import index from './data/pob-gem-index.json';
import { localizeEquipmentName } from './genericEquipment';

export interface PobGem {
  id: string; skillId: string; name: string; level: number; quality: number;
  enabled: boolean; weapon1: boolean; weapon2: boolean;
}
export interface PobSkillGroup {
  index: number; label: string; enabled: boolean; mainActive: number; fullDps: boolean;
  source: 'gem' | 'item' | 'tree'; slot: string; gems: PobGem[];
}
export interface PobSkillSet { id: string; title: string; groups: PobSkillGroup[] }
export const COMBAT_STATS = ['AverageDamage', 'Speed', 'CritChance', 'CritMultiplier', 'HitChance',
  'TotalDPS', 'TotalDot', 'TotalDotDPS', 'IgniteDPS', 'BleedDPS', 'PoisonDPS', 'TotalPoisonDPS',
  'CombinedDPS', 'FullDPS', 'FullDotDPS', 'CullingDPS', 'ReservationDPS'] as const;
export type CombatStat = typeof COMBAT_STATS[number];
export interface PobCombat {
  sets: PobSkillSet[]; activeSet: string; mainGroup: number;
  stats: Partial<Record<CombatStat, number>>;
  fullSkills: { name: string; dps: number }[];
  matchesEquipment: boolean;
}
type GemDefinition = [string, string, boolean, string[], string];
const definitions = index.gems as unknown as Record<string, GemDefinition>;
const byName = new Map(Object.values(definitions).map((definition) => [definition[0], definition]));
export function gemInfo(gem: Pick<PobGem, 'id' | 'name' | 'skillId'>) {
  const definition = definitions[gem.id] ?? byName.get(gem.name);
  return { label: definition?.[1] || localizeEquipmentName(gem.name), support: definition?.[2] ?? /Support/i.test(gem.id || gem.skillId),
    tags: definition?.[3] ?? [], known: !!definition, name: definition?.[0] || gem.name, weapon: definition?.[4] || undefined };
}
export function activeGems(group: PobSkillGroup, secondWeapons: boolean): PobGem[] {
  if (!group.enabled || (group.slot.endsWith(' Swap') ? !secondWeapons : group.slot.startsWith('Weapon ') && secondWeapons)) return [];
  return group.gems.filter((gem) => gem.enabled && (secondWeapons ? gem.weapon2 : gem.weapon1));
}
export function mainGem(combat: PobCombat): PobGem | undefined {
  const group = combat.sets.find((set) => set.id === combat.activeSet)?.groups.find((entry) => entry.index === combat.mainGroup);
  return group?.gems.filter((gem) => !gemInfo(gem).support)[group.mainActive - 1];
}
const children = (element: Element | undefined, name: string) => element ? [...element.children].filter((child) => child.tagName === name) : [];
const bounded = (value: string | null, fallback: number, min: number, max: number) => {
  const number = value === null || value === 'nil' || value === '' ? NaN : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
};
export function parsePobCombat(root: Element): PobCombat | undefined {
  const skills = children(root, 'Skills')[0], build = children(root, 'Build')[0];
  if (!skills) return undefined;
  const sets = children(skills, 'SkillSet');
  const result: PobCombat = {
    activeSet: (skills.getAttribute('activeSkillSet') ?? sets[0]?.getAttribute('id') ?? '1').slice(0, 100),
    mainGroup: Math.trunc(bounded(build?.getAttribute('mainSocketGroup') ?? build?.getAttribute('mainSkillIndex') ?? null, 1, 1, 100)),
    matchesEquipment: true, stats: {}, fullSkills: [],
    sets: (sets.length ? sets : [skills]).slice(0, 20).map((set, index) => ({
      id: (set.getAttribute('id') ?? String(index + 1)).slice(0, 100), title: (set.getAttribute('title') ?? '').slice(0, 200),
      groups: children(set, 'Skill').slice(0, 100).map((group, i) => ({
        index: i + 1, label: (group.getAttribute('label') ?? '').slice(0, 200), enabled: group.getAttribute('enabled') !== 'false',
        mainActive: Math.trunc(bounded(group.getAttribute('mainActiveSkill'), 1, 1, 20)), fullDps: group.getAttribute('includeInFullDPS') === 'true',
        source: group.getAttribute('source')?.startsWith('Item:') ? 'item' : group.getAttribute('source')?.startsWith('Tree:') ? 'tree' : 'gem',
        slot: (group.getAttribute('slot') ?? '').slice(0, 100),
        gems: children(group, 'Gem').slice(0, 20).map((gem) => ({
          id: (gem.getAttribute('gemId') ?? '').slice(0, 300), skillId: (gem.getAttribute('skillId') ?? '').slice(0, 300),
          name: (gem.getAttribute('nameSpec') ?? '').slice(0, 200),
          level: bounded(gem.getAttribute('level'), 1, 1, 100), quality: bounded(gem.getAttribute('quality'), 0, 0, 200),
          enabled: gem.getAttribute('enabled') !== 'false', weapon1: gem.getAttribute('enableGlobal1') !== 'false', weapon2: gem.getAttribute('enableGlobal2') !== 'false',
        })),
      })),
    })),
  };
  for (const stat of children(build, 'PlayerStat')) {
    const key = stat.getAttribute('stat') as CombatStat, value = Number(stat.getAttribute('value') ?? NaN);
    if (COMBAT_STATS.includes(key) && Number.isFinite(value) && value >= 0 && value <= 1e15) result.stats[key] = value;
  }
  result.fullSkills = children(build, 'FullDPSSkill').slice(0, 100).flatMap((row) => {
    const dps = Number(row.getAttribute('value') ?? NaN), name = row.getAttribute('stat');
    return name && Number.isFinite(dps) && dps >= 0 && dps <= 1e15 ? [{ name: name.slice(0, 200), dps }] : [];
  });
  return readPobCombat(result);
}

/** Validate persisted metadata independently of the equipment parser. */
export function readPobCombat(value: unknown): PobCombat | undefined {
  const object = (entry: unknown): entry is Record<string, unknown> => !!entry && typeof entry === 'object' && !Array.isArray(entry);
  const text = (entry: unknown, limit = 300): entry is string => typeof entry === 'string' && entry.length <= limit;
  const number = (entry: unknown, min = 0, max = 1e15): entry is number => typeof entry === 'number' && Number.isFinite(entry) && entry >= min && entry <= max;
  if (!object(value) || !text(value.activeSet, 100) || !number(value.mainGroup, 1, 100) || !Number.isInteger(value.mainGroup)
    || typeof value.matchesEquipment !== 'boolean' || !Array.isArray(value.sets) || value.sets.length > 20 || !object(value.stats)
    || !Array.isArray(value.fullSkills) || value.fullSkills.length > 100) return undefined;
  const sets: PobSkillSet[] = [];
  for (const set of value.sets) {
    if (!object(set) || !text(set.id, 100) || !text(set.title, 200) || !Array.isArray(set.groups) || set.groups.length > 100) return undefined;
    const groups: PobSkillGroup[] = [];
    for (const group of set.groups) {
      if (!object(group) || !number(group.index, 1, 100) || !Number.isInteger(group.index) || !text(group.label, 200) || typeof group.enabled !== 'boolean'
        || !number(group.mainActive, 1, 20) || !Number.isInteger(group.mainActive) || typeof group.fullDps !== 'boolean'
        || !['gem', 'item', 'tree'].includes(String(group.source)) || !text(group.slot, 100) || !Array.isArray(group.gems) || group.gems.length > 20) return undefined;
      const gems: PobGem[] = [];
      for (const gem of group.gems) {
        if (!object(gem) || !text(gem.id) || !text(gem.skillId) || !text(gem.name, 200) || !number(gem.level, 1, 100) || !number(gem.quality, 0, 200)
          || typeof gem.enabled !== 'boolean' || typeof gem.weapon1 !== 'boolean' || typeof gem.weapon2 !== 'boolean') return undefined;
        gems.push({ id: gem.id, skillId: gem.skillId, name: gem.name, level: gem.level, quality: gem.quality, enabled: gem.enabled, weapon1: gem.weapon1, weapon2: gem.weapon2 });
      }
      groups.push({ index: group.index, label: group.label, enabled: group.enabled, mainActive: group.mainActive, fullDps: group.fullDps, source: group.source as PobSkillGroup['source'], slot: group.slot, gems });
    }
    if (new Set(groups.map((group) => group.index)).size !== groups.length) return undefined;
    sets.push({ id: set.id, title: set.title, groups });
  }
  if (new Set(sets.map((set) => set.id)).size !== sets.length || !sets.some((set) => set.id === value.activeSet)) return undefined;
  const stats: PobCombat['stats'] = {};
  for (const key of COMBAT_STATS) if (number(value.stats[key])) stats[key] = value.stats[key];
  const fullSkills = value.fullSkills.flatMap((row) => object(row) && text(row.name, 200) && number(row.dps) ? [{ name: row.name, dps: row.dps }] : []);
  return { activeSet: value.activeSet, mainGroup: value.mainGroup, matchesEquipment: value.matchesEquipment, sets, stats, fullSkills };
}

/** These are separate saved outputs. DoT includes ignite/poison/bleed: do not add them twice. */
export function damageComposition(combat: PobCombat) {
  const stats = combat.stats;
  return { combined: stats.CombinedDPS, hit: stats.TotalDPS, dot: stats.TotalDotDPS,
    full: stats.FullDPS, ignite: stats.IgniteDPS, bleed: stats.BleedDPS, poison: stats.TotalPoisonDPS ?? stats.PoisonDPS };
}
