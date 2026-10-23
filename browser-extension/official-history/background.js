/* global chrome */
const HISTORY = 'https://www.pathofexile.com/trade2/history';
const deadlines = new Map();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):5173\//.test(sender.url ?? '') || sender.frameId !== 0 || message?.channel !== 'poe2-official-history') return;
  if (message.action === 'ping') { respond({ ready: true }); return; }
  if (!['open', 'sync'].includes(message.action) || typeof message.league !== 'string' || !message.league.trim() || message.league.length > 150 || Array.from(message.league).some((char) => char.charCodeAt(0) < 32)) { respond({ error: '无效的同步请求。' }); return; }
  (async () => {
    const tabs = await chrome.tabs.query({ url: `${HISTORY}*` });
    const tab = tabs.find((entry) => entry.active) ?? tabs[0];
    if (message.action === 'sync' && !tab?.id && message.passive === true) return { error: '官方历史页已关闭，自动同步等待页面重新打开。' };
    if (message.action === 'open' || !tab?.id) {
      if (tab?.id) await chrome.tabs.update(tab.id, { active: true });
      else await chrome.tabs.create({ url: HISTORY, active: true });
      return { needsLogin: true, error: '已打开官方历史页。请正常登录，选中正确账号后，回到工坊点击同步。' };
    }
    const deadline = deadlines.get(message.league) ?? 0;
    if (Date.now() < deadline) return { error: '请稍后再同步官网成交。', retryAfter: Math.ceil((deadline - Date.now()) / 1000) };
    deadlines.set(message.league, Date.now() + 60_000);
    const result = await chrome.tabs.sendMessage(tab.id, { channel: 'poe2-official-history', action: 'read', league: message.league });
    if (result?.retryAfter) deadlines.set(message.league, Date.now() + Math.min(86400, result.retryAfter) * 1000);
    return result;
  })().then(respond).catch(() => respond({ error: '官网页尚未就绪。请刷新官方历史页，确认已登录，再回到工坊重试。' }));
  return true;
});
