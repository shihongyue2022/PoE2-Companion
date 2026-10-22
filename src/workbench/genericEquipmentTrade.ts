import type { FlexibleTradeDocument } from './tradeSearch';
import { equipmentMetrics, equipmentStatAliases, type Equipment } from './genericEquipment';
import { upgradeComponents } from './upgradeRanking';

export interface EquipmentTradeRow {
  key: string; label: string; ids: string[]; enabled: boolean; min: string; max: string;
  actualValue?: number; equipmentFilter?: string; warning?: string;
  filterGroup?: 'map_filters' | 'misc_filters' | 'type_filters';
  presenceOnly?: boolean;
  weight?: string;
}
export type EquipmentTradePreset = 'similar' | 'strict' | 'base' | 'upgrade';
const format = (value: number): string => String(Math.round(value * 100) / 100);

/** Properties use official equipment filters; modifier rows use the complete official stat index. */
export function equipmentTradeRows(equipment: Equipment, preset: EquipmentTradePreset = 'similar'): EquipmentTradeRow[] {
  const metrics = equipmentMetrics(equipment);
  const rows: EquipmentTradeRow[] = [];
  if (equipment.kind && equipment.kind !== 'equipment') {
    for (const [value, field, label, group] of [
      [equipment.mapTier, 'map_tier', '地图阶级', 'map_filters'],
      [equipment.gemLevel, 'gem_level', '宝石等级', 'misc_filters'],
      [equipment.quality, 'quality', '品质', 'type_filters'],
      [equipment.areaLevel, 'area_level', '区域等级', 'misc_filters'],
    ] as const) if (value !== undefined) rows.push({ key: `property:${field}`, label, ids: [], enabled: true,
      min: format(value), max: format(value), actualValue: value, equipmentFilter: field, filterGroup: group });
    if (equipment.kind === 'waystone') for (const [property, field, label] of [['mapBonus', 'map_bonus', '换界石掉落概率'], ['mapPacksize', 'map_packsize', '怪物群大小']]) {
      const value = equipment.properties.find((entry) => entry.name === property)?.values[0];
      if (value !== undefined) rows.push({ key: `property:${field}`, label: label!, ids: [], enabled: preset === 'strict',
        min: format(value), max: '', actualValue: value, equipmentFilter: field, filterGroup: 'map_filters' });
    }
  }
  for (const [metric, equipmentFilter, label] of [
    ['physicalDps', 'pdps', '物理每秒伤害'], ['elementalDps', 'edps', '元素每秒伤害'],
    ['armour', 'ar', '护甲'], ['evasion', 'ev', '闪避值'], ['energyShield', 'es', '能量护盾'], ['spirit', 'spirit', '精魂'],
  ]) {
    const value = metrics[metric!];
    if (value !== undefined && value > 0) rows.push({ key: `property:${metric}`, label: label!, ids: [], enabled: false,
      min: format(value), max: '', actualValue: value, equipmentFilter });
  }
  rows.push(...equipment.mods.filter((mod) => mod.searchable).map((mod): EquipmentTradeRow => ({
    key: `mod:${mod.key}`, label: mod.label, ids: preset === 'upgrade' && mod.ref ? equipmentStatAliases(mod.ref, mod.ids) : mod.ids, enabled: false,
    min: mod.value === undefined ? '' : format(mod.value), max: '',
    ...(mod.value === undefined ? {} : { actualValue: mod.value }), ...(mod.warning ? { warning: mod.warning } : {}),
    ...(/Requirements|Cost|Reservation|Duration|Damage taken|Enemy.*Resistance|\bper\b|\bwhile\b|\bif\b|\bwhen\b|Recently|Nearby|During|Minions|Allies/i.test(mod.ref ?? '') ? {
      presenceOnly: true, warning: '此属性的数值优劣取决于机制，默认只查是否存在；需要时请手动设置区间。',
    } : {}),
  })));
  const score = (row: EquipmentTradeRow): number => row.equipmentFilter === 'pdps' || row.equipmentFilter === 'edps' ? 150
    : row.equipmentFilter ? 110 : /生命|life|抗性|resistance/i.test(row.label) ? 100
      : /移动|精魂|魔力|施法|技能|暴击|攻击|速度|spirit|mana|speed|critical|skill|damage/i.test(row.label) ? 80 : 30;
  const keys = new Set([...rows].filter((row) => preset !== 'upgrade' || row.actualValue !== undefined && row.actualValue > 0 && !row.presenceOnly)
    .sort((a, b) => score(b) - score(a)).slice(0, 3).map((row) => row.key));
  return rows.map((row) => {
    if (row.filterGroup) return row;
    const enabled = preset === 'base' ? false : preset === 'strict' ? true : preset === 'upgrade'
      ? !row.equipmentFilter && !row.presenceOnly && (row.actualValue ?? 0) > 0 : keys.has(row.key);
    const value = row.actualValue;
    const min = value === undefined || row.presenceOnly || preset === 'upgrade' ? ''
      : preset === 'similar' ? format(value - Math.abs(value) * 0.2) : format(value);
    return { ...row, enabled, min, weight: '1' };
  });
}

