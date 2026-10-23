import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
let officialListener, fetches = 0;
const official = vm.createContext({
  chrome: { runtime: { id: 'test-extension', onMessage: { addListener: (fn) => { officialListener = fn; } } } },
  location: { origin: 'https://www.pathofexile.com', pathname: '/trade2/history' }, AbortSignal, Date, JSON,
  fetch: async (url, options) => {
    fetches++; assert.equal(url, '/api/trade2/history/Test%20League'); assert.equal(options.credentials, 'same-origin');
    return new Response(JSON.stringify({ secret: 'SECRET', result: [{ id: 'sale1', time: '2026-10-22T00:00:00Z', price: { amount: 5, currency: 'divine' },
      account: { name: 'SECRET' }, listing: { whisper: 'SECRET' }, item: { name: 'Example', typeLine: 'Gold Ring', league: 'Test League' } }] }));
  },
});
vm.runInContext(await readFile('browser-extension/official-history/official.js', 'utf8'), official);
const message = { channel: 'poe2-official-history', action: 'read', league: 'Test League' };
assert.equal(officialListener(message, { id: 'other-extension' }, () => { throw new Error('untrusted'); }), undefined);
assert.equal(fetches, 0);
const payload = await new Promise((resolve) => officialListener(message, { id: 'test-extension' }, resolve));
assert.equal(payload.payload.entries.length, 1); assert.equal(JSON.stringify(payload).includes('SECRET'), false);
assert.equal(payload.payload.endpoint, 'trade2/history');
let backgroundListener, sends = 0, opened = 0;
const background = vm.createContext({ Date, Map, Array, chrome: {
  runtime: { onMessage: { addListener: (fn) => { backgroundListener = fn; } } },
  tabs: { query: async ({ url }) => { assert.equal(url, 'https://www.pathofexile.com/trade2/history*'); return [{ id: 1, active: true }]; },
    sendMessage: async () => { sends++; return payload; }, create: async () => { opened++; }, update: async () => { opened++; } },
} });
vm.runInContext(await readFile('browser-extension/official-history/background.js', 'utf8'), background);
const request = { channel: 'poe2-official-history', action: 'sync', league: 'Test League' };
assert.equal(backgroundListener(request, { url: 'https://evil.test/', frameId: 0 }, () => { throw new Error('untrusted'); }), undefined);
const sender = { url: 'http://127.0.0.1:5173/?companion=1', frameId: 0 };
const first = await new Promise((resolve) => backgroundListener(request, sender, resolve));
assert.equal(first.payload.entries.length, 1);
const repeat = await new Promise((resolve) => backgroundListener(request, sender, resolve));
assert(repeat.retryAfter > 0); assert.equal(sends, 1); assert.equal(opened, 0);
console.log('PASS extension origin/extension sender checks, same-origin authenticated fetch, field allowlist, rate limiting; no session credentials forwarded');
