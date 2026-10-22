import { useEffect, useMemo, useRef, useState } from 'react';
import {
  loadEngine, listMods, listPerfectEssences, listDesecrated, priceBasis,
  type Engine, type EngineMod, type ExistingItem, type ItemModInput, type TargetInput,
} from '../lib/engine';
import { modFamilies } from '../lib/engineTypes';
import type { SolveProgress, SolveResult } from '../lib/solve';
import type { EnginePolicyNode } from '../lib/engineTypes';
import { translateMod, translateModAtTier, translateCurrency, translateBase, searchText } from './localization';
import { parseWorkbenchItem, EXAMPLE_RING, EXAMPLE_AMULET } from './itemImport';
import { JEWELLERY_BASES, findJewelleryBase } from './catalog';
import { fetchTradeLeagues, loadGearTrade, type TradeLeague } from './market';
import type { GearTrade } from '../lib/gearTrade';
import { getCraftActions, simulateCraft } from './simulator';
import { computeWorkbench } from './compute';
import { DEFAULT_OPTIONS, formatCost, formatPercent, makeSolveRequest, validateCraft, targetAvailability, regularAlternative, type CraftOptions } from './model';
import { explainCraftReason, presentMarkovResult } from './resultPresentation';
import OfficialItemArt from './OfficialItemArt';
import OfficialCurrencyIcon from './OfficialCurrencyIcon';
import { getOfficialCurrencyImage, getCurrencyImageIdForAction } from './currencyImages';
import TradePanel from './TradePanel';
import EquipmentTradePanel from './EquipmentTradePanel';
import LoadoutPanel from './LoadoutPanel';
import { parseEquipment } from './genericEquipment';
import CraftAdvisor from './CraftAdvisor';
import { recoverLegacyImport } from './legacyImport';
import { subscribeCompanion, publishCompanion, type CompanionPacket } from './companion';
import { evaluateCheckpoint, type CraftCheckpoint, type CheckpointReview } from './craftCheckpoint';
import { CraftCheckpointPanel } from './CraftCheckpointPanel';
import './workbench.css';

type Tab = 'plan' | 'simulate' | 'trade' | 'gear' | 'settings';
interface Session {
  item: ExistingItem; baseName: string; targets: TargetInput[]; raw: string;
  league: string; overrides: Record<string, number>; options: CraftOptions; baseCost: number;
  reviewRequired?: boolean; craftingBlocked?: string; warnings?: string[];
  actualRollsInvalid?: boolean;
  checkpoint?: CraftCheckpoint | null;
  checkpointReview?: CheckpointReview | null;
}
const STORAGE_KEY = 'poe2-workbench-v1';
const INITIAL: Session = {
  item: { baseId: 'Rings', level: 82, rarity: 'normal', prefixes: [], suffixes: [] },
  // Verified against GGG's Forbidden Rites FAQ on 2026-10-22; never inferred from API ordering.
  baseName: 'Amethyst Ring', targets: [], raw: '', league: 'Forbidden Rites', overrides: {}, options: DEFAULT_OPTIONS, baseCost: 0,
};
function loadSession(): Session {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Session | null;
    const validEntry = (entry: unknown) => {
      if (!entry || typeof entry !== 'object') return false;
      const row = entry as Record<string, unknown>;
      return typeof row.modId === 'string' && typeof row.tierDisplay === 'number' && Number.isInteger(row.tierDisplay) && row.tierDisplay > 0;
    };
    if (value && value.item && ['Rings', 'Amulets'].includes(value.item.baseId) && ['normal', 'magic', 'rare'].includes(value.item.rarity)
      && Array.isArray(value.item.prefixes) && Array.isArray(value.item.suffixes) && Array.isArray(value.targets)
      && value.item.prefixes.every(validEntry) && value.item.suffixes.every(validEntry) && value.targets.every(validEntry)
      && typeof value.baseName === 'string' && typeof value.item.level === 'number') {
      const safeOverrides = Object.fromEntries(Object.entries(value.overrides ?? {}).filter(([, price]) => typeof price === 'number' && Number.isFinite(price) && price > 0));
      return { ...INITIAL, ...value, raw: typeof value.raw === 'string' ? value.raw : '',
        league: typeof value.league === 'string' ? value.league : INITIAL.league,
        baseCost: Number.isFinite(value.baseCost) && value.baseCost >= 0 ? value.baseCost : 0,
        warnings: Array.isArray(value.warnings) ? value.warnings.filter((warning) => typeof warning === 'string') : [],
        craftingBlocked: typeof value.craftingBlocked === 'string' ? value.craftingBlocked : '',
        checkpoint: readCheckpoint(value.checkpoint), checkpointReview: readReview(value.checkpointReview),
        options: { ...DEFAULT_OPTIONS, ...value.options }, overrides: safeOverrides };
    }
  } catch { /* Storage may be disabled or contain an older session. */ }
  return INITIAL;
}
function readCheckpoint(value: unknown): CraftCheckpoint | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as CraftCheckpoint;
  const validMod = (entry: TargetInput) => entry && typeof entry.modId === 'string' && Number.isInteger(entry.tierDisplay) && entry.tierDisplay > 0;
  return typeof row.id === 'string' && typeof row.createdAt === 'string' && typeof row.action === 'string' && typeof row.baseName === 'string'
    && ['remove', 'add', 'goals'].includes(row.mode) && row.before && ['Rings', 'Amulets'].includes(row.before.baseId)
    && ['normal', 'magic', 'rare'].includes(row.before.rarity) && Number.isInteger(row.before.level) && row.before.level >= 1 && row.before.level <= 100
    && Array.isArray(row.before.prefixes) && row.before.prefixes.every(validMod) && Array.isArray(row.before.suffixes) && row.before.suffixes.every(validMod)
    && Array.isArray(row.targets) && row.targets.every(validMod) && Array.isArray(row.removeModIds) && row.removeModIds.every((id) => typeof id === 'string')
    && Array.isArray(row.preserveModIds) && row.preserveModIds.every((id) => typeof id === 'string') ? row : null;
}
function readReview(value: unknown): CheckpointReview | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as CheckpointReview;
  return ['met', 'missed', 'unchanged', 'mismatch', 'unresolved'].includes(row.status) && typeof row.title === 'string'
    && Array.isArray(row.details) && row.details.every((line) => typeof line === 'string')
    ? { ...row, canContinue: row.status === 'met' } : null;
}
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'gear', label: '角色装备', icon: 'equipment' },
  { id: 'plan', label: '制作策略', icon: 'route' }, { id: 'simulate', label: '自由模拟', icon: 'hammer' },
  { id: 'trade', label: '官方查价', icon: 'search' }, { id: 'settings', label: '数据与价格', icon: 'sliders' },
];
const SOURCE_NAMES: Record<string, string> = { normal: '普通词缀', essence: '普通精华专属', perfect: '完美精华专属', alloy: '合金专属', desecrated: '亵渎专属', rune: '符文词缀' };
const RARITY_NAMES = { normal: '普通', magic: '魔法', rare: '稀有' };
const CURRENCY_LABELS: Record<string, string> = {
  transmute: '蜕变石', augment: '增幅石', regal: '富豪石', exalt: '崇高石', annul: '剥离石', chaos: '混沌石', alchemy: '点金石',
  transmute_greater: '高阶蜕变石', transmute_perfect: '完美蜕变石', augment_greater: '高阶增幅石', augment_perfect: '完美增幅石',
  regal_greater: '高阶富豪石', regal_perfect: '完美富豪石', exalt_greater: '高阶崇高石', exalt_perfect: '完美崇高石',
  chaos_greater: '高阶混沌石', chaos_perfect: '完美混沌石', divine: '神圣石', desecrate: '亵渎材料',
};
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    route: <><path d="M5 5h5v5H5zM14 14h5v5h-5zM7.5 10v6.5H14M10 7.5h6.5V14" /></>,
    hammer: <><path d="m13 3 8 8-3 3-8-8zM12 10 3 19l2 2 9-9M9 5l3-3" /></>,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
    sliders: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" /><circle cx="15" cy="17" r="3" /></>,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    external: <><path d="M14 3h7v7M21 3 11 13M10 5H4v16h16v-6" /></>,
    ring: <><ellipse cx="12" cy="15" rx="7" ry="6" /><path d="m8 5 4-3 4 3-4 5zM8 5h8M9 10l-2-2M15 10l2-2" /></>,
    equipment: <><path d="m8 3 4 2 4-2 5 5-3 4-2-1v10H8V11l-2 1-3-4z" /><path d="M9 4v4h6V4" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    paste: <><path d="M9 5H5v16h14V5h-4M9 3h6v5H9zM8 12h8M8 16h6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    undo: <><path d="M8 5 3 10l5 5M3 10h11a6 6 0 0 1 0 12" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.ring}</svg>;
}

