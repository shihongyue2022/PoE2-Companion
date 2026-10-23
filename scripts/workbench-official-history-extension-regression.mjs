import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
let officialListener, fetches = 0, registrations = 0;
let responseBody = { secret: 'SECRET', result: [{ id: 'sale1', time: 1792627200, price: { amount: 5, currency: 'divine' },
  account: { name: 'SECRET' }, listing: { whisper: 'SECRET' }, item: { name: 'Example', typeLine: 'Gold Ring', league: 'Test League' } }, null] };
let status = 200;
const official = vm.createContext({
  chrome: { runtime: { id: 'test-extension', onMessage: { addListener: (fn) => { officialListener = fn; registrations++; } } } },
  location: { origin: 'https://www.pathofexile.com', pathname: '/trade2/history' }, AbortSignal, Date, JSON,
  fetch: async (url, options) => {
    fetches++; assert.equal(url, '/api/trade2/history/Test%20League'); assert.equal(options.credentials, 'same-origin');
    return new Response(JSON.stringify(responseBody), { status, headers: { 'retry-after': '120' } });
  },
});
vm.runInContext(await readFile('browser-extension/official-history/official.js', 'utf8'), official);
vm.runInContext(await readFile('browser-extension/official-history/official.js', 'utf8'), official);
assert.equal(registrations, 1, 'reader repair must not install duplicate listeners');
const message = { channel: 'poe2-official-history', action: 'read', league: 'Test League' };
assert.equal(officialListener(message, { id: 'other-extension' }, () => { throw new Error('untrusted'); }), undefined);
assert.equal(fetches, 0);
const payload = await new Promise((resolve) => officialListener(message, { id: 'test-extension' }, resolve));
assert.equal(payload.payload.entries.length, 2); assert.equal(JSON.stringify(payload).includes('SECRET'), false);
assert.equal(payload.payload.entries[0].time, 1792627200, 'numeric official timestamps must cross the allowlist');
assert.equal(payload.payload.endpoint, 'trade2/history');
status = 401;
const auth = await new Promise((resolve) => officialListener(message, { id: 'test-extension' }, resolve));
assert.equal(auth.needsLogin, true); assert(!auth.payload);
status = 429;
const limited = await new Promise((resolve) => officialListener(message, { id: 'test-extension' }, resolve));
assert.equal(limited.retryAfter, 120); assert(!limited.payload);
status = 200; responseBody = { result: 'not-a-history-array' };
assert((await new Promise((resolve) => officialListener(message, { id: 'test-extension' }, resolve))).error);

const code = await readFile('browser-extension/official-history/background.js', 'utf8');
const request = { channel: 'poe2-official-history', action: 'sync', league: 'Test League' };
const sender = { url: 'http://127.0.0.1:5173/?companion=1', frameId: 0 };
function worker({ hasTab = true, readerMissing = false, result = payload } = {}) {
  let listener, sends = 0, opened = 0, injected = 0;
  const tab = { id: 1, active: true, status: 'complete', url: 'https://www.pathofexile.com/trade2/history' };
  const context = vm.createContext({ Date, Map, Set, Array, setTimeout, clearTimeout, chrome: {
    runtime: { getManifest: () => ({ version: '1.1.0' }), onMessage: { addListener: (fn) => { listener = fn; } } },
    scripting: { executeScript: async (options) => { assert.equal(options.target.tabId, 1); assert.equal(options.files[0], 'official.js'); injected++; } },
    tabs: { query: async ({ url }) => { assert.equal(url, 'https://www.pathofexile.com/trade2/history*'); return hasTab ? [tab] : []; },
      get: async () => tab, onUpdated: { addListener() {}, removeListener() {} },
      sendMessage: async () => { sends++; if (readerMissing && !injected) throw new Error('Receiving end does not exist'); return result; },
      create: async () => { opened++; hasTab = true; return tab; }, update: async () => { opened++; return tab; } },
  } });
  vm.runInContext(code, context);
  return { receive: (...args) => listener(...args), counters: () => ({ sends, opened, injected }),
    request: async (options = {}) => {
      const value = await new Promise((resolve) => listener({ ...request, ...options }, sender, resolve));
      await new Promise((resolve) => setImmediate(resolve)); return value;
    } };
}
const normal = worker();
assert.equal(normal.receive(request, { url: 'https://evil.test/', frameId: 0 }, () => { throw new Error('untrusted'); }), undefined);
assert.equal((await normal.request()).payload.entries.length, 2);
assert((await normal.request()).retryAfter > 0); assert.equal(normal.counters().sends, 1);
const firstOpen = worker({ hasTab: false });
assert((await firstOpen.request()).payload, 'a first sync must open AND read, rather than stop at opening');
assert.deepEqual(firstOpen.counters(), { sends: 1, opened: 1, injected: 0 });
const repair = worker({ readerMissing: true });
assert((await repair.request()).payload); assert.equal(repair.counters().injected, 1);
const passive = worker({ hasTab: false });
assert((await passive.request({ passive: true })).needsPage); assert.equal(passive.counters().opened, 0);
const login = worker({ result: auth });
assert((await login.request()).needsLogin); assert.equal(login.counters().opened, 1);
assert((await login.request()).needsLogin, 'login failures must not consume the successful-sync cooldown');
const rateLimit = worker({ result: limited });
assert.equal((await rateLimit.request()).retryAfter, 120);
assert((await rateLimit.request()).retryAfter > 0); assert.equal(rateLimit.counters().sends, 1);
console.log('PASS initial open-and-read, missing reader repair, login resume readiness, passive tabs, epoch timestamps, malformed rows, field allowlist, sender checks, rate limiting');
