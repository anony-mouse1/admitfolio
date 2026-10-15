import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
function moduleAt(file, imports = {}, globals = {}, suffix = '') {
  const source = fs.readFileSync(new URL(file, root), 'utf8') + suffix;
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, URL, console, Date, setTimeout, clearTimeout,
    require: name => { if (!(name in imports)) throw Error(`Unexpected import: ${name}`); return imports[name]; },
    ...globals,
  });
  return exports;
}
const core = moduleAt('lib/metaTracking.ts');
const sid = 'cs_live_syntheticTestOnly123';
const eventId = `purchase_${crypto.createHash('sha256').update(`meta:${sid}`).digest('hex')}`;
let stored = null;
let reads = 0;
const api = moduleAt('app/api/meta-purchase/route.ts', {
  'node:crypto': crypto,
  'next/server': { NextResponse: { json: (data, options = {}) => new Response(JSON.stringify(data), { ...options, headers: { ...options.headers, 'Content-Type': 'application/json' } }) } },
  '@/lib/prisma': { prisma: { purchase: { findUnique: async args => {
    reads++; assert.equal(args.where.stripeSessionId, sid); return stored;
  } } } },
  '@/lib/metaTracking': core,
});
function request({ origin = 'https://admitfolio.com', consent = true, gpc = false, sessionId = sid, value = 0.01 } = {}) {
  return new Request('https://admitfolio.com/api/meta-purchase', { method: 'POST', headers: {
    origin, cookie: consent ? 'admitfolio_meta_consent=v1.allowed' : '',
    'sec-gpc': gpc ? '1' : '0', 'Content-Type': 'application/json',
  }, body: JSON.stringify({ sessionId, value }) });
}
assert.equal((await api.POST(request({ consent: false }))).status, 403);
assert.equal((await api.POST(request({ gpc: true }))).status, 403);
assert.equal((await api.POST(request({ origin: 'https://evil.example' }))).status, 403);
assert.equal((await api.POST(request({ sessionId: 'cs_test_notLive' }))).status, 400);
assert.equal(reads, 0, 'rejected requests must not query orders');
assert.equal((await (await api.POST(request())).json()).purchase, null, 'pending webhook is not a purchase');
stored = { stripeSessionId: sid, grossAmountCents: 2500, amount: 25, currency: 'usd', createdAt: new Date() };
const paidResponse = await api.POST(request());
assert.equal(paidResponse.headers.get('cache-control'), 'no-store');
const paid = (await paidResponse.json()).purchase;
assert.deepEqual(paid, { eventId, value: 25, currency: 'USD' }, 'server price wins over browser price');
assert.deepEqual((await (await api.POST(request())).json()).purchase, paid, 'retry keeps the same event ID');
stored.createdAt = new Date(Date.now() - 8 * 86400_000);
assert.equal((await (await api.POST(request())).json()).purchase, null, 'old purchases do not become new conversions');
stored.createdAt = new Date(); stored.grossAmountCents = -1;
assert.equal((await (await api.POST(request())).json()).purchase, null);

const url = core.metaPixelUrl({ origin: 'https://admitfolio.com', path: '/purchase/success', purchase: paid,
  fbp: 'fb.1.1792100000000.123456', fbc: 'fb.1.1792100000000.syntheticClick' });
const parsed = new URL(url);
assert.equal(parsed.hostname, 'www.facebook.com');
assert.equal(parsed.searchParams.get('ev'), 'Purchase');
assert.equal(parsed.searchParams.get('cd[value]'), '25');
assert.equal(parsed.searchParams.get('cd[currency]'), 'USD');
assert.equal(parsed.searchParams.get('dl'), 'https://admitfolio.com/purchase/success');
assert.ok(!url.includes(sid));
for (const path of ['/purchase/private-token', '/admin', '/seller', '/essays?email=private@example.com', '/listings/private/token']) {
  assert.equal(core.metaPixelUrl({ origin: 'https://admitfolio.com', path }), null);
}
assert.equal(core.metaPixelUrl({ origin: 'http://localhost:3017', path: '/' }), null);
assert.equal(core.metaPixelUrl({ origin: 'https://preview.vercel.app', path: '/' }), null);

// Exercise the real browser transport with an in-memory DOM and storage.
// No real requests, cookies, customer data, database writes or charges.
const storage = new Map();
const nodes = [];
const fakeDocument = {
  cookie: '',
  createElement: () => ({ style: {}, dataset: {}, remove() { this.removed = true; } }),
  body: { appendChild(img) { nodes.push(img); } },
};
const navigator = { globalPrivacyControl: false, doNotTrack: '0' };
const localStorage = { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v) };
const client = moduleAt('components/MetaConsent.tsx', {
  react: {}, 'react/jsx-runtime': {}, 'next/navigation': {},
  '@/lib/metaTracking': core,
  '@/lib/analyticsPolicy': { INTERNAL_ANALYTICS_STORAGE_KEY: 'internal' },
  './MetaConsent.module.css': {},
}, { document: fakeDocument, navigator, localStorage, location: { href: 'https://admitfolio.com/' }, window: { setTimeout }, clearTimeout },
  '\nexport const testSend = sendPixel;');
client.testSend(url, eventId); assert.equal(nodes.length, 0, 'no choice sends nothing');
fakeDocument.cookie = 'admitfolio_meta_consent=v1.denied';
client.testSend(url, eventId); assert.equal(nodes.length, 0, 'declining sends nothing');
fakeDocument.cookie = 'admitfolio_meta_consent=v1.allowed';
navigator.globalPrivacyControl = true;
client.testSend(url, eventId); assert.equal(nodes.length, 0, 'GPC overrides acceptance');
navigator.globalPrivacyControl = false;
client.testSend(url, eventId); client.testSend(url, eventId);
assert.equal(nodes.length, 1, 'concurrent effect/retry sends only once');
assert.equal(nodes[0].src, url); assert.equal(nodes[0].referrerPolicy, 'no-referrer');
nodes[0].onload();
client.testSend(url, eventId); assert.equal(nodes.length, 1, 'refresh/retry cannot recount acknowledged sale');
assert.ok(storage.has(eventId));
client.testSend(url, 'failed-event'); nodes[1].onerror();
client.testSend(url, 'failed-event'); assert.equal(nodes.length, 3, 'failed delivery can retry'); nodes[2].onload();
console.log('PASS: consent, GPC, origin checks, pending/paid/old orders, trusted value, stable IDs, private URL exclusion, deduplication and failed-request retry. No live Meta or Stripe events sent.');
