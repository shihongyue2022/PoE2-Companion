import type { PatchData } from '../../packages/engine/src/types';
import { TRADE_CATEGORY, type GearTrade } from '../lib/gearTrade';
import { LOADOUT_SLOTS, type LoadoutSlot, type LoadoutState } from './loadout';
import { localizeEquipmentName, parseEquipment } from './genericEquipment';
import { RUNES } from '../../packages/engine/src/runes';
import { skillPlan, skillTargetRows, skillWeaponWarning, type MainSkillSelection } from './skillRecommendation';
import type { EquipmentTradeRow } from './genericEquipmentTrade';
import { englishPoe2dbUrl } from './poe2dbReference';

export interface SkillAffixSearch {
  selection: MainSkillSelection; slot: LoadoutSlot; baseId: string; ref: string; preset: string; requiredRune?: string;
}
export interface SkillAffixLocation { slot: LoadoutSlot; slotLabel: string; baseId: string; baseName: string; raw: string; row: EquipmentTradeRow }
export interface SkillAffixDirection { ref: string; label: string; reason: string; family: string; priority: number; locations: SkillAffixLocation[] }
export const SKILL_GUIDE_CHECKED = '2026-10-23';
export const SKILL_GUIDE_SOURCES = {
  modifiers: 'https://poe2db.tw/us/Modifiers',
  official: 'https://www.pathofexile.com/forum/view-thread/3826682',
  pob: 'https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/tree/v0.23.1/src/Data/Skills',
};
const familyLabels: Record<string, string> = {
  attackDamage: '攻击伤害', attackSpeed: '攻击速度', spellDamage: '法术伤害', castSpeed: '施法速度',
  projectileDamage: '投射物伤害', projectileSpeed: '投速与伤害联动', areaDamage: '范围伤害',
  meleeDamage: '近战伤害', minionDamage: '召唤物伤害', critChance: '暴击几率', critDamage: '暴击伤害', skillLevels: '技能等级',
};
export const skillFamilyLabel = (family: string) => familyLabels[family] ?? family;
export const skillRuneLabel = (id: string) => localizeEquipmentName(RUNES.find((entry) => entry.id === id)?.name.replace(/’/g, "'") ?? id);
export const skillRuneUrl = (id: string) => { const name = RUNES.find((entry) => entry.id === id)?.name; return name ? englishPoe2dbUrl(name) : undefined; };

/** This enumerates legal ordinary pools, not speculative unique effects or final DPS.
 * A direction's order is a skill-mechanic preference, never a calculated damage gain. */
export function skillAffixDirections(state: LoadoutState, data?: PatchData, trade?: GearTrade | null): SkillAffixDirection[] {
  const plan = skillPlan(state); if (!plan || !data || !trade) return [];
  const found = new Map<string, SkillAffixDirection>();
  for (const slot of LOADOUT_SLOTS.filter((entry) => !['flask', 'charm'].includes(entry.kind))) {
    const current = parseEquipment(state.slots[slot.id] ?? '');
    const bases = [...data.bases.values()].filter((base) => {
      const category = TRADE_CATEGORY[base.category];
      if (!category || !base.bases?.length) return false;
      const probe = parseEquipment(`Rarity: Rare\nSkill Search\n${base.bases[0]}`);
      if (!probe || probe.slot !== slot.kind) return false;
      if (slot.id === 'mainHand' && skillWeaponWarning(plan, probe)) return false;
      if (slot.id === 'offHand' && !current && (plan.weapon === 'Bow' ? category !== 'armour.quiver' : !plan.tags.includes('spell') || category === 'armour.quiver')) return false;
      if (current) return current.category === category && base.bases.some((name) => name === current.baseNameEnglish);
      return true;
    });
    for (const base of bases) {
      const name = current?.baseNameEnglish ?? base.bases![0]!;
      const raw = current?.raw ?? `Rarity: Rare\nSkill Search\n${name}`;
      const item = { ...(current ?? parseEquipment(raw)!), rarity: 'rare' as const, mods: [] };
      for (const row of skillTargetRows(item, state, data, trade, 100, Object.keys(base.pools.rune ?? {}))) {
        if (!row.scoringRef || !row.targetTiers?.length || row.targetFloor?.max !== undefined) continue;
        const family = row.skillFamily ?? '';
        const direction = found.get(row.scoringRef) ?? { ref: row.scoringRef, label: row.label, reason: row.recommendation ?? '', family,
          priority: Number(row.weight), locations: [] };
        direction.locations.push({ slot: slot.id, slotLabel: slot.label, baseId: base.id, baseName: name, raw, row });
        found.set(row.scoringRef, direction);
      }
    }
  }
  return [...found.values()].sort((a, b) => b.priority - a.priority || a.label.localeCompare(b.label));
}

export function skillGuideFacts(name: string, supports: readonly { name: string; label: string }[]) {
  const facts: { label: string; detail: string; url: string }[] = [];
  if (name === 'Twister') facts.push({ label: '旋风的单体命中限制', detail: '同批旋风对同一目标至多每 0.66 秒命中一次。数量、发射频率、持续时间与重叠均需核对，不能按投射物数量线性放大单体 DPS。', url: englishPoe2dbUrl(name) },
    { label: '武器基础与技能等级', detail: '旋风使用长矛攻击伤害。原生等级 18→19 的基础攻击倍率从 214% 到 223%，倍率约提高 4.21%；这只是技能系数，实际有效等级、武器与条件需要 PoB 重算。', url: englishPoe2dbUrl(name) });
  for (const support of supports) {
    if (support.name === 'Projectile Acceleration III') facts.push({ label: `${support.label} · 投速参与增伤`, detail: '投射物速度的增加／减少也作用于投射物伤害；该辅助自身的 40% more 投速不能直接算成 40% more 伤害。', url: englishPoe2dbUrl(support.name) });
    if (support.name === 'Elemental Armament II') facts.push({ label: `${support.label} · 元素攻击乘区`, detail: '辅助提供 25% more 元素攻击伤害，只放大适用的元素部分；不等于整套伤害固定提高 25%。', url: englishPoe2dbUrl(support.name) });
    if (support.name === "Rakiata's Flow") facts.push({ label: `${support.label} · 敌人抗性反转`, detail: '命中将敌人元素抗性视为反转；曝露、诅咒、穿透不能照搬普通减抗方案，需要核对敌人配置及结算顺序。', url: englishPoe2dbUrl(support.name) });
    if (support.name === 'Rage II') facts.push({ label: `${support.label} · 盛怒来源需近战命中`, detail: '依赖近战命中获取盛怒；仅有投射物命中不能据此假设持续获得盛怒。', url: englishPoe2dbUrl(support.name) });
    if (support.name === 'Salvo') facts.push({ label: `${support.label} · 封印与额外投射物`, detail: '随时间积累封印，使用时消耗封印增加投射物并随机发射；攻速、封印恢复和旋风命中间隔需一起核对，不能按额外投射物数直接倍增伤害。', url: englishPoe2dbUrl(support.name) });
  }
  return facts;
}

export function resolveSkillAffixSearch(state: LoadoutState, request: SkillAffixSearch, data?: PatchData, trade?: GearTrade | null): SkillAffixLocation | undefined {
  const preview = { ...state, goals: { ...state.goals, mainSkill: request.selection } };
  return skillAffixDirections(preview, data, trade).find((entry) => entry.ref === request.ref)?.locations.find((entry) => entry.slot === request.slot && entry.baseId === request.baseId && entry.row.requiredRune === request.requiredRune);
}
