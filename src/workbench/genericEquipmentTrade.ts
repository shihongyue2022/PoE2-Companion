import type { FlexibleTradeDocument } from './tradeSearch';
import { equipmentMetrics, type Equipment } from './genericEquipment';

export interface EquipmentTradeRow {
  key: string; label: string; ids: string[]; enabled: boolean; min: string; max: string;
  actualValue?: number; equipmentFilter?: string; warning?: string;
  presenceOnly?: boolean;
}
export type EquipmentTradePreset = 'similar' | 'strict' | 'base' | 'upgrade';
const format = (value: number): string => String(Math.round(value * 100) / 100);

/** Properties use official equipment filters; modifier rows use the complete official stat index. */
export function equipmentTradeRows(equipment: Equipment, preset: EquipmentTradePreset = 'similar'): EquipmentTradeRow[] {
  const metrics = equipmentMetrics(equipment);
  const rows: EquipmentTradeRow[] = [];
  for (const [metric, equipmentFilter, label] of [
    ['physicalDps', 'pdps', '物理每秒伤害'], ['elementalDps', 'edps', '元素每秒伤害'],
    ['armour', 'ar', '护甲'], ['evasion', 'ev', '闪避值'], ['energyShield', 'es', '能量护盾'], ['spirit', 'spirit', '精魂'],
  ]) {
    const value = metrics[metric!];
    if (value !== undefined && value > 0) rows.push({ key: `property:${metric}`, label: label!, ids: [], enabled: false,
      min: format(value), max: '', actualValue: value, equipmentFilter });
  }
  rows.push(...equipment.mods.filter((mod) => mod.searchable).map((mod): EquipmentTradeRow => ({
    key: `mod:${mod.key}`, label: mod.label, ids: mod.ids, enabled: false,
    min: mod.value === undefined ? '' : format(mod.value), max: '',
    ...(mod.value === undefined ? {} : { actualValue: mod.value }), ...(mod.warning ? { warning: mod.warning } : {}),
    ...(/Requirements|Cost|Reservation|Duration|Damage taken|Enemy.*Resistance/i.test(mod.ref ?? '') ? {
      presenceOnly: true, warning: '此属性的数值优劣取决于机制，默认只查是否存在；需要时请手动设置区间。',
    } : {}),
  })));
  const score = (row: EquipmentTradeRow): number => row.equipmentFilter === 'pdps' || row.equipmentFilter === 'edps' ? 150
    : row.equipmentFilter ? 110 : /生命|life|抗性|resistance/i.test(row.label) ? 100
      : /移动|精魂|魔力|施法|技能|暴击|攻击|速度|spirit|mana|speed|critical|skill|damage/i.test(row.label) ? 80 : 30;
  const keys = new Set([...rows].filter((row) => preset !== 'upgrade' || row.actualValue !== undefined && row.actualValue > 0 && !row.presenceOnly)
    .sort((a, b) => score(b) - score(a)).slice(0, 3).map((row) => row.key));
  return rows.map((row) => {
    const enabled = preset === 'base' ? false : preset === 'strict' ? true : keys.has(row.key);
    const value = row.actualValue;
    const min = value === undefined || row.presenceOnly ? '' : preset === 'upgrade' ? format(value + Math.abs(value) * 0.1)
      : preset === 'similar' ? format(value - Math.abs(value) * 0.2) : format(value);
    return { ...row, enabled, min };
  });
}

export interface EquipmentTradeOptions {
  equipment: Equipment; league: string; rows: readonly EquipmentTradeRow[];
  exactBase?: boolean; exactUnique?: boolean; status?: 'any' | 'online' | 'securable';
  sameCorruption?: boolean;
}
function numeric(text: string, label: string): number | undefined {
  if (!text.trim()) return undefined;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.trim()) || !Number.isFinite(Number(text))) throw new Error(`${label}需要填写有效数字。`);
  return Number(text);
}
/** The returned query is inspectable and user editable; no tiers or hidden guessed stats. */
export function buildEquipmentTrade({ equipment, league, rows, exactBase = true, exactUnique = true, status = 'any', sameCorruption = true }: EquipmentTradeOptions): {
  query: FlexibleTradeDocument; url: string; warnings: string[]; activeCount: number;
} {
  if (!league.trim()) throw new Error('请先填写官方交易赛季。');
  const active = rows.filter((row) => row.enabled);
  const stats: FlexibleTradeDocument['query']['stats'][number][] = [];
  const simple: { id: string; value?: { min?: number; max?: number }; disabled: false }[] = [];
  const equipmentFilters: Record<string, { min?: number; max?: number }> = {};
  for (const row of active) {
    const min = numeric(row.min, row.label); const max = numeric(row.max, row.label);
    if (min !== undefined && max !== undefined && min > max) throw new Error(`${row.label}的下限不能高于上限。`);
    const value = { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) };
    if (row.equipmentFilter) {
      if (min !== undefined || max !== undefined) equipmentFilters[row.equipmentFilter] = value;
      continue;
    }
    if (!row.ids.length) throw new Error(`${row.label}没有已核对的交易属性。`);
    const filters = [...new Set(row.ids)].map((id) => ({ id, ...(min === undefined && max === undefined ? {} : { value }), disabled: false as const }));
    if (filters.length === 1) simple.push(filters[0]!);
    else stats.push({ type: 'count', value: { min: 1 }, filters, disabled: false });
  }
  stats.unshift({ type: 'and', filters: simple, disabled: false });
  const query: FlexibleTradeDocument = {
    query: {
      status: { option: status },
      ...(exactBase && equipment.baseNameEnglish ? { type: equipment.baseNameEnglish } : {}),
      ...(exactUnique && equipment.rarity === 'unique' && equipment.nameEnglish ? { name: equipment.nameEnglish } : {}),
      filters: {
        type_filters: { filters: { category: { option: equipment.category }, rarity: { option: equipment.rarity === 'unique' ? 'unique' : 'nonunique' } } },
        misc_filters: { filters: { identified: { option: equipment.identified ? 'true' : 'false' },
          ...(sameCorruption ? { corrupted: { option: equipment.corrupted ? 'true' : 'false' } } : {}) } },
        ...(Object.keys(equipmentFilters).length ? { equipment_filters: { filters: equipmentFilters } } : {}),
      },
      stats,
    },
    sort: { price: 'asc' },
  };
  const warnings = [...equipment.warnings];
  if (!active.length) warnings.push(equipment.rarity === 'unique' && equipment.nameEnglish && exactUnique
    ? '仅比较同名传奇，未限制变量数值；不同掷值、腐化与特殊状态会影响价格。'
    : '仅比较底座或类别，未限制属性；价格不能代表这件装备的价值。');
  else if (active.length < rows.length) warnings.push('只匹配勾选的属性；未选属性、特殊效果和组合价值没有纳入。');
  if (!equipment.identified) warnings.push('装备尚未鉴定，无法按隐藏属性估价。');
  return { query, url: `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(league.trim())}?q=${encodeURIComponent(JSON.stringify(query))}`,
    warnings, activeCount: active.length };
}
