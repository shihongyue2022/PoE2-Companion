import { useMemo, useSyncExternalStore } from 'react';
import { deserializeLoadout, emptyLoadout, LOADOUT_STORAGE_KEY, serializeLoadout, type LoadoutState } from './loadout';

const EVENT = 'poe2-workbench-loadout-change';
function snapshot(): string { try { return localStorage.getItem(LOADOUT_STORAGE_KEY) ?? ''; } catch { return ''; } }
function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === LOADOUT_STORAGE_KEY || event.key === null) listener(); };
  window.addEventListener(EVENT, listener); window.addEventListener('storage', storage);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener('storage', storage); };
}
export function useSavedLoadout() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => '');
  return useMemo(() => {
    const parsed = raw ? deserializeLoadout(raw) : { state: emptyLoadout(), error: '' };
    return { state: parsed.state ?? emptyLoadout(), error: parsed.error, raw };
  }, [raw]);
}
export function writeSavedLoadout(state: LoadoutState, expectedRaw: string): string {
  try {
    if (snapshot() !== expectedRaw) { window.dispatchEvent(new Event(EVENT)); return '另一页面已更新装备，已载入最新方案，请重新操作。'; }
    const raw = serializeLoadout(state), checked = deserializeLoadout(raw);
    if (!checked.state) return checked.error;
    localStorage.setItem(LOADOUT_STORAGE_KEY, serializeLoadout(checked.state)); window.dispatchEvent(new Event(EVENT)); return '';
  } catch { return '浏览器未能保存此方案，请先导出备份。'; }
}
