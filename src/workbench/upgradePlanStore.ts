import { useMemo, useSyncExternalStore } from 'react';
import { isLoadoutSlot, type LoadoutState } from './loadout';
import { parseEquipment } from './genericEquipment';
import { planBasis, type CandidatePool, type PlanCandidate } from './upgradePlans';

export const CANDIDATE_POOL_KEY = 'poe2-workbench-upgrade-pool-v1';
const EVENT = 'poe2-workbench-upgrade-pool-change';
const snapshot = () => { try { return localStorage.getItem(CANDIDATE_POOL_KEY) ?? ''; } catch { return ''; } };
export function readCandidatePool(raw: string): CandidatePool | undefined {
  if (!raw || raw.length > 2_000_000) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return undefined;
    const row = value as Record<string, unknown>;
    if (row.version !== 1 || typeof row.basis !== 'string' || row.basis.length > 500_000 || !Array.isArray(row.candidates) || row.candidates.length > 24) return undefined;
    const candidates: PlanCandidate[] = [];
    for (const candidate of row.candidates as unknown[]) {
      if (!candidate || typeof candidate !== 'object') return undefined;
      const entry = candidate as Record<string, unknown>;
      if (typeof entry.id !== 'string' || entry.id.length > 300 || typeof entry.slot !== 'string' || !isLoadoutSlot(entry.slot) || typeof entry.raw !== 'string' || entry.raw.length > 100_000 || !parseEquipment(entry.raw)) return undefined;
      let quote: PlanCandidate['quote'];
      if (entry.quote && typeof entry.quote === 'object') {
        const price = entry.quote as Record<string, unknown>;
        if (typeof price.id !== 'string' || !price.id || price.id.length > 160 || typeof price.amount !== 'number' || !Number.isFinite(price.amount) || price.amount <= 0
          || typeof price.currency !== 'string' || !/^[a-z-]{1,100}$/.test(price.currency) || typeof price.sampledAt !== 'string' || !Number.isFinite(Date.parse(price.sampledAt))) return undefined;
        quote = { id: price.id, amount: price.amount, currency: price.currency, sampledAt: price.sampledAt };
      }
      candidates.push({ id: entry.id, slot: entry.slot, raw: entry.raw, ...(quote ? { quote } : {}) });
    }
    return { version: 1, basis: row.basis, candidates };
  } catch { return undefined; }
}
function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === CANDIDATE_POOL_KEY || event.key === null) listener(); };
  window.addEventListener(EVENT, listener); window.addEventListener('storage', storage);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener('storage', storage); };
}
export function useUpgradeCandidatePool() { const raw = useSyncExternalStore(subscribe, snapshot, () => ''); return useMemo(() => readCandidatePool(raw), [raw]); }
export function writeCandidatePool(pool?: CandidatePool): string {
  try {
    if (pool) { const raw = JSON.stringify(pool); if (!readCandidatePool(raw)) return '候选组合资料无效或过大，未保存。'; localStorage.setItem(CANDIDATE_POOL_KEY, raw); }
    else localStorage.removeItem(CANDIDATE_POOL_KEY);
    window.dispatchEvent(new Event(EVENT)); return '';
  } catch { return '浏览器未能保存候选组合。'; }
}
export function rememberUpgradeCandidate(state: LoadoutState, candidate: PlanCandidate): string {
  const basis = planBasis(state), previous = readCandidatePool(snapshot());
  const entries = previous?.basis === basis ? previous.candidates : [];
  return writeCandidatePool({ version: 1, basis, candidates: [...entries.filter((entry) => entry.id !== candidate.id), candidate].slice(-24) });
}
