import type { MetricKey } from './loadout';

export const BUILD_FAMILIES = {
  attackDamage: '攻击伤害／攻击附加伤害', attackSpeed: '攻击速度', critChance: '暴击率', critDamage: '暴击伤害',
  projectileDamage: '投射物伤害', meleeDamage: '近战伤害', spellDamage: '法术伤害', skillLevels: '相关技能等级',
  energyShield: '能量护盾', evasion: '闪避', armour: '护甲', life: '生命', mana: '魔力', resistances: '抗性', movementSpeed: '移动速度',
} as const;
export type BuildFamily = keyof typeof BUILD_FAMILIES;
export interface BuildSkill {
  key: string; id: string; label: string; tags: string[]; weapon?: string; known: boolean;
  supports: { id: string; label: string; known: boolean }[];
}
export interface BuildAnalysis {
  fileName: string; name: string; author?: string; ascendancy?: string; modifiedAt: string;
  level: number; weaponSet: number; skills: BuildSkill[]; totalPassives: number; matchedPassives: number; unknownPassives: number;
  signals: { family: BuildFamily; count: number; evidence: string[] }[];
  constraints: { emptyOffhand: boolean; helmetEsEvasion: boolean; gemColours: boolean; manaBeforeLife: boolean };
  keystones: { name: string; text: string[] }[];
  hints: { slot: string; unique?: string; text?: string }[];
  warnings: string[];
}
export interface BuildProfile {
  version: 1; fileName: string; name: string; modifiedAt: string; ascendancy?: string;
  level: number; weaponSet: number; main: BuildSkill;
  priorities: { family: BuildFamily; weight: number; reason: string }[];
  metrics: MetricKey[]; constraints: BuildAnalysis['constraints'];
  matchedPassives: number; unknownPassives: number; warnings: string[];
  offense?: { cannotCrit: boolean };
}
export function isBuildMainSkill(skill: BuildSkill): boolean {
  return skill.known && !skill.tags.includes('persistent') && !skill.tags.includes('buff')
    && (skill.tags.includes('attack') || skill.tags.includes('spell'));
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const short = (value: unknown, max = 300): value is string => typeof value === 'string' && value.length <= max;
const count = (value: unknown, max = 2000): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
export function readBuildProfile(value: unknown): BuildProfile | undefined {
  const constraints = record(value) && record(value.constraints) ? value.constraints : null;
  if (!record(value) || value.version !== 1 || !short(value.fileName) || !short(value.name) || !short(value.modifiedAt)
    || !Number.isFinite(Date.parse(value.modifiedAt)) || !count(value.level, 100) || value.level < 1 || ![1, 2].includes(value.weaponSet as number)
    || !record(value.main) || !short(value.main.id) || !short(value.main.key) || !short(value.main.label) || value.main.known !== true
    || !Array.isArray(value.main.tags) || value.main.tags.length > 40 || !value.main.tags.every((tag) => short(tag, 80))
    || !Array.isArray(value.main.supports) || value.main.supports.length > 20 || !value.main.supports.every((support) => record(support) && short(support.id) && short(support.label) && typeof support.known === 'boolean')
    || !constraints || !['emptyOffhand', 'helmetEsEvasion', 'gemColours', 'manaBeforeLife'].every((key) => typeof constraints[key] === 'boolean')
    || !Array.isArray(value.priorities) || value.priorities.length > 20 || !value.priorities.every((priority) => record(priority)
      && typeof priority.family === 'string' && Object.prototype.hasOwnProperty.call(BUILD_FAMILIES, priority.family)
      && typeof priority.weight === 'number' && priority.weight >= 1 && priority.weight <= 5 && short(priority.reason, 500))
    || !count(value.matchedPassives) || !count(value.unknownPassives) || !Array.isArray(value.warnings) || value.warnings.length > 30 || !value.warnings.every((warning) => short(warning, 500))) return undefined;
  const metrics: MetricKey[] = ['life', 'mana', 'energyShield', 'armour', 'evasion', 'movementSpeed', 'fireResistance', 'coldResistance', 'lightningResistance', 'chaosResistance'];
  if (!Array.isArray(value.metrics) || !value.metrics.every((metric) => metrics.includes(metric as MetricKey))) return undefined;
  const main = value.main;
  return { version: 1, fileName: value.fileName, name: value.name, modifiedAt: value.modifiedAt, ...(short(value.ascendancy) ? { ascendancy: value.ascendancy } : {}),
    level: value.level, weaponSet: value.weaponSet as number, main: { key: main.key as string, id: main.id as string, label: main.label as string,
      known: true, tags: [...main.tags as string[]], supports: (main.supports as BuildSkill['supports']).map((support) => ({ id: support.id, label: support.label, known: support.known })),
      ...(short(main.weapon) ? { weapon: main.weapon } : {}) }, priorities: (value.priorities as BuildProfile['priorities']).map((priority) => ({ ...priority })),
    metrics: [...new Set(value.metrics as MetricKey[])], constraints: { emptyOffhand: constraints.emptyOffhand as boolean, helmetEsEvasion: constraints.helmetEsEvasion as boolean, gemColours: constraints.gemColours as boolean, manaBeforeLife: constraints.manaBeforeLife as boolean },
    matchedPassives: value.matchedPassives, unknownPassives: value.unknownPassives, warnings: [...value.warnings],
    ...(record(value.offense) && typeof value.offense.cannotCrit === 'boolean' ? { offense: { cannotCrit: value.offense.cannotCrit } } : {}) };
}

export function profileForSkill(analysis: BuildAnalysis, key: string): BuildProfile | undefined {
  const main = analysis.skills.find((skill) => skill.key === key && isBuildMainSkill(skill));
  if (!main) return undefined;
  const priorities: BuildProfile['priorities'] = [];
  const add = (family: BuildFamily, weight: number, reason: string) => priorities.push({ family, weight, reason });
  const has = (tag: string) => main.tags.includes(tag);
  if (has('attack')) { add('attackDamage', 3, `${main.label}带攻击标签；具体物理／元素占比仍需核对转伤与辅助。`); add('attackSpeed', 4, '主攻技能带攻击标签，优先比较攻击速度。'); }
  if (has('spell')) add('spellDamage', 3, '主攻技能带法术标签。');
  if (has('projectile')) add('projectileDamage', 3, '主攻技能带投射物标签。');
  if (has('melee')) add('meleeDamage', 3, '主攻技能带近战标签。');
  for (const family of ['critChance', 'critDamage', 'energyShield', 'evasion', 'armour', 'life', 'mana'] as const) {
    const signal = analysis.signals.find((entry) => entry.family === family);
    if (signal && (signal.count >= 3 || family.startsWith('crit') || family === 'mana' && analysis.constraints.manaBeforeLife)) add(family, 4, `所选阶段／武器组中有 ${signal.count} 条相关天赋记录；这是相对搜索侧重，不是收益倍率。`);
  }
  add('resistances', 3, '保持抗性约束；最低要求由你的角色目标单独设置。');
  add('movementSpeed', 2, '鞋靴移动速度作为配装侧重，不能替代伤害与防御计算。');
  const metrics = priorities.flatMap(({ family }): MetricKey[] => family === 'resistances' ? ['fireResistance', 'coldResistance', 'lightningResistance', 'chaosResistance']
    : ['life', 'mana', 'energyShield', 'evasion', 'armour', 'movementSpeed'].includes(family) ? [family as MetricKey] : []);
  return { version: 1, fileName: analysis.fileName, name: analysis.name, modifiedAt: analysis.modifiedAt, ascendancy: analysis.ascendancy,
    level: analysis.level, weaponSet: analysis.weaponSet, main, priorities, metrics, constraints: analysis.constraints,
    matchedPassives: analysis.matchedPassives, unknownPassives: analysis.unknownPassives, warnings: analysis.warnings,
    offense: { cannotCrit: analysis.keystones.some((entry) => entry.text.some((line) => /^(?:Never deal Critical (?:Hits|Strikes)|You cannot deal Critical (?:Hits|Strikes)|Your Hits (?:can never|cannot) be Critical)/i.test(line))) } };
}
