/* global chrome, location, fetch, AbortSignal */
// Same-origin request: the browser supplies its normal session. Credentials are
// never read with the cookies API, serialized, or forwarded to the workbench.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.channel !== 'poe2-official-history' || message.action !== 'read' ||
    location.origin !== 'https://www.pathofexile.com' || !location.pathname.startsWith('/trade2/history')) return;
  (async () => {
    const response = await fetch(`/api/trade2/history/${encodeURIComponent(message.league)}`, { credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json' } });
    if (!response.ok) return { error: [401, 403].includes(response.status) ? '官网尚未授权读取，请在这个官方页面正常登录并完成验证。' : `官网历史读取失败（${response.status}）。`, retryAfter: response.status === 429 ? Math.max(60, Math.min(86400, Number(response.headers.get('retry-after')) || 60)) : undefined };
    const text = await response.text();
    if (text.length > 4_000_000) return { error: '官方历史响应过大，未同步。' };
    const body = JSON.parse(text);
    const rows = Array.isArray(body) ? body : body.result ?? body.entries;
    if (!Array.isArray(rows) || rows.length > 1000) return { error: '官网历史格式有变化，未将搜索结果或页面文字当作成交。' };
    // Forward only sale facts. Strip account, whisper, stash, all auth and any
    // unrelated fields before crossing the extension boundary.
    const clean = (value, limit = 300) => typeof value === 'string' ? value.slice(0, limit) : undefined;
    const entries = rows.map((row) => ({
      id: clean(row.id), item_id: clean(row.item_id), time: clean(row.time ?? row.indexed ?? row.listing?.indexed),
      direction: clean(row.direction), status: clean(row.status),
      price: { amount: row.price?.amount ?? row.listing?.price?.amount, currency: clean(row.price?.currency ?? row.listing?.price?.currency, 100) },
      item: { id: clean(row.item?.id), name: clean(row.item?.name), baseType: clean(row.item?.baseType ?? row.item?.typeLine),
        stackSize: row.item?.stackSize, league: clean(row.item?.league, 150) },
    }));
    return { ready: true, payload: { endpoint: 'trade2/history', league: message.league, fetchedAt: new Date().toISOString(), entries,
      hasMore: typeof body.more === 'boolean' ? body.more : undefined, total: Number.isSafeInteger(body.total) ? body.total : undefined } };
  })().then(respond).catch(() => respond({ error: '官方历史没有返回可读取的 JSON。请在官网检查登录、验证或网络。' }));
  return true;
});
