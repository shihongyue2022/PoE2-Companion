import type { ItemState, PatchData } from '../../packages/engine/src/types.ts';
import { HOSTED_WORKBENCH } from './workbenchRuntime';
import { gearSearch, loadGearTrade, slotsOfTargets, type GearTrade, type WantedMod } from '../lib/gearTrade.ts';
import { tradeUrl, type TradeSearch } from '../lib/tradeLink.ts';
import priceSnapshot from '../../data/patches/0.5.0/prices.json';
import { findJewelleryBase } from './catalog.ts';

export { loadGearTrade };
export type { GearTrade, WantedMod };

/** Offline provenance, not a declaration of the current league or live quotes. */
export const OFFLINE_MARKET = {
  patch: priceSnapshot.patch,
  updated: priceSnapshot.updated,
  league: 'Forbidden Rites',
  unit: priceSnapshot.unit,
  source: priceSnapshot.source,
} as const;

export const DATA_SOURCES = [
  { label: 'PoE2DB 戒指底座与词缀', url: 'https://poe2db.tw/tw/Rings' },
  { label: 'PoE2DB 项链底座与词缀', url: 'https://poe2db.tw/tw/Amulets' },
  { label: 'PoE2 Wiki 物品等级规则', url: 'https://www.poe2wiki.net/wiki/Item_level' },
  { label: 'POE2_HTC 制作引擎', url: 'https://github.com/Dboire9/POE2_HTC' },
  { label: 'Exiled Exchange 2 交易属性映射', url: 'https://github.com/Kvan7/Exiled-Exchange-2' },
] as const;

export interface WorkbenchTradeOptions {
  readonly trade: GearTrade;
  readonly data: PatchData;
  /** Explicitly editable; never inferred from a price snapshot's name. */
  readonly league: string;
  readonly baseId: string;
  /** English or a catalogue Chinese alias. Omit to search the entire category. */
  readonly baseName?: string;
  readonly itemLevelMin?: number;
  readonly itemLevelMax?: number;
  readonly targets: readonly (WantedMod & { readonly slot?: number })[];
  readonly rarity?: TradeSearch['rarity'];
  readonly status?: 'online' | 'any' | 'securable';
}

interface SearchDocument {
  query: {
    type?: string;
    status: { option: string };
    filters?: Record<string, { filters: Record<string, unknown> }>;
    stats: unknown[];
  };
  sort: { price: string };
}

/**
 * Reuse the upstream's stat IDs, compound-line mappings, tier lows and alternative groups.
 * Add base and ilvl filters while reporting every unavailable or ambiguous mapping to the UI.
 * This only constructs a link; it never queries listings or scrapes prices.
 */
