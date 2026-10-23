/* global chrome, window, location */
window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'poe2-history-request' ||
    typeof event.data.id !== 'string' || event.data.id.length > 100 || !['ping', 'open', 'sync'].includes(event.data.action)) return;
  const { id, action, league } = event.data;
  chrome.runtime.sendMessage({ channel: 'poe2-official-history', action, league, passive: event.data.passive === true }).then((result) => {
    window.postMessage({ channel: 'poe2-history-response', id, result }, location.origin);
  }).catch(() => window.postMessage({ channel: 'poe2-history-response', id, result: { error: '同步扩展已更新，请刷新工坊页面。' } }, location.origin));
});
