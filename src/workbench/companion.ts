import { HOSTED_WORKBENCH } from './workbenchRuntime';
export interface CompanionPacket { id: string; raw: string; mode: 'trade' | 'checkpoint'; createdAt: string; deliveryToken?: string }
export interface CompanionSummary { status: 'ready' | 'error'; message: string; detail?: string; url?: string }

function packetOf(value: unknown): CompanionPacket | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && row.id.length < 200 && typeof row.raw === 'string' && row.raw.length <= 65_536
    && (row.mode === 'trade' || row.mode === 'checkpoint') && typeof row.createdAt === 'string'
    && (row.deliveryToken === undefined || typeof row.deliveryToken === 'string' && row.deliveryToken.length < 200)
    ? row as unknown as CompanionPacket : null;
}

/** An explicit item link can reopen a completed price check without replaying its task. */
export async function loadCompanionView(search: string, signal: AbortSignal): Promise<CompanionPacket | null> {
  if (HOSTED_WORKBENCH) return null;
  const id = new URLSearchParams(search).get('equipment');
  if (!id) return null;
  const response = await fetch(`/api/workbench/companion-view?id=${encodeURIComponent(id)}`, { signal });
  if (!response.ok) throw new Error('这件查价装备已过期或工坊暂时无法连接，请从快捷查价面板重新点击“在工坊查看”。');
  const value = await response.json() as { item?: unknown };
  const packet = packetOf(value.item);
  if (!packet) throw new Error('查价装备数据无效，请从快捷查价面板重新打开。');
  return packet;
}

/** SSE keeps the in-game shortcut responsive while the browser tab is in the background. */
export function subscribeCompanion(onPacket: (packet: CompanionPacket) => void): () => void {
  if (HOSTED_WORKBENCH) return () => {};
  let last = '';
  let lastToken = '';
  let closed = false;
  const receive = (value: unknown) => {
    const packet = packetOf(value);
    if (closed || !packet || packet.id === last && (packet.deliveryToken ?? '') === lastToken) return;
    last = packet.id;
    lastToken = packet.deliveryToken ?? '';
    onPacket(packet);
  };
  let poll: ReturnType<typeof setInterval> | undefined;
  const controller = new AbortController();
  const fallback = () => {
    if (poll || closed) return;
    poll = setInterval(() => {
      void fetch(`/api/workbench/clipboard?after=${encodeURIComponent(last)}&afterToken=${encodeURIComponent(lastToken)}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() as Promise<{ item?: unknown }> : null)
        .then((value) => receive(value?.item)).catch(() => { /* Static previews may lack the bridge. */ });
    }, 2000);
  };
  let events: EventSource | undefined;
  if (typeof EventSource !== 'undefined') {
    const viewId = new URLSearchParams(window.location.search).get('equipment');
    events = new EventSource('/api/workbench/clipboard/events' + (viewId ? `?view=${encodeURIComponent(viewId)}` : ''));
    events.onmessage = (event) => {
      const raw: unknown = event.data;
      if (typeof raw !== 'string') return;
      try { receive((JSON.parse(raw) as { item?: unknown }).item); } catch { /* Ignore malformed events. */ }
    };
    events.onerror = fallback;
  } else fallback();
  return () => { closed = true; controller.abort(); events?.close(); if (poll) clearInterval(poll); };
}

export async function publishCompanion(id: string, summary: CompanionSummary, deliveryToken?: string): Promise<void> {
  if (HOSTED_WORKBENCH) return;
  try {
    await fetch('/api/workbench/companion-result', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...summary, deliveryToken }) });
  } catch { /* The browser still displays the result if the desktop helper has closed. */ }
}