export function buildWorkbenchTrade(options: WorkbenchTradeOptions): { url: string; warnings: string[]; loose: boolean } {
  const { trade, data, targets, baseId } = options;
  const league = options.league.trim();
  if (!league) throw new Error('请先填写或选择官方交易赛季。');
  const base = data.bases.get(baseId);
  if (!base || !['Rings', 'Amulets'].includes(base.category)) throw new Error('第一版交易搜索只支持戒指和项链。');
  for (const level of [options.itemLevelMin, options.itemLevelMax]) {
    if (level !== undefined && (!Number.isInteger(level) || level < 1 || level > 100)) {
      throw new Error('交易物品等级必须是 1 至 100 的整数。');
    }
  }
  if (options.itemLevelMin !== undefined && options.itemLevelMax !== undefined && options.itemLevelMin > options.itemLevelMax) {
    throw new Error('交易物品等级下限不能大于上限。');
  }

  const warnings: string[] = [];
  for (const want of targets) {
    const mod = data.mods.get(want.modId);
    const mapped = trade.mods[want.modId];
    if (!mod || !mapped || mapped.length === 0 || mapped.some((line) => line === null || !trade.rows[line[0]]?.ids.length)) {
      warnings.push(`未能映射交易词缀：${mod?.text ?? want.modId}。该条件未完整加入搜索，请在官方页面核对。`);
      continue;
    }
    if (!Number.isInteger(want.tierDisplay) || want.tierDisplay < 1) {
      throw new Error(`词缀阶级无效：${want.modId}`);
    }
    if (mapped.some((line) => line !== null && trade.rows[line[0]]?.ambiguous)) {
      warnings.push(`交易属性存在近似匹配：${mod.text ?? want.modId}，请核对结果。`);
    }
  }

  // Malformed mappings must not cause a crash inside upstream gearSearch; omit the whole
  // modifier and name the omitted condition above. A partial compound filter is unsafe.
  const safeTargets = targets.filter((want) => {
    const mapped = trade.mods[want.modId];
    return data.mods.has(want.modId) && mapped && mapped.length > 0 && mapped.every((line) => line !== null && (trade.rows[line[0]]?.ids.length ?? 0) > 0);
  });
  const { search, loose } = gearSearch(trade, data, baseId, slotsOfTargets(safeTargets));
  if (loose && warnings.length === 0) warnings.push('此组合包含替代词缀或复合属性，官方查询可能较宽，请核对每条属性。');
  const url = new URL(tradeUrl({ ...search, league, rarity: options.rarity ?? 'nonunique' }));
  const document = JSON.parse(url.searchParams.get('q')!) as SearchDocument;
  document.query.status = { option: options.status ?? 'online' };

  if (options.baseName?.trim()) {
    const name = options.baseName.trim();
    const known = findJewelleryBase(name);
    if (known && known.category !== base.category) throw new Error('交易底座与装备类别不一致。');
    const english = known?.english ?? name;
    if (!(base.bases ?? []).includes(english)) {
      warnings.push(`底座“${name}”未包含在当前 ${data.patch} 数据中，请在官方页面确认名称。`);
    }
    document.query.type = english;
  }
  if (options.itemLevelMin !== undefined || options.itemLevelMax !== undefined) {
    document.query.filters ??= {};
    document.query.filters.misc_filters = {
      filters: {
        ilvl: {
          ...(options.itemLevelMin !== undefined ? { min: options.itemLevelMin } : {}),
          ...(options.itemLevelMax !== undefined ? { max: options.itemLevelMax } : {}),
        },
      },
    };
  }
  url.searchParams.set('q', JSON.stringify(document));
  return { url: url.toString(), warnings, loose: loose || warnings.length > 0 };
}

/** Search a current item's tier minima, rather than pretending to know its exact rolled values. */
export function currentItemTargets(data: PatchData, item: ItemState): WantedMod[] {
  return [...item.prefixes, ...item.suffixes].map((placed) => {
    const mod = data.mods.get(placed.modId);
    const index = mod?.tiers.findIndex((tier) => tier.name === placed.tierName) ?? -1;
    return { modId: placed.modId, tierDisplay: mod && index >= 0 ? mod.tiers.length - index : 99 };
  });
}

export interface TradeLeague {
  readonly id: string;
  readonly label: string;
  readonly hardcore: boolean;
  readonly standard: boolean;
  readonly startAt?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Accept the official trade2 result wrapper or the official main-leagues array. */
export function parseTradeLeagues(payload: unknown): TradeLeague[] {
  const rows = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.result) ? payload.result : undefined;
  if (!rows) throw new Error('官方赛季接口返回了无法识别的数据。');
  const seen = new Set<string>();
  const result: TradeLeague[] = [];
  for (const row of rows) {
    if (!isRecord(row) || typeof row.id !== 'string' || !row.id.trim()) continue;
    if (typeof row.realm === 'string' && row.realm !== 'poe2') continue;
    const label = typeof row.text === 'string' ? row.text : row.id;
    const rules = Array.isArray(row.rules) ? row.rules.filter(isRecord)
      .map((rule) => `${typeof rule.id === 'string' ? rule.id : ''} ${typeof rule.name === 'string' ? rule.name : ''}`).join(' ') : '';
    if (/\bSSF\b|Solo Self.?Found|NoTrading|NoTrade|SoloSelfFound/i.test(`${row.id} ${label} ${rules}`)) continue;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    result.push({
      id: row.id,
      label,
      hardcore: /Hardcore|\bHC\b/i.test(`${row.id} ${label} ${rules}`),
      standard: /^(?:(?:Hardcore |HC )?Standard|Hardcore)$/i.test(row.id),
      ...(typeof row.startAt === 'string' ? { startAt: row.startAt } : {}),
    });
  }
  if (result.length === 0) throw new Error('官方接口未返回可用的 PoE2 交易赛季；请手动填写赛季名称。');
  return result;
}

/** One deliberate live request through the local Vite proxy; callers retain editable manual input. */
export async function fetchTradeLeagues(signal?: AbortSignal): Promise<TradeLeague[]> {
  if (HOSTED_WORKBENCH) return [];
  const response = await fetch('/api/poe/leagues', { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`无法获取官方赛季（HTTP ${response.status}），可手动填写赛季名称。`);
  return parseTradeLeagues(await response.json() as unknown);
}
