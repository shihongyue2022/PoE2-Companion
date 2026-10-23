/* global chrome, location, fetch, AbortSignal */
// Safe to inject again when an already open official tab has no reader.
if (!globalThis.__poe2OfficialHistoryReader) {
  globalThis.__poe2OfficialHistoryReader = true;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message?.channel !== 'poe2-official-history' || message.action !== 'read' ||
      location.origin !== 'https://www.pathofexile.com' || !/^\/trade2\/history(?:\/|$)/.test(location.pathname)) return;
    (async () => {
      // Browser-managed same-origin session; never read or forward credentials.
      const response = await fetch(`/api/trade2/history/${encodeURIComponent(message.league)}`, { credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
      if (!response.ok) return { needsLogin: [401, 403].includes(response.status), error: [401, 403].includes(response.status) ? '官网尚未允许读取。请在官方历史页正常登录并完成验证，返回工坊会继续同步。' : `官网历史读取失败（HTTP ${response.status}）。`, retryAfter: response.status === 429 ? Math.max(60, Math.min(86400, Number(response.headers.get('retry-after')) || 60)) : undefined };
      const text = await response.text();
      if (text.length > 4000000) return { error: '官方历史响应过大，未同步。' };
      let body;
      try { body = JSON.parse(text); }
      catch { return { needsLogin: /^\s*</.test(text), error: '官网返回了登录／验证页面或非 JSON 响应，请打开官方历史页检查后返回工坊。' }; }
      const rows = Array.isArray(body) ? body : body?.result ?? body?.entries;
      if (!Array.isArray(rows) || rows.length > 1000) return { error: '官网没有返回成交数组，未写入账本。请确认官网历史页可正常显示本联盟成交。' };
      // Allowlist only bounded sale facts. Invalid rows are reported by the
      // ledger parser instead of failing the entire response.
      const clean = (value, limit = 300) => typeof value === 'string' ? value.slice(0, limit) : undefined;
      const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
      const entries = rows.map((raw) => {
        const row = raw && typeof raw === 'object' ? raw : {};
        const time = row.time ?? row.indexed ?? row.listing?.indexed;
        return {
          id: clean(row.id), item_id: clean(row.item_id), time: number(time) ?? clean(time),
          direction: clean(row.direction), status: clean(row.status),
          price: { amount: number(row.price?.amount ?? row.listing?.price?.amount), currency: clean(row.price?.currency ?? row.listing?.price?.currency, 100) },
          item: { id: clean(row.item?.id), name: clean(row.item?.name), baseType: clean(row.item?.baseType ?? row.item?.typeLine),
            stackSize: number(row.item?.stackSize), league: clean(row.item?.league, 150) },
        };
      });
      return { ready: true, payload: { endpoint: 'trade2/history', league: message.league, fetchedAt: new Date().toISOString(), entries,
        hasMore: typeof body.more === 'boolean' ? body.more : undefined, total: Number.isSafeInteger(body.total) ? body.total : undefined } };
    })().then(respond).catch(() => respond({ error: '官网读取请求失败或超时，未写入账本。请确认官方历史页正常打开后重试。' }));
    return true;
  });
}
