/* global chrome, setTimeout, clearTimeout */
const HISTORY = 'https://www.pathofexile.com/trade2/history';
const deadlines = new Map(), inflight = new Set();
function waitForPage(id) {
  return new Promise((resolve) => {
    const finish = () => { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(updated); resolve(); };
    const updated = (tabId, info) => { if (tabId === id && info.status === 'complete') finish(); };
    const timer = setTimeout(finish, 10000);
    chrome.tabs.onUpdated.addListener(updated);
    // Subscribe before checking, so a fast navigation cannot be missed.
    void chrome.tabs.get(id).then((tab) => { if (tab.status === 'complete') finish(); }).catch(finish);
  });
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):5173\//.test(sender.url ?? '') || sender.frameId !== 0 || message?.channel !== 'poe2-official-history') return;
  if (message.action === 'ping') { respond({ ready: true, version: chrome.runtime.getManifest().version }); return; }
  if (!['open', 'sync'].includes(message.action) || typeof message.league !== 'string' || !message.league.trim() || message.league.length > 150 || Array.from(message.league).some((char) => char.charCodeAt(0) < 32)) { respond({ error: '无效的同步请求。' }); return; }
  if (inflight.has(message.league)) { respond({ error: '正在读取官方成交，请等待本次完成。' }); return; }
  inflight.add(message.league);
  (async () => {
    const tabs = await chrome.tabs.query({ url: `${HISTORY}*` });
    let tab = tabs.find((entry) => entry.active) ?? tabs[0];
    if (!tab?.id && message.passive === true) return { needsPage: true, error: '官方历史页已关闭。点击同步会打开官网；自动同步不会自行弹出窗口。' };
    if (message.action === 'open') {
      if (tab?.id) await chrome.tabs.update(tab.id, { active: true });
      else await chrome.tabs.create({ url: HISTORY, active: true });
      return { needsLogin: true, error: '已打开官网。正常登录后返回工坊，将自动继续同步。' };
    }
    const deadline = deadlines.get(message.league) ?? 0;
    if (Date.now() < deadline) return { error: '请稍后再同步官网成交。', retryAfter: Math.ceil((deadline - Date.now()) / 1000) };
    if (!tab?.id) tab = await chrome.tabs.create({ url: HISTORY, active: true });
    const id = tab.id;
    await waitForPage(id);
    const current = await chrome.tabs.get(id);
    if (!current.url?.startsWith(HISTORY)) return { needsLogin: true, error: '请在官网完成登录并进入成交历史页，然后返回工坊继续同步。' };
    let result;
    const request = { channel: 'poe2-official-history', action: 'read', league: message.league };
    try { result = await chrome.tabs.sendMessage(id, request); }
    catch {
      // Existing tabs do not receive content scripts on installation/reload.
      // Repair only this fixed official page, without interrupting login.
      await chrome.scripting.executeScript({ target: { tabId: id }, files: ['official.js'] });
      result = await chrome.tabs.sendMessage(id, request);
    }
    if (result?.retryAfter) deadlines.set(message.league, Date.now() + Math.min(86400, Math.max(1, result.retryAfter)) * 1000);
    else if (result?.payload) deadlines.set(message.league, Date.now() + 60000);
    if (result?.needsLogin && message.passive !== true) await chrome.tabs.update(id, { active: true });
    return result ?? { error: '官网读取器没有响应，请更新同步扩展后重试。' };
  })().then(respond).catch(() => respond({ error: '无法连接官网读取器。请在扩展管理页重新加载同步扩展，再刷新工坊重试。' })).finally(() => inflight.delete(message.league));
  return true;
});
