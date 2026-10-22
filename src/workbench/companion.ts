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

/** SSE keeps the in-game shortcut responsive while the browser tab is in the background. */
export function subscribeCompanion(onPacket: (packet: CompanionPacket) => void): () => void {
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
    events = new EventSource('/api/workbench/clipboard/events');
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
  try {
    await fetch('/api/workbench/companion-result', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...summary, deliveryToken }) });
  } catch { /* The browser still displays the result if the desktop helper has closed. */ }
}