export default function WorkbenchApp() {
  const [session, setSession] = useState<Session>(loadSession);
  const { item, targets, baseName, options, overrides, league } = session;
  const [engine, setEngine] = useState<Engine | null>(null);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<Tab>('plan');
  const [search, setSearch] = useState('');
  const [side, setSide] = useState<'all' | 'prefix' | 'suffix'>('all');
  const [source, setSource] = useState<'all' | EngineMod['source']>('normal');
  const [pickerMode, setPickerMode] = useState<'target' | 'current'>('target');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteDraft, setPasteDraft] = useState(session.raw);
  const [notice, setNotice] = useState('');
  const [importWarnings, setImportWarnings] = useState<string[]>(session.warnings ?? []);
  const [needsReview, setNeedsReview] = useState(session.reviewRequired ?? Boolean(session.raw));
  const [blockedReason, setBlockedReason] = useState(session.craftingBlocked ?? '');
  const [result, setResult] = useState<SolveResult | null>(null);
  const [solvedSig, setSolvedSig] = useState('');
  const [solving, setSolving] = useState(false);
  const [advisorBusy, setAdvisorBusy] = useState(false);
  const [progress, setProgress] = useState<SolveProgress | null>(null);
  const [solveError, setSolveError] = useState('');
  const [effort, setEffort] = useState(15_000);
  const [playOut, setPlayOut] = useState(false);
  const [took, setTook] = useState(0);
  const [selectedNode, setSelectedNode] = useState('');
  const [leagues, setLeagues] = useState<TradeLeague[]>([]);
  const [leagueError, setLeagueError] = useState('');
  const [tradeData, setTradeData] = useState<GearTrade | null>(null);
  const [simulation, setSimulation] = useState<{ before: ExistingItem; after: ExistingItem; label: string; cost: number; priceKnown: boolean }[]>([]);
  const [historyAt, setHistoryAt] = useState(0);
  const [profitInputs, setProfitInputs] = useState({ current: '', quick: '', fair: '', optimistic: '' });
  const [quickPrice, setQuickPrice] = useState<{ id: string; deliveryToken?: string; raw: string; item: ExistingItem; baseName: string; warnings: readonly string[]; complete: boolean } | null>(null);
  const [equipmentPrice, setEquipmentPrice] = useState<{ id: string; deliveryToken?: string; raw: string; source: 'hotkey' | 'paste' | 'loadout'; intent: 'price' | 'upgrade' } | null>(null);
  const runner = useRef<ReturnType<typeof computeWorkbench> | null>(null);
  const lastSignature = useRef('');
  const importRecoveryChecked = useRef(false);
  const companionHandler = useRef<(packet: CompanionPacket) => void>(() => {});
  const update = (patch: Partial<Session>) => setSession((old) => ({ ...old, ...patch }));

  useEffect(() => {
    if (!engine || importRecoveryChecked.current) return;
    importRecoveryChecked.current = true;
    const recovered = recoverLegacyImport(engine.data, session);
    if (!recovered) return;
    setSession((old) => ({ ...old, item: { ...old.item, prefixes: recovered.prefixes, suffixes: recovered.suffixes },
      reviewRequired: false, craftingBlocked: '', warnings: [], actualRollsInvalid: false }));
    setImportWarnings([]); setNeedsReview(false); setBlockedReason('');
    setNotice('已用原始文本重新识别旧会话中的亵渎／破裂词缀，并清除过期的导入警告。');
  }, [engine, session]);

  useEffect(() => { let active = true; loadEngine().then((value) => { if (active) setEngine(value); }).catch((error: unknown) => { if (active) setLoadError(String(error)); }); return () => { active = false; }; }, []);
  useEffect(() => subscribeCompanion((packet) => companionHandler.current(packet)), []);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...session, reviewRequired: needsReview, craftingBlocked: blockedReason, warnings: importWarnings })); } catch { /* The session remains usable without storage. */ } }, [session, needsReview, blockedReason, importWarnings]);
  useEffect(() => () => runner.current?.cancel(), []);
  useEffect(() => {
    const controller = new AbortController();
    fetchTradeLeagues(controller.signal).then((rows) => {
      setLeagues(rows);
      // A league list has no guaranteed chronological ordering. Let the player choose explicitly.
    }).catch(() => { if (!controller.signal.aborted) setLeagueError('未能获取赛季列表，请填写官方交易页上的赛季名称。'); });
    loadGearTrade().then(setTradeData).catch(() => setLeagueError('交易属性映射加载失败，请刷新重试。'));
    return () => controller.abort();
  }, []);

  const effectiveEngine = useMemo(() => engine ? { ...engine, prices: { ...engine.prices, currency: { ...engine.prices.currency, ...overrides } } } : null, [engine, overrides]);
  const basis = engine ? priceBasis(engine) : null;
  const availableMods = useMemo(() => {
    if (!engine) return [];
    const normal = listMods(engine.data, item.baseId);
    return [...normal.prefixes, ...normal.suffixes, ...listPerfectEssences(engine.data, item.baseId), ...listDesecrated(engine.data, item.baseId)];
  }, [engine, item.baseId]);
  const modById = useMemo(() => new Map(availableMods.map((mod) => [mod.id, mod])), [availableMods]);
  const signature = JSON.stringify({ item, targets, options, overrides, baseName, blockedReason, needsReview, effort, playOut, baseCost: session.baseCost });
  const stale = Boolean(result && solvedSig !== signature);
  const baseInfo = findJewelleryBase(baseName);
  const restriction = blockedReason || (!baseInfo ? '尚未确认具体底座，请从列表选择正确底座并重新核对当前词缀。' : null)
    || (baseInfo && !baseInfo.supported ? baseInfo.unsupportedReason ?? '这个特殊底座的制作规则尚未支持。' : null)
    || (needsReview ? '导入内容需要核对，请补齐当前词缀后确认。' : null);
  const validation = restriction ?? validateCraft(item, targets, modById, options);

  useEffect(() => {
    lastSignature.current = signature;
    if (solving && solvedSig !== signature) runner.current?.cancel();
  }, [signature, solvedSig, solving]);

  const filteredMods = availableMods.filter((mod) => {
    if (side !== 'all' && mod.type !== side) return false;
    if (source !== 'all' && mod.source !== source && !(source === 'normal' && mod.source === 'rune')) return false;
    if (!mod.tiers.some((tier) => tier.ilvl <= item.level)) return false;
    return searchText(mod.text, translateMod(mod.text), mod.id, SOURCE_NAMES[mod.source] ?? '').includes(searchText(search));
  });
  const plan = result ? result.kind === 'item' ? result.plan : result.result : null;
  const markov = result?.markov;
  const resultView = markov ? presentMarkovResult(markov) : null;
  const currentNode = resultView?.hasCost ? markov?.nodes.find((node) => node.key === selectedNode) ?? markov?.nodes.find((node) => node.isStart) : undefined;
  const expectedCost = resultView?.hasCost ? markov!.expectedCost : null;
  const simActions = useMemo(() => effectiveEngine ? getCraftActions(effectiveEngine, item) : [], [effectiveEngine, item]);
  const simSpent = simulation.slice(0, historyAt).reduce((sum, entry) => sum + entry.cost, 0);
  const simUnpriced = simulation.slice(0, historyAt).filter((entry) => !entry.priceKnown).length;

  function setItem(next: ExistingItem, resetHistory = true) {
    update({ item: next, actualRollsInvalid: true });
    if (resetHistory) { setSimulation([]); setHistoryAt(0); }
  }
  function chooseBase(name: string) {
    const base = findJewelleryBase(name);
    if (!base) return;
    update({ baseName: base.english, item: { ...item, baseId: base.category, prefixes: [], suffixes: [], rarity: 'normal' }, targets: [], raw: '', actualRollsInvalid: false, checkpoint: null, checkpointReview: null });
    setBlockedReason(''); setNeedsReview(false); setImportWarnings([]); setSimulation([]); setHistoryAt(0); setNotice('');
  }
  function openEquipmentPrice(raw: string, source: 'hotkey' | 'paste' | 'loadout', intent: 'price' | 'upgrade' = 'price', packet?: CompanionPacket): boolean {
    const equipment = parseEquipment(raw);
    if (!equipment) { setNotice('没有识别到可查价的装备，请复制完整装备文本。'); return false; }
    setEquipmentPrice({ id: packet?.id ?? crypto.randomUUID(), deliveryToken: packet?.deliveryToken, raw, source, intent });
    setQuickPrice(null); setTab('trade'); setPasteOpen(false);
    return true;
  }
  function importText(text = session.raw, purpose: 'auto' | 'checkpoint' | 'new-craft' = 'auto') {
    const general = purpose === 'auto' ? parseEquipment(text) : null;
    if (general && (!engine || general.rarity === 'unique' || !['accessory.ring', 'accessory.amulet'].includes(general.category))) {
      openEquipmentPrice(text, 'paste');
      setNotice('装备已送入全装备查价。角色装备栏可保存整套装备并比较换装。');
      return;
    }
    if (!engine) { setNotice('制作数据尚未就绪，请稍候再试；角色装备栏与全装备查价仍可使用。'); return; }
    const activeCheckpoint = purpose === 'new-craft' ? null : session.checkpoint;
    const rejectImport = (message: string) => {
      setNotice(message);
      if (!activeCheckpoint) return;
      const review: CheckpointReview = { status: 'unresolved', title: '本步结果尚未确认', details: [message, '已保留原制作状态，请重新复制完整装备文本。'], canContinue: false };
      update({ raw: text, checkpointReview: review });
      setPasteDraft(text);
      setPasteOpen(true);
      return review;
    };
    const parsed = parseWorkbenchItem(engine.data, text);
    if (purpose === 'auto' && (!parsed?.baseId || !['Rings', 'Amulets'].includes(parsed.baseId) || parsed.rarity === 'unique')) {
      if (openEquipmentPrice(text, 'paste')) {
        setNotice('装备已送入全装备查价。角色装备栏可保存整套装备并比较换装。');
        return;
      }
    }
    if (!parsed) return rejectImport('没有识别到装备，请粘贴游戏中复制的完整文本。');
    if (!parsed.baseId || !['Rings', 'Amulets'].includes(parsed.baseId)) return rejectImport('首版仅支持戒指和项链，请检查底座名称。');
    if (parsed.rarity === 'unique') return rejectImport('首版制作策略支持普通、魔法与稀有装备，暂不支持传奇装备。');
    const next: ExistingItem = {
      baseId: parsed.baseId, level: parsed.level ?? item.level, rarity: parsed.rarity,
      prefixes: parsed.prefixes, suffixes: parsed.suffixes,
    };
    const name = parsed.baseNameEnglish || parsed.baseName;
    const checkpointReview = activeCheckpoint ? evaluateCheckpoint(activeCheckpoint, { item: next, baseName: name, complete: parsed.complete }) : null;
    if (checkpointReview && ['mismatch', 'unresolved'].includes(checkpointReview.status)) {
      update({ raw: text, checkpointReview }); setPasteDraft(text); setPasteOpen(true);
      setNotice(checkpointReview.title); setImportWarnings([...parsed.warnings, ...parsed.unmatchedLines.map((line) => `未识别：${line}`)]);
      if (checkpointReview.status === 'unresolved') setNeedsReview(true);
      return checkpointReview;
    }
    update({ item: next, baseName: name, raw: text, actualRollsInvalid: false,
      ...(purpose === 'new-craft' ? { checkpoint: null, checkpointReview: null } : {}),
      ...(checkpointReview ? { checkpointReview } : {}),
      targets: purpose !== 'new-craft' && item.baseId === next.baseId && targets.length ? targets : [...next.prefixes, ...next.suffixes].map(({ modId, tierDisplay }) => ({ modId, tierDisplay })),
    });
    setPasteDraft(text);
    setBlockedReason(parsed.craftingBlocked ? parsed.blockedReason ?? '这件装备的状态不允许继续制作。' : '');
    setImportWarnings([...parsed.warnings, ...parsed.unmatchedLines.map((line) => `未识别：${line}`)]);
    setNeedsReview(!parsed.complete);
    setPasteOpen(!parsed.complete);
    setNotice(parsed.complete ? '装备已导入。选择目标后，就可以计算下一步。' : '已导入能确认的部分，请核对下方提示并补齐当前词缀。');
    setSimulation([]); setHistoryAt(0);
    return checkpointReview ?? undefined;
  }
  useEffect(() => { companionHandler.current = (packet) => {
    if (packet.mode === 'checkpoint') {
      if (!engine) {
        void publishCompanion(packet.id, { status: 'error', message: '制作数据尚未就绪，请打开工坊稍候再核对锚点。' }, packet.deliveryToken); return;
      }
      if (!session.checkpoint) {
        void publishCompanion(packet.id, { status: 'error', message: '请先在工坊设置本步制作锚点。', detail: 'Ctrl+Alt+G 用于核对操作后的结果。' }, packet.deliveryToken); return;
      }
      setTab('plan');
      const review = importText(packet.raw, 'checkpoint');
      void publishCompanion(packet.id, { status: review?.canContinue ? 'ready' : 'error', message: review?.title ?? '装备未能完整识别，请在工坊核对。', detail: review?.details.join('\n') ?? '已保留原制作状态，尚未批准下一步。' }, packet.deliveryToken);
      return;
    }
    const general = parseEquipment(packet.raw);
    if (general && (!engine || general.rarity === 'unique' || !['accessory.ring', 'accessory.amulet'].includes(general.category))) {
      openEquipmentPrice(packet.raw, 'hotkey', 'price', packet); return;
    }
    if (!engine) {
      void publishCompanion(packet.id, { status: 'error', message: '装备文本未识别，请复制完整物品信息并在工坊核对。' }, packet.deliveryToken); return;
    }
    const parsed = parseWorkbenchItem(engine.data, packet.raw);
    if (!parsed || !parsed.baseId || !['Rings', 'Amulets'].includes(parsed.baseId) || parsed.level === undefined || parsed.rarity === 'unique' || !parsed.complete) {
      if (!openEquipmentPrice(packet.raw, 'hotkey', 'price', packet)) void publishCompanion(packet.id, { status: 'error', message: '装备类别或文本未能识别，请在工坊核对。' }, packet.deliveryToken);
      return;
    }
    setEquipmentPrice(null);
    setQuickPrice({ id: packet.id, deliveryToken: packet.deliveryToken, raw: packet.raw,
      item: { baseId: parsed.baseId, level: parsed.level, rarity: parsed.rarity, prefixes: parsed.prefixes, suffixes: parsed.suffixes },
      baseName: parsed.baseNameEnglish ?? parsed.baseName, complete: parsed.complete,
      warnings: [...parsed.warnings, ...parsed.unmatchedLines.map((line) => `未识别：${line}`)] });
    setTab('trade');
    if (!parsed.complete) void publishCompanion(packet.id, { status: 'error', message: '部分装备内容需要核对，已在工坊展示。', detail: parsed.warnings.join('\n') }, packet.deliveryToken);
  }; });
  function addMod(mod: EngineMod) {
    const tier = mod.tiers.find((candidate) => candidate.ilvl <= item.level
      && (pickerMode === 'current' || targetAvailability(item, mod, candidate.display, options).allowed));
    if (!tier) {
      const first = mod.tiers.find((candidate) => candidate.ilvl <= item.level);
      setNotice(first ? targetAvailability(item, mod, first.display, options).reason ?? '当前状态无法添加这个目标。' : '物品等级不足，无法选择这个词缀。');
      return;
    }
    const isCrafted = (source: string) => ['essence', 'perfect', 'alloy'].includes(source);
    const entries = pickerMode === 'target' ? targets : [...item.prefixes, ...item.suffixes];
    if (isCrafted(mod.source) && entries.some((entry) => isCrafted(modById.get(entry.modId)?.source ?? ''))) {
      setNotice('当前规则只允许一条精华／合金制作词缀，请先移除已有制作词缀。'); return;
    }
    if (pickerMode === 'target') {
      if (targets.some((entry) => entry.modId === mod.id)) return;
      const families = new Set(targets.flatMap((entry) => modFamilies(modById.get(entry.modId))));
      if (modFamilies(mod).some((family) => families.has(family))) { setNotice('目标中已经有同组词缀，请先移除冲突词缀。'); return; }
      if (targets.filter((entry) => modById.get(entry.modId)?.type === mod.type).length >= 3) { setNotice('每侧最多选择三条目标词缀。'); return; }
      update({ targets: [...targets, { modId: mod.id, tierDisplay: tier.display }] });
    } else {
      const all = [...item.prefixes, ...item.suffixes];
      const families = new Set(all.flatMap((entry) => modFamilies(modById.get(entry.modId))));
      if (modFamilies(mod).some((family) => families.has(family))) { setNotice('当前装备已有同组词缀。'); return; }
      const field = mod.type === 'prefix' ? 'prefixes' : 'suffixes';
      const cap = item.rarity === 'magic' ? 1 : 3;
      if (item[field].length >= cap) { setNotice('这一侧的词缀槽位已满。'); return; }
      setItem({ ...item, rarity: item.rarity === 'normal' ? 'rare' : item.rarity, [field]: [...item[field], { modId: mod.id, tierDisplay: tier.display }] });
    }
    setNotice('');
  }
  function quickTarget() {
    const ids = item.baseId === 'Rings' ? ['Rings/IncreasedLife', 'Rings/FireResistance', 'Rings/ColdResistance']
      : ['Amulets/IncreasedLife', 'Amulets/BaseSpirit', 'Amulets/AllAttributes'];
    const next = ids.flatMap((id) => {
      const mod = modById.get(id);
      const tier = mod?.tiers.find((entry) => entry.display >= 3 && entry.ilvl <= item.level) ?? mod?.tiers.find((entry) => entry.ilvl <= item.level);
      return tier ? [{ modId: id, tierDisplay: tier.display }] : [];
    });
    update({ targets: next }); setNotice('已载入可编辑的目标示例；这不是盈利推荐。');
  }
  async function calculate() {
    if (!engine || validation || advisorBusy) return;
    const start = performance.now();
    setSolveError(''); setProgress(null); setSolving(true); setSolvedSig(signature); setResult(null);
    try {
      const request = makeSolveRequest(engine, item, targets, modById, options, effort, session.baseCost, playOut);
      const job = computeWorkbench(request, overrides, setProgress);
      runner.current = job;
      const answer = await job.promise;
      if (lastSignature.current !== signature) return;
      setResult(answer); setSelectedNode(answer.markov.nodes.find((node) => node.isStart)?.key ?? '');
      setTook((performance.now() - start) / 1000);
    } catch (error) { setSolveError(error instanceof Error ? error.message : String(error)); }
    finally { setSolving(false); runner.current = null; }
  }
  function adoptAdvice(nextTargets: readonly TargetInput[], answer?: SolveResult, seconds?: number) {
    if (solving) return;
    const next = [...nextTargets];
    update({ targets: next });
    if (answer) {
      setResult(answer);
      setSolvedSig(JSON.stringify({ item, targets: next, options, overrides, baseName, blockedReason, needsReview, effort, playOut, baseCost: session.baseCost }));
      setSelectedNode(answer.markov.nodes.find((node) => node.isStart)?.key ?? '');
      setTook(seconds ?? 0); setSolveError('');
      setNotice('已载入评估方案的目标与通货顺序。请按每次游戏结果重新导入装备。');
      window.setTimeout(() => document.querySelector('.wb-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    } else setNotice('已采用建议目标，可在下方调整并计算制作策略。');
  }
  function simulate(action: string) {
    if (!effectiveEngine || restriction) return;
    try {
      const outcome = simulateCraft(effectiveEngine, item, action);
      const log = [...simulation.slice(0, historyAt), { before: item, after: outcome.item, label: outcome.description, cost: outcome.cost, priceKnown: outcome.priceKnown }];
      setSimulation(log); setHistoryAt(log.length); setItem(outcome.item, false); setNotice(outcome.description);
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  }
  function undo() {
    const entry = simulation[historyAt - 1];
    if (entry) { setItem(entry.before, false); setHistoryAt(historyAt - 1); }
  }
  function redo() {
    const entry = simulation[historyAt];
    if (entry) { setItem(entry.after, false); setHistoryAt(historyAt + 1); }
  }
  function editCurrent(entry: ItemModInput, patch: Partial<ItemModInput>) {
    setItem({ ...item, prefixes: item.prefixes.map((mod) => mod === entry ? { ...mod, ...patch } : mod), suffixes: item.suffixes.map((mod) => mod === entry ? { ...mod, ...patch } : mod) });
  }
  function removeCurrent(entry: ItemModInput) {
    setItem({ ...item, prefixes: item.prefixes.filter((mod) => mod !== entry), suffixes: item.suffixes.filter((mod) => mod !== entry) });
  }
  function replacementFor(mod: EngineMod, entry: ItemModInput) {
    const alternative = regularAlternative(mod, modById);
    if (!alternative || targets.some((target) => target.modId === alternative.id)) return null;
    const originalTier = mod.tiers.find((tier) => tier.display === entry.tierDisplay);
    const legal = alternative.tiers.filter((tier) => tier.ilvl <= item.level && targetAvailability(item, alternative, tier.display, options).allowed);
    // Match the actual range when possible; display the new range explicitly if it differs.
    const tier = legal.find((candidate) => candidate.values.join('|') === originalTier?.values.join('|')) ?? legal[0];
    return tier ? { mod: alternative, tier } : null;
  }
  function replaceWithNormal(entry: ItemModInput, replacement: NonNullable<ReturnType<typeof replacementFor>>) {
    update({ targets: targets.map((target) => target.modId === entry.modId
      ? { modId: replacement.mod.id, tierDisplay: replacement.tier.display } : target) });
    setNotice(`已改选普通来源：${translateModAtTier(replacement.mod, replacement.tier.display)}。请核对目标阶级与数值范围；装备本身没有改变。`);
  }
  function renderMod(entry: ItemModInput, target: boolean) {
    const mod = modById.get(entry.modId);
    if (!mod) return <div className="wb-mod" key={entry.modId}>无法识别：{entry.modId}<button onClick={() => target ? update({ targets: targets.filter((row) => row.modId !== entry.modId) }) : removeCurrent(entry)}>移除</button></div>;
    const availability = target ? targetAvailability(item, mod, entry.tierDisplay, options) : null;
    const displaySource = !target && entry.desecrated ? 'desecrated' : mod.source;
    const replacement = target && availability && !availability.allowed ? replacementFor(mod, entry) : null;
    return <div key={entry.modId} className="wb-mod-entry" data-mod-id={mod.id}><div className={`wb-mod ${mod.type}`}>
      <span className="wb-mod-side">{mod.type === 'prefix' ? '前' : '后'}</span>
      <div className="wb-mod-text"><strong>{translateModAtTier(mod, entry.tierDisplay)}</strong><span className={`wb-source-badge source-${displaySource}`}>{!target && entry.desecrated ? '已亵渎' : SOURCE_NAMES[displaySource]}</span><small title={mod.text}>{mod.text}</small>
        {!target && <label className="wb-tiny-check"><input type="checkbox" checked={entry.fractured ?? false} onChange={(event) => editCurrent(entry, { fractured: event.target.checked })} /> 已锁定／破裂</label>}
      </div>
      <select aria-label={`${target ? '目标' : '当前'}${translateMod(mod.text)}阶级`} value={entry.tierDisplay} onChange={(event) => {
        const tierDisplay = Number(event.target.value);
        if (target) update({ targets: targets.map((row) => row.modId === entry.modId ? { ...row, tierDisplay } : row) });
        else editCurrent(entry, { tierDisplay });
      }}>{mod.tiers.filter((tier) => tier.ilvl <= item.level || tier.display === entry.tierDisplay).map((tier) => <option key={tier.display} value={tier.display}>T{tier.display} · {tier.range || tier.name}{tier.ilvl > item.level ? '（物等不足）' : ''}</option>)}</select>
      <button className="wb-remove" aria-label={`移除${target ? '目标' : '当前'}${translateMod(mod.text)}`} onClick={() => target ? update({ targets: targets.filter((row) => row.modId !== entry.modId) }) : removeCurrent(entry)}>×</button>
    </div>{availability && !availability.allowed && <div className="wb-target-issue" role="status"><p>{availability.reason}</p>{replacement && <button className="wb-button" onClick={() => replaceWithNormal(entry, replacement)}>改选普通词缀 · T{replacement.tier.display} · {replacement.tier.range || replacement.tier.name}</button>}</div>}</div>;
  }

  return <div className="wb-app">
    <aside className="wb-rail"><a className="wb-brand-mark" href="#" aria-label="PoE2 制作工坊"><Icon name="ring" size={30} /></a><div className="wb-rail-line" />
      {TABS.map((entry) => <button key={entry.id} title={entry.label} aria-label={entry.label} className={tab === entry.id ? 'active' : ''} onClick={() => setTab(entry.id)}><Icon name={entry.icon} size={21} /></button>)}
      <span className="wb-rail-bottom">II</span>
    </aside>
    <div className="wb-shell">
      <header className="wb-header"><div><span className="wb-eyebrow">PATH OF EXILE 2 · PERSONAL WORKBENCH</span><h1>制作工坊 <span>CRAFT LAB</span></h1></div>
        <div className="wb-header-meta"><span className="wb-local"><i /> 本地计算</span><span className="wb-chip">国际服 · 简体界面</span><a href="https://www.pathofexile.com/trade2" target="_blank" rel="noreferrer">官方交易 <Icon name="external" size={14} /></a></div>
      </header>
      <section className="wb-intro"><div><span className="wb-eyebrow">从你手里的装备，找到下一步。</span><h2>先算清楚，再花通货<span>。</span></h2><p>全装备查价、保存角色装备并比较换装；戒指和项链可继续规划制作。</p></div>
        <button className="wb-button primary" onClick={() => { if (!pasteOpen) setPasteDraft(session.raw); setPasteOpen(!pasteOpen); }}><Icon name="paste" /> {pasteOpen ? '收起导入' : '粘贴游戏装备'} <span>Ctrl + Alt + C</span></button>
      </section>
      <div className="wb-data-strip"><span><i /> 规则快照 <b>{engine?.data.patch ?? '加载中'}</b> · 与 0.5.5e 差异待核验</span><span>价格 <b>{basis?.asOf?.slice(0, 10) ?? '加载中'}</b> · {basis?.league ?? '—'}</span><button onClick={() => setTab('settings')}>查看来源与价格设置 <Icon name="arrow" size={13} /></button></div>
      {loadError && <div role="alert" className="wb-alert error">数据加载失败：{loadError}<button onClick={() => window.location.reload()}>重新加载</button></div>}
      {notice && <div className="wb-alert" role="status">{notice}<button aria-label="关闭提示" onClick={() => setNotice('')}>×</button></div>}
      {pasteOpen && <section className="wb-panel wb-paste"><div className="wb-section-head"><h3>导入游戏装备</h3><span>支持繁体中文、简体中文与英文；无法确认的词缀会保留提示。</span></div>
        <textarea aria-label="游戏装备文本" placeholder={'在游戏中高级复制任意部位的装备，将完整文本粘贴到这里。整套装备可在“角色装备”按槽位保存。'} value={pasteDraft} onChange={(event) => setPasteDraft(event.target.value)} />
        <div className="wb-actions"><button className="wb-button primary" disabled={!pasteDraft.trim()} onClick={() => importText(pasteDraft)}>识别并导入 <Icon name="arrow" size={16} /></button><button className="wb-button" onClick={() => { setTab('gear'); setPasteOpen(false); }}>打开全身装备栏</button><button className="wb-button" disabled={!engine} onClick={() => importText(EXAMPLE_RING)}>试用戒指示例</button><button className="wb-button" disabled={!engine} onClick={() => importText(EXAMPLE_AMULET)}>试用项链示例</button></div>
      </section>}
      {importWarnings.length > 0 && <div className="wb-alert warning"><div><strong>导入核对</strong><ul>{importWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul><div className="wb-actions"><button className="wb-button" disabled={!engine || !session.raw.trim()} onClick={() => importText()}>重新识别当前原文</button>{needsReview && !blockedReason && <button className="wb-button" onClick={() => { setNeedsReview(false); setImportWarnings([]); setNotice('已使用你人工核对后的当前词缀。'); }}>我已补齐并核对当前词缀</button>}</div></div></div>}
      <nav className="wb-tabs" aria-label="工作区域">{TABS.map((entry) => <button key={entry.id} onClick={() => setTab(entry.id)} className={tab === entry.id ? 'active' : ''}><Icon name={entry.icon} size={16} />{entry.label}{entry.id === 'plan' && <span>01</span>}</button>)}</nav>
      <div className={`wb-layout${tab === 'gear' || (tab === 'trade' && equipmentPrice) ? ' is-equipment' : ''}`}>
        <aside className="wb-item-column">
          <section className="wb-panel"><div className="wb-section-head"><h3>当前装备</h3><span className="wb-tag">起点</span></div>
            <div className={`wb-item-card ${item.rarity}`}><OfficialItemArt baseName={baseName} label={baseInfo?.simplified ?? translateBase(baseName)} fallback={<Icon name="ring" size={74} />} /><small>{RARITY_NAMES[item.rarity]} · {item.baseId === 'Rings' ? '戒指' : '项链'}</small><h3>{baseInfo?.simplified ?? translateBase(baseName)}</h3><p>{baseName}</p><div className="wb-item-stats"><span>物品等级 <b>{item.level}</b></span><span>前缀 <b>{item.prefixes.length}/3</b></span><span>后缀 <b>{item.suffixes.length}/3</b></span></div></div>
            <div className="wb-fields"><label>装备类型<select aria-label="装备类型" value={item.baseId} onChange={(event) => chooseBase(event.target.value === 'Rings' ? 'Amethyst Ring' : 'Stellar Amulet')}><option value="Rings">戒指</option><option value="Amulets">项链</option></select></label>
              <label>物品等级<input aria-label="物品等级" type="number" min="1" max="100" value={item.level} onChange={(event) => setItem({ ...item, level: Number(event.target.value) })} /></label>
              <label className="wide">装备底座<select aria-label="装备底座" value={baseName} onChange={(event) => chooseBase(event.target.value)}>{JEWELLERY_BASES.filter((base) => base.category === item.baseId).map((base) => <option key={base.english} value={base.english}>{base.simplified} · {base.english}{base.supported ? '' : '（特殊规则未支持）'}</option>)}</select></label>
              <label className="wide">当前稀有度<select aria-label="当前稀有度" value={item.rarity} onChange={(event) => setItem({ ...item, rarity: event.target.value as ExistingItem['rarity'] })}><option value="normal">普通 · 从空白底座开始</option><option value="magic">魔法 · 已有装备</option><option value="rare">稀有 · 已有装备</option></select></label>
            </div>
            {[...item.prefixes, ...item.suffixes].length ? <div className="wb-current-mods">{[...item.prefixes, ...item.suffixes].map((entry) => renderMod(entry, false))}</div> : <p className="wb-empty-small">目前没有显式词缀。可以粘贴装备，或从词缀库手动补充。</p>}
            <button className="wb-text-button" onClick={() => { setPickerMode('current'); setTab('plan'); }}>手动编辑当前词缀 <Icon name="plus" size={14} /></button>
            {restriction && <p className="wb-inline-warning">{restriction}</p>}
          </section>
          <section className="wb-panel wb-notebook"><span className="wb-eyebrow">使用方式</span><h3>每做一步，更新一次。</h3><p>在游戏里使用通货后，重新复制装备。目标会保留，系统从新的状态计算。</p><button className="wb-text-button" onClick={() => setPasteOpen(true)}>更新装备状态 <Icon name="arrow" size={14} /></button></section>
          <div className="wb-attribution">基于 <a href="https://github.com/Dboire9/POE2_HTC" target="_blank" rel="noreferrer">POE2_HTC</a> · AGPL-3.0<br />词缀参考 PoE2DB / PoE2 Wiki<br />本工具为个人制作辅助，价格并非成交保证。</div>
        </aside>
        <main className="wb-main">
          <div hidden={tab !== 'gear'}><LoadoutPanel league={league} onPrice={(raw, intent) => { openEquipmentPrice(raw, 'loadout', intent); }} onCraft={(raw) => { setQuickPrice(null); setEquipmentPrice(null); setTab('plan'); importText(raw, 'new-craft'); }} /></div>
          {tab === 'plan' && engine && <CraftCheckpointPanel item={item} baseName={baseName} targets={targets} mods={modById} anchor={session.checkpoint ?? null} review={session.checkpointReview ?? null} suggestedAction={currentNode?.action} onAnchor={(checkpoint) => update({ checkpoint, checkpointReview: null })} onCheckText={(raw) => { importText(raw, 'checkpoint'); }} onRecalculate={() => { if (!validation && !advisorBusy && !solving) void calculate(); else document.querySelector('.wb-compute')?.scrollIntoView({ behavior: 'smooth' }); }} />}
          {engine && <div hidden={tab !== 'plan'}><CraftAdvisor engine={engine} mods={modById} item={item} targets={targets} baseName={baseName} options={options} overrides={overrides} restriction={restriction} league={league} tradeData={tradeData} effort={effort} baseCost={session.baseCost} playOut={playOut} currentResult={stale ? null : result} mainSolving={solving} onBusyChange={setAdvisorBusy} onAdopt={adoptAdvice} /></div>}
          {tab === 'plan' && <>
            <section className="wb-panel wb-goals"><div className="wb-section-head"><div><span className="wb-eyebrow">01 / DEFINE YOUR TARGET</span><h3>你想把它做成什么？</h3></div><button className="wb-text-button" onClick={quickTarget} disabled={!engine}>载入目标示例 <Icon name="arrow" size={14} /></button></div>
              {targets.length ? <div className="wb-targets">{targets.map((entry) => renderMod(entry, true))}</div> : <div className="wb-goal-empty"><Icon name="plus" size={24} /><div><strong>从下方词缀库添加目标</strong><p>按物等筛选可用阶级，T1 为最高阶；其他词缀允许保留。</p></div></div>}
              <div className="wb-goal-footer"><span>{targets.filter((entry) => modById.get(entry.modId)?.type === 'prefix').length}/3 前缀 <i /> {targets.filter((entry) => modById.get(entry.modId)?.type === 'suffix').length}/3 后缀 · 稀有成品</span><div><button className="wb-text-button" onClick={() => update({ targets: [...item.prefixes, ...item.suffixes].map(({ modId, tierDisplay }) => ({ modId, tierDisplay })) })} disabled={!item.prefixes.length && !item.suffixes.length}>以当前词缀为目标</button><button className="wb-text-button muted" onClick={() => update({ targets: [] })}>清空</button></div></div>
            </section>
            <section className="wb-panel wb-library"><div className="wb-section-head"><div><span className="wb-eyebrow">AFFIX LIBRARY</span><h3>底座词缀库 <span className="wb-count">{filteredMods.length}</span></h3></div><div className="wb-segment"><button className={pickerMode === 'target' ? 'active' : ''} onClick={() => setPickerMode('target')}>添加到目标</button><button className={pickerMode === 'current' ? 'active' : ''} onClick={() => setPickerMode('current')}>添加到当前</button></div></div>
              <div className="wb-library-controls"><label className="wb-search"><Icon name="search" size={16} /><input aria-label="搜索词缀" placeholder="搜索生命、抗性、施法速度…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label="词缀类型" value={side} onChange={(event) => setSide(event.target.value as typeof side)}><option value="all">全部词缀</option><option value="prefix">仅前缀</option><option value="suffix">仅后缀</option></select><select aria-label="词缀来源" value={source} onChange={(event) => setSource(event.target.value as typeof source)}><option value="normal">普通词缀</option><option value="all">所有来源</option><option value="essence">普通精华专属</option><option value="perfect">完美精华专属</option><option value="alloy">合金专属</option><option value="desecrated">亵渎专属</option></select></div>
              <div className="wb-pool-head"><span>词缀 / 来源</span><span>最高可用阶级</span><span /></div><div className="wb-pool-list">{filteredMods.map((mod) => {
                const best = mod.tiers.find((tier) => tier.ilvl <= item.level)!;
                const selected = (pickerMode === 'target' ? targets : [...item.prefixes, ...item.suffixes]).some((entry) => entry.modId === mod.id);
                const usableTier = pickerMode === 'target' ? mod.tiers.find((tier) => tier.ilvl <= item.level && targetAvailability(item, mod, tier.display, options).allowed) : best;
                const issue = !usableTier ? targetAvailability(item, mod, best.display, options).reason : undefined;
                return <div className="wb-pool-row" key={mod.id} data-mod-id={mod.id}><span className={`wb-dot ${mod.type}`} /><div><strong>{translateMod(mod.text)} <span className={`wb-source-badge source-${mod.source}`}>{SOURCE_NAMES[mod.source]}</span></strong><small>{mod.type === 'prefix' ? '前缀' : '后缀'}<span title={mod.text}> · {mod.text}</span></small>{issue && <p className="wb-pool-issue">{issue}</p>}</div><span className="wb-tier">T{(usableTier ?? best).display}<small>物等 {(usableTier ?? best).ilvl}+</small></span><button title={selected ? '已添加' : issue ?? `添加${translateMod(mod.text)}`} aria-label={`添加${SOURCE_NAMES[mod.source]}：${translateMod(mod.text)}`} disabled={selected || Boolean(issue)} onClick={() => addMod(mod)}>{selected ? <Icon name="check" size={16} /> : <Icon name="plus" size={17} />}</button></div>;
              })}{!filteredMods.length && <p className="wb-empty-small">{engine ? '没有匹配词缀，试试其他关键词或检查物品等级。' : '正在读取本地词缀数据…'}</p>}</div>
              <div className="wb-library-note">默认展示普通词缀。精华、完美精华与亵渎为不同来源；普通精华需要魔法装备，不能在稀有装备上新增其专属词缀。</div>
            </section>
            <section className="wb-panel wb-compute"><div className="wb-section-head"><div><span className="wb-eyebrow">02 / FIND A CRAFTING POLICY</span><h3>计算通货顺序</h3></div><select aria-label="搜索精度" value={effort} onChange={(event) => setEffort(Number(event.target.value))}><option value={5_000}>快速 · 约 5 秒</option><option value={15_000}>标准 · 约 15 秒</option><option value={60_000}>深入 · 约 60 秒</option></select></div>
              <div className="wb-checks">{([['strengths', '高阶／完美通货'], ['omens', '预兆'], ['essences', '精华／合金'], ['desecration', '亵渎（含估计权重）']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={options[key]} onChange={(event) => update({ options: { ...options, [key]: event.target.checked } })} />{label}</label>)}</div>
              <label className="wb-check"><input type="checkbox" checked={playOut} onChange={(event) => setPlayOut(event.target.checked)} /> 同时抽样验证成本分布与材料消耗（额外计算时间）</label>
              {[...item.prefixes, ...item.suffixes].some((entry) => entry.fractured) && <p className="wb-fine">已有破裂词缀会自动作为保留条件加入求解，并占用对应槽位。计算不会假设能移除它们。</p>}
              {item.rarity === 'normal' && <label className="wb-inline-field">每次重新购买底座的成本<input aria-label="底座成本" type="number" min="0" step="0.1" value={session.baseCost} onChange={(event) => update({ baseCost: Math.max(0, Number(event.target.value)) })} /><span>Ex · 当前默认不计底座成本</span></label>}
              <div className="wb-compute-bottom"><p>{advisorBusy ? '正在比较建议方案的成本；完成或停止评估后，可计算自定目标。' : validation ?? (item.rarity === 'normal' ? '从空白底座开始；可按所填成本更换底座重试。' : '从当前装备继续；策略不假设可以免费重置回原装备。')}</p><button className={`wb-button ${solving ? '' : 'primary'}`} disabled={!engine || (!solving && (Boolean(validation) || advisorBusy))} onClick={() => solving ? runner.current?.cancel() : void calculate()}>{solving ? '取消计算' : '计算制作策略'}{!solving && <Icon name="arrow" />}</button></div>
              {solving && <div className="wb-progress" role="status"><div><span>正在{progress?.phase === 'plan' ? '搜索制作路线' : progress?.phase === 'playout' ? '验证成本分布' : '求解后续决策'}…</span><span>{Math.round((progress?.fraction ?? 0) * 100)}%</span></div><progress max={1} value={progress?.fraction ?? 0} /></div>}
              {solveError && <CraftReason reason={solveError} engine={engine} />}
            </section>
            {result && <section className={`wb-panel wb-results ${stale ? 'is-stale' : ''}`}><div className="wb-section-head"><div><span className="wb-eyebrow">CRAFTING POLICY</span><h3>你的制作方案</h3></div><span className="wb-tag">{took.toFixed(1)} 秒</span></div>
              {stale && <div className="wb-alert warning">装备、目标或价格已更改，下方为上一次结果，请重新计算。</div>}
              <div className="wb-metrics"><div><small>后续期望成本 · Ex</small><strong>{resultView?.costText ?? '暂无结果'}</strong><span>{resultView?.statusText ?? '尚未获得有效结果'}</span></div><div><small>下一步建议</small><strong className="wb-action-name">{currentNode?.action ? translateCurrency(currentNode.action) : currentNode?.isGoal ? '目标已达成' : resultView?.nextText ?? '查看下方说明'}</strong><span>{item.rarity === 'normal' ? '包含允许的重试策略' : '从当前装备状态继续'}</span></div><div><small>规则与价格口径</small><strong className="wb-action-name">{markov?.assumedOdds ? '含假设权重' : '快照权重计算'}</strong><span>{basis?.league} · {Object.keys(overrides).length ? '含手动价格' : basis?.asOf?.slice(0, 10)}</span></div></div>
              {markov?.reason && <CraftReason reason={markov.reason} engine={engine} />}
              {markov?.assumedOdds && <p className="wb-inline-warning">本方案含亵渎或其他未验证权重，概率和成本均依赖该假设。</p>}
              {currentNode && <PolicyView node={currentNode} result={result} onNode={setSelectedNode} />}
              {currentNode?.action && <button className="wb-text-button" onClick={() => document.querySelector('.wb-checkpoint')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>设置这一步的制作锚点 ↑</button>}
              {plan && <details className="wb-details" open={!currentNode}><summary>固定制作路线对照 · {plan.frontier.length} 条</summary><p>以下是固定分支路线。现有装备的“重置后重试”成本不用于上方期望成本，请优先参考动态策略。</p>{plan.reason && <CraftReason reason={plan.reason} engine={engine} />}{plan.truncated && <p className="wb-inline-warning">路线搜索达到上限，可以提高搜索精度重算。</p>}{plan.frontier.slice(0, 5).map((route, routeIndex) => <div className="wb-route" key={routeIndex}><div className="wb-route-title"><strong>路线 {routeIndex + 1}</strong><span>单次分支命中 {formatPercent(route.probability)} · 单次材料 {formatCost(route.perAttempt)} Ex</span></div>{route.steps.map((step) => <div className="wb-step" key={step.n}><b>{String(step.n).padStart(2, '0')}</b><div><strong className="wb-currency-label"><OfficialCurrencyIcon currencyId={getCurrencyImageIdForAction(step.label)} label={translateCurrency(step.label)} />{translateCurrency(step.label)}</strong><span>{translateMod(step.target)}</span></div><span>{formatPercent(step.prob)}</span></div>)}</div>)}</details>}
              {markov?.replay && <><div className="wb-section-head"><h3>策略抽样验证</h3><span>{markov.replay.runs.toLocaleString()} 次完整运行</span></div><div className="wb-percentiles">{[50, 75, 90, 95].map((p) => <div key={p}><small>P{p} 成本</small><strong>{formatCost(markov.replay!.costPercentiles[p] ?? 0)} <span>Ex</span></strong></div>)}</div><p className="wb-fine">抽样均值 {formatCost(markov.replay.meanCost)} Ex；标准误差 {formatCost(markov.replay.stdErr)} Ex。分位数来自抽样，不是精确概率。</p><div className="wb-resource-table">{markov.replay.spendByMove.map((move) => <div key={move.label}><span>{translateCurrency(move.label)}</span><span>平均 {formatCost(move.count)} 次</span><b>{formatCost(move.spent)} Ex</b></div>)}</div></>}
              {markov?.replayReason && <CraftReason reason={markov.replayReason} engine={engine} />}
            </section>}
          </>}
          {tab === 'simulate' && <section className="wb-panel"><div className="wb-section-head"><div><span className="wb-eyebrow">CRAFTING SANDBOX</span><h3>花虚拟通货，试真实规则。</h3></div><span className="wb-tag">模拟操作</span></div><p className="wb-description">操作会更新左侧装备。首版模拟词缀与阶级，左侧显示阶级数值范围；不生成范围内的具体数值。完成后可切回制作策略，计算下一步。</p>
            {restriction && <p className="wb-inline-warning">{restriction}</p>}
            <div className="wb-sim-toolbar"><span>{simUnpriced ? '已知模拟消耗' : '本次模拟消耗'} <b>{formatCost(simSpent)} Ex</b>{simUnpriced > 0 && <small> · 另有 {simUnpriced} 次材料价格缺失</small>}</span><div><button className="wb-button" disabled={historyAt === 0} onClick={undo}><Icon name="undo" size={14} />撤销</button><button className="wb-button" disabled={historyAt >= simulation.length} onClick={redo}>重做</button></div></div>
            <details className="wb-currency-sources"><summary>GGG 官方通货图标 · 查看来源</summary><p>部分阶位在官方数据中共用图标，请以通货名称区分。</p><div>{simActions.map((action) => {
              const image = getOfficialCurrencyImage(action.id);
              return image ? <a key={action.id} href={image.sourceUrl} target="_blank" rel="noreferrer">{CURRENCY_LABELS[action.id] ?? action.label} ↗</a> : null;
            })}</div></details>
            <div className="wb-currency-grid">{simActions.map((action) => <button key={action.id} className="wb-currency" disabled={!action.feasible || Boolean(restriction)} title={action.reason ?? action.description} onClick={() => simulate(action.id)}><OfficialCurrencyIcon currencyId={action.id} label={CURRENCY_LABELS[action.id] ?? translateCurrency(action.label)} size="card" /><strong>{CURRENCY_LABELS[action.id] ?? translateCurrency(action.label)}</strong><small>{action.description}</small><b>{action.priceKnown ? `${formatCost(action.cost)} Ex` : '价格缺失'}</b>{!action.feasible && <span className="wb-disabled-reason">{action.reason}</span>}</button>)}</div>
            <div className="wb-section-head"><h3>操作记录</h3><span>仅保留当前会话</span></div>{simulation.length ? <div className="wb-history">{simulation.map((entry, index) => <div className={index >= historyAt ? 'undone' : ''} key={index}><b>{String(index + 1).padStart(2, '0')}</b><span>{translateCurrency(entry.label)}</span><small>{entry.priceKnown ? `${formatCost(entry.cost)} Ex` : '价格缺失'}</small></div>)}</div> : <div className="wb-empty-state"><Icon name="hammer" size={32} /><h3>从第一步开始试做</h3><p>上方会根据当前稀有度、槽位与物等启用可用通货。</p></div>}
          </section>}
          {tab === 'trade' && <section className="wb-panel">
            {(quickPrice || equipmentPrice) && <div className="wb-alert wb-companion-banner"><div><strong>{equipmentPrice?.source === 'loadout' ? '角色装备查价' : equipmentPrice?.source === 'paste' ? '全装备查价' : '快捷键查价装备'}</strong><p>此次查价独立于正在制作的装备。</p>{quickPrice?.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div><div className="wb-actions"><button className="wb-text-button" onClick={() => setTab('gear')}>回到角色装备</button><button className="wb-text-button" onClick={() => { setQuickPrice(null); setEquipmentPrice(null); }}>返回做装装备</button></div></div>}
            {equipmentPrice ? <EquipmentTradePanel key={`${equipmentPrice.id}:${equipmentPrice.deliveryToken ?? ''}:${equipmentPrice.intent}`} raw={equipmentPrice.raw} league={league} onLeague={(value) => update({ league: value })} leagues={leagues} leagueError={leagueError} intent={equipmentPrice.intent} autoEstimate={equipmentPrice.source === 'hotkey'} onEstimate={equipmentPrice.source === 'hotkey' ? (summary) => { void publishCompanion(equipmentPrice.id, { ...summary, status: summary.status ?? 'ready' }, equipmentPrice.deliveryToken); } : undefined} />
              : engine && <TradePanel key={quickPrice ? quickPrice.id + ':' + (quickPrice.deliveryToken ?? '') : 'workbench-item'} data={engine.data} tradeData={tradeData} item={quickPrice?.item ?? item} targets={quickPrice ? [] : targets} baseName={quickPrice?.baseName ?? baseName} raw={quickPrice?.raw ?? session.raw} actualRollsInvalid={!quickPrice && session.actualRollsInvalid === true} league={league} onLeague={(value) => update({ league: value })} leagues={leagues} leagueError={leagueError} priceLeague={basis?.league} autoEstimate={quickPrice?.complete === true} onEstimate={quickPrice ? (summary) => { void publishCompanion(quickPrice.id, { ...summary, status: summary.status ?? 'ready' }, quickPrice.deliveryToken); } : undefined} />}
            {!equipmentPrice && !quickPrice && <><div className="wb-divider" /><div className="wb-section-head"><h3>手动价格情景比较</h3><span>单位 Ex</span></div><p className="wb-description">查到可比挂单后填入参考价格，比较继续加工与直接出售。这里使用你填写的价格，不会自动推断成交价。</p><div className="wb-profit-inputs">{([['current', '当前装备可售价值'], ['quick', '成品保守价'], ['fair', '成品一般价'], ['optimistic', '成品乐观价']] as const).map(([key, label]) => <label key={key}>{label}<input aria-label={label} type="number" min="0" placeholder="待填写" value={profitInputs[key]} onChange={(event) => setProfitInputs((old) => ({ ...old, [key]: event.target.value }))} /></label>)}</div>
            {expectedCost !== null && !stale && markov?.bound === 'exact' && profitInputs.current !== '' ? <div className="wb-profit-results">{(['quick', 'fair', 'optimistic'] as const).map((key) => { const sale = profitInputs[key]; const profit = Number(sale) - Number(profitInputs.current) - expectedCost; const invested = Number(profitInputs.current) + expectedCost; return <div key={key}><small>{{ quick: '保守情景', fair: '一般情景', optimistic: '乐观情景' }[key]}</small><strong className={sale !== '' && profit >= 0 ? 'positive' : ''}>{sale === '' ? '待填写' : `${profit >= 0 ? '+' : ''}${formatCost(profit)} Ex`}</strong><span>{sale === '' || !invested ? '—' : `ROI ${formatPercent(profit / invested)}`}</span></div>; })}</div> : <p className="wb-fine">先获得当前目标的已收敛制作成本，并填写当前装备价值，才能比较价格情景。</p>}
            <p className="wb-fine">公式：成品参考价 − 当前装备机会成本 − 后续期望成本。此处未建模售出时间与市场价格分布，属于价格情景测算。</p></>}
          </section>}
          {tab === 'settings' && <section className="wb-panel"><div className="wb-section-head"><div><span className="wb-eyebrow">DATA & PRICING</span><h3>每个数字，都有来处。</h3></div><span className="wb-tag">本地价格覆盖</span></div><div className="wb-source-grid"><div><small>制作规则快照</small><strong>{engine?.data.patch ?? '—'}</strong><p>来自 POE2_HTC，普通词缀权重为 PoE2DB 社区数据。版本号不代表已自动匹配最新游戏补丁。</p></div><div><small>内置材料价格</small><strong>{basis?.asOf?.slice(0, 10) ?? '—'}</strong><p>{basis?.league ?? '—'} · poe.ninja 价格快照；部分材料可能包含估计值。</p></div></div>
            <div className="wb-advisor-verdict"><strong>游戏内快捷查价与步骤校验</strong><p>用 start-workbench.cmd 启动时会同时打开快捷键助手。鼠标停在游戏装备上，按 Alt + E 查价；执行通货后按 Ctrl + Alt + G 校验已锁定的制作锚点。请保持工坊网页打开，使用窗口化或无边框模式查看置顶结果。Esc 收起助手面板，托盘菜单可退出。也可单独运行 start-hotkeys.cmd。</p></div>
            <div className="wb-source-links"><a href="https://www.poe2wiki.net/wiki/List_of_modifiers_for_rings" target="_blank" rel="noreferrer">戒指 Wiki <Icon name="external" size={13} /></a><a href="https://www.poe2wiki.net/wiki/List_of_modifiers_for_amulets" target="_blank" rel="noreferrer">项链 Wiki <Icon name="external" size={13} /></a><a href="https://poe2db.tw/tw/Modifiers" target="_blank" rel="noreferrer">PoE2DB 词缀 <Icon name="external" size={13} /></a><a href="https://poe.ninja/poe2/economy" target="_blank" rel="noreferrer">材料市场 <Icon name="external" size={13} /></a></div>
            <p className="wb-description">填写每单位材料折合多少崇高石（Ex），会同步影响制作策略与模拟成本。清空输入即可恢复内置价格；不会覆盖原始数据文件。</p>
            <div className="wb-price-table"><div className="wb-price-head"><span>材料</span><span>内置价 / Ex</span><span>你的价格 / Ex</span></div>{engine && Object.keys(CURRENCY_LABELS).filter((key) => engine.prices.currency[key] !== undefined).map((key) => <div key={key}><label className="wb-price-material" htmlFor={`price-${key}`}><OfficialCurrencyIcon currencyId={key} label={CURRENCY_LABELS[key]!} />{CURRENCY_LABELS[key]}</label><span>{formatCost(engine.prices.currency[key]!)}</span><input id={`price-${key}`} type="number" min="0.000001" step="any" placeholder="使用内置价" value={overrides[key] ?? ''} onChange={(event) => { const value = Number(event.target.value); const next = { ...overrides }; if (!event.target.value) delete next[key]; else if (Number.isFinite(value) && value > 0) next[key] = value; update({ overrides: next }); }} /></div>)}</div>
            <div className="wb-actions"><button className="wb-button" onClick={() => update({ overrides: {} })} disabled={!Object.keys(overrides).length}>恢复全部内置价格</button></div>
            <p className="wb-fine">保存范围：装备、目标、赛季、制作选项与价格覆盖保存在当前浏览器。模拟操作记录与价格情景仅保留在当前页面。</p>
          </section>}
        </main>
      </div>
      <footer className="wb-footer"><span>POE2 CRAFT LAB <i /> 把每一步做明白。</span><span>个人本地版 · Milestone 1</span></footer>
    </div>
  </div>;
}

function CraftReason({ reason, engine }: { reason: string; engine: Engine | null }) {
  const explanation = explainCraftReason(reason, engine?.data.mods);
  return <div className="wb-alert warning wb-reason" role="status"><div><p>{explanation.message}</p>{explanation.diagnostic && <details className="wb-diagnostic"><summary>原始诊断信息</summary><pre>{explanation.diagnostic}</pre></details>}</div></div>;
}

function PolicyView({ node, result, onNode }: { node: EnginePolicyNode; result: SolveResult; onNode: (key: string) => void }) {
  const edges = result.markov.edges.filter((edge) => edge.from === node.key);
  return <div className="wb-policy"><div className="wb-section-head"><h3>{node.isStart ? '从当前状态开始' : node.isGoal ? '目标已达成' : '如果出现这个结果'}</h3>{!node.isStart && <button className="wb-text-button" onClick={() => onNode(result.markov.nodes.find((entry) => entry.isStart)?.key ?? '')}>回到起点</button>}</div>
    <div className="wb-policy-state"><span>{RARITY_NAMES[node.rarity]}</span>{node.present.map((mod, index) => <span className="good" key={index}>{translateMod(mod.text)}{mod.tier ? ` · T${mod.tier}+` : ''}</span>)}{node.blocked.map((mod, index) => <span className="bad" key={index}>待替换：{translateMod(mod.text)}</span>)}{node.junkPrefixes + node.junkSuffixes > 0 && <span>其他词缀：{node.junkPrefixes} 前 / {node.junkSuffixes} 后</span>}</div>
    <div className="wb-next-action"><span className="wb-next-icon">{node.isGoal ? <Icon name="check" size={22} /> : <OfficialCurrencyIcon currencyId={getCurrencyImageIdForAction(node.action ?? '')} label={translateCurrency(node.action ?? '下一步')} fallback={<Icon name="hammer" size={22} />} />}</span><div><small>{node.isGoal ? '已满足所选条件' : '推荐下一步'}</small><strong>{node.isGoal ? '可以停止制作' : translateCurrency(node.action ?? '暂无可执行动作')}</strong></div>{node.actionCost !== undefined && <span>{formatCost(node.actionCost)} Ex / 次</span>}</div>
    {node.keepsOne && <p className="wb-fine">这是提供多个选项后保留其一的操作；下方概率描述按策略选择后的结果。</p>}
    {edges.length > 0 && <><p className="wb-fine">点击结果分支，查看后续建议。图中结果可能按等价状态合并。</p><div className="wb-branches">{edges.map((edge, index) => { const next = result.markov.nodes.find((entry) => entry.key === edge.to); return <button key={index} disabled={!next} onClick={() => onNode(edge.to)}><span className={edge.regress ? 'wb-branch-risk' : 'wb-branch-good'}>{formatPercent(edge.prob)}</span><div><strong>{next?.isGoal ? '达到目标' : next?.action ? `下一步：${translateCurrency(next.action)}` : '转到后续状态'}</strong><small>{next ? `${next.present.length} 项目标已达成 · ${next.blocked.length} 项需要替换${edge.regress ? ' · 进度回退' : ''}` : '该分支未在当前图中展开'}</small></div><Icon name="arrow" size={16} /></button>; })}</div></>}
  </div>;
}