export interface EquipmentTradeOptions {
  equipment: Equipment; league: string; rows: readonly EquipmentTradeRow[];
  exactBase?: boolean; exactUnique?: boolean; status?: 'any' | 'online' | 'securable';
  sameCorruption?: boolean;
  ranking?: boolean; budget?: string; budgetCurrency?: 'exalted' | 'divine';
}
function numeric(text: string, label: string): number | undefined {
  if (!text.trim()) return undefined;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.trim()) || !Number.isFinite(Number(text))) throw new Error(`${label}需要填写有效数字。`);
  return Number(text);
}
/** The returned query is inspectable and user editable; no tiers or hidden guessed stats. */
export function buildEquipmentTrade({ equipment, league, rows, exactBase = true, exactUnique = true, status = 'any', sameCorruption = true, ranking = false, budget = '', budgetCurrency = 'divine' }: EquipmentTradeOptions): {
  query: FlexibleTradeDocument; url: string; warnings: string[]; activeCount: number;
} {
  if (!league.trim()) throw new Error('请先填写官方交易赛季。');
  const nonEquipment = equipment.kind !== undefined && equipment.kind !== 'equipment';
  if (nonEquipment && !equipment.baseNameEnglish) throw new Error('此物品的官方名称尚未匹配，已停止估价以避免比较整个类别。请粘贴完整文本核对名称。');
  if (ranking && nonEquipment) throw new Error('综合找升级用于穿戴装备；地图、宝石和材料请按名称与阶级查价。');
  const active = rows.filter((row) => row.enabled);
  const stats: FlexibleTradeDocument['query']['stats'][number][] = [];
  const simple: { id: string; value?: { min?: number; max?: number }; disabled: false }[] = [];
  const equipmentFilters: Record<string, { min?: number; max?: number }> = {};
  const mapFilters: Record<string, { min?: number; max?: number }> = {};
  const miscFilters: Record<string, { min?: number; max?: number }> = {};
  const typeFilters: Record<string, { min?: number; max?: number }> = {};
  for (const row of active) {
    const min = numeric(row.min, row.label); const max = numeric(row.max, row.label);
    if (min !== undefined && max !== undefined && min > max) throw new Error(`${row.label}的下限不能高于上限。`);
    const value = { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) };
    if (row.equipmentFilter) {
      const target = row.filterGroup === 'map_filters' ? mapFilters : row.filterGroup === 'misc_filters' ? miscFilters : row.filterGroup === 'type_filters' ? typeFilters : equipmentFilters;
      if (min !== undefined || max !== undefined) target[row.equipmentFilter] = value;
      continue;
    }
    if (ranking && min === undefined && max === undefined && row.actualValue !== undefined && !row.presenceOnly) continue;
    if (!row.ids.length) throw new Error(`${row.label}没有已核对的交易属性。`);
    const filters = [...new Set(row.ids)].map((id) => ({ id, ...(min === undefined && max === undefined ? {} : { value }), disabled: false as const }));
    if (filters.length === 1) simple.push(filters[0]!);
    else stats.push({ type: 'count', value: { min: 1 }, filters, disabled: false });
  }
  stats.unshift({ type: 'and', filters: simple, disabled: false });
  if (ranking) {
    const components = upgradeComponents(rows);
    if (!components.length) throw new Error('没有可安全计分的数值词缀，请选择已识别的正向属性；装备面板属性可单独设置最低要求。');
    stats.unshift({ type: 'weight', filters: components.flatMap((component) => component.ids.map((id) => ({
      id, value: { weight: Number(component.coefficient.toPrecision(10)) }, disabled: false as const,
    }))), disabled: false });
  }
  const maximumPrice = numeric(budget, '预算');
  if (maximumPrice !== undefined && maximumPrice <= 0) throw new Error('预算需大于 0；留空表示不限预算。');
  const query: FlexibleTradeDocument = {
    query: {
      status: { option: status },
      ...((exactBase || nonEquipment) && equipment.baseNameEnglish ? { type: equipment.baseNameEnglish } : {}),
      ...(exactUnique && equipment.rarity === 'unique' && equipment.nameEnglish ? { name: equipment.nameEnglish } : {}),
      filters: {
        type_filters: { filters: { ...typeFilters, ...(equipment.category ? { category: { option: equipment.category } } : {}),
          ...(!['currency', 'gem', 'card'].includes(equipment.rarity) ? { rarity: { option: equipment.rarity === 'unique' ? 'unique' as const : nonEquipment ? equipment.rarity as 'normal' | 'magic' | 'rare' : 'nonunique' as const } } : {}) } },
        misc_filters: { filters: { ...miscFilters, ...(!nonEquipment || equipment.kind === 'waystone' || equipment.kind === 'tablet' || equipment.kind === 'gem' ? { identified: { option: equipment.identified ? 'true' as const : 'false' as const } } : {}),
          ...(sameCorruption && equipment.kind !== 'currency' && equipment.kind !== 'other' ? { corrupted: { option: equipment.corrupted ? 'true' as const : 'false' as const } } : {}),
          ...(sameCorruption && equipment.doubleCorrupted ? { twice_corrupted: { option: 'true' } } : {}) } },
        ...(Object.keys(equipmentFilters).length ? { equipment_filters: { filters: equipmentFilters } } : {}),
        ...(Object.keys(mapFilters).length ? { map_filters: { filters: mapFilters } } : {}),
        ...(maximumPrice === undefined ? {} : { trade_filters: { filters: { price: { max: maximumPrice, option: budgetCurrency } } } }),
      },
      stats,
    },
    sort: ranking ? { 'statgroup.0': 'desc' } : { price: 'asc' },
  };
  const warnings = [...equipment.warnings];
  if (!active.length) warnings.push(equipment.rarity === 'unique' && equipment.nameEnglish && exactUnique
    ? '仅比较同名传奇，未限制变量数值；不同掷值、腐化与特殊状态会影响价格。'
    : nonEquipment ? '按官方物品名称比较挂牌；不把背包堆叠数量乘进单件报价。' : '仅比较底座或类别，未限制属性；价格不能代表这件装备的价值。');
  else if (ranking) warnings.push('仅按勾选词缀与自定权重综合排序，数值空缺视为该项未贡献；未选属性和流派机制不计入综合分。');
  else if (active.length < rows.length) warnings.push('只匹配勾选的属性；未选属性、特殊效果和组合价值没有纳入。');
  if (!equipment.identified) warnings.push('装备尚未鉴定，无法按隐藏属性估价。');
  return { query, url: `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(league.trim())}?q=${encodeURIComponent(JSON.stringify(query))}`,
    warnings, activeCount: active.length };
}
