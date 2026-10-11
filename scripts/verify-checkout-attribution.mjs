#!/usr/bin/env node

// Browser checks for buyer attribution, run by hand like the other verify-*.mjs
// scripts. Not in package.json and not a test:* script: it needs a dev server,
// a browser and the Stripe sandbox, and test:* is pure.
//
//   npx next dev -p 3000
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
//     --remote-debugging-port=9223 --user-data-dir=/tmp/chrome-admitfolio about:blank
//   STRIPE_SECRET_KEY=sk_test_... node scripts/verify-checkout-attribution.mjs
//
// The app URL must be localhost, not 127.0.0.1: Next's dev server serves
// /_next/static only to the origin it was started on.
//
// NOTHING HERE COMPLETES A CHECKOUT. Each scenario drives the real dialog until
// Stripe's payment iframe mounts, reads the metadata off the resulting sandbox
// Checkout Session through the API, and stops. "Pay" is never clicked, so no
// Purchase row is ever created and the database is never written to.
//
// Unlike scripts/verify-checkout-one-screen.mjs, /api/checkout is NOT stubbed.
// The metadata under test only exists on a session Stripe actually created, so
// every scenario spends one live sandbox session. /api/checkout throttles at 8
// per minute per IP and there are five scenarios, so a second run inside the
// same minute will 429. That is the throttle working, not a failure here.
//
// WHAT THIS CANNOT CHECK, and why. Stripe creates the PaymentIntent only when
// a buyer starts paying, so `payment_intent` is null on every session here and
// the payment_intent_data.metadata copy cannot be read back without completing
// a checkout. That copy is the one a human can actually find (a Checkout
// Session has no Dashboard page at all), so it is asserted in
// scripts/visit-source.test.mjs against checkoutSessionParams directly, and
// Stripe's copying of payment_intent_data.metadata onto the PaymentIntent is
// already load bearing in production for checkoutVersion, purchaseUnit and
// listingId, which have ridden it since checkout v2.

const chromePort = process.env.CHROME_DEBUG_PORT || '9223';
const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const collectionSlug = process.env.COLLECTION_SLUG || 'common-app-personal-statement';
const stripeKey = process.env.STRIPE_SECRET_KEY || '';

if (!stripeKey.startsWith('sk_test_')) {
  throw new Error('STRIPE_SECRET_KEY must be a sandbox key (sk_test_). Refusing to run.');
}
const { default: Stripe } = await import('stripe');
const stripe = new Stripe(stripeKey);

const failures = [];
const notes = [];
function check(condition, message) {
  if (condition) notes.push(`  ok    ${message}`);
  else { failures.push(message); notes.push(`  FAIL  ${message}`); }
}

// Captures the /api/checkout request and response without altering either, and
// lets a scenario state what document.referrer should be. The referrer is
// overridden rather than produced by a real cross-origin hop because there is
// no second origin to hop from in a local run, and because no real site would
// ever send the 9000 character referrer the last scenario needs.
const PROBE = String.raw`
(() => {
  window.__calls = [];
  window.__analytics = [];
  const forced = sessionStorage.getItem('__forceReferrer');
  if (forced !== null) {
    Object.defineProperty(document, 'referrer', { configurable: true, get: () => forced });
  }
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/api/checkout') === -1) return realFetch(input, init);
    let sent = null;
    try { sent = JSON.parse(init && init.body); } catch { sent = null; }
    const response = await realFetch(input, init);
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = null; }
    window.__calls.push({ status: response.status, sent, clientSecret: (body && body.clientSecret) || null, error: (body && body.error) || null });
    return new Response(text, { status: response.status, headers: { 'Content-Type': 'application/json' } });
  };
  const info = console.info.bind(console);
  console.info = function (...args) {
    if (typeof args[0] === 'string' && args[0].indexOf('[analytics:dev]') === 0) window.__analytics.push(args[0]);
    return info(...args);
  };
})();
`;

const target = await fetch(`http://127.0.0.1:${chromePort}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
const consoleErrors = [];
socket.addEventListener('message', (event) => {
  const m = JSON.parse(event.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(m.error.message));
    else resolve(m.result);
  }
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails.text);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    consoleErrors.push(`${m.params.entry.text} ${m.params.entry.url || ''}`.trim());
  }
});
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
function command(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await command('Runtime.evaluate', {
    expression: `Promise.resolve((() => (${expression}))()).then((v) => JSON.stringify(v ?? null))`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value === undefined ? undefined : JSON.parse(r.result.value);
}
async function waitFor(expression, label, timeoutMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(`!!(${expression})`)) return;
    await new Promise((r) => setTimeout(r, 60));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

await command('Page.enable');
await command('Runtime.enable');
await command('Log.enable');
await command('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const listingId = await fetch(`${appUrl}/api/listings`).then((r) => r.json()).then((d) => d.listings[0].id);
const collectionHtml = await fetch(`${appUrl}/essays/${collectionSlug}`).then((r) => r.text());
const collectionListingId = (collectionHtml.match(/listing=([a-z0-9]{20,})/) || [])[1];
if (!collectionListingId) throw new Error(`no listing found on /essays/${collectionSlug}`);

const HELPERS = `(() => {
  window.__fill = (email) => {
    const input = document.getElementById('deliveryEmail');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, email);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  window.__continue = () => {
    const b = document.querySelector('.buy-start-payment');
    if (!b) return null;
    b.click();
    return b.textContent.trim();
  };
  window.__landing = () => { try { return sessionStorage.getItem('admitfolio:landing'); } catch { return 'STORAGE-THREW'; } };
  window.__homeLink = () => {
    // The breadcrumb "Admitfolio" link on a collection page. A next/link, so
    // this is a client-side soft navigation with no new document, which is
    // exactly the journey being tested.
    const a = [...document.querySelectorAll('nav a')].find((el) => new URL(el.href).pathname === '/');
    if (!a) return false;
    a.click();
    return true;
  };
  return 1;
})()`;

// Start on about:blank with the desired referrer parked in sessionStorage, so
// PROBE can install it before any page script on the page that follows. Origin
// scoped, so it has to be seeded from a page on that origin.
async function seedReferrer(referrer) {
  await command('Page.navigate', { url: `${appUrl}/api/version` });
  await pause(250);
  await evaluate(
    referrer === null
      ? "(() => { sessionStorage.clear(); return 1; })()"
      : `(() => { sessionStorage.clear(); sessionStorage.setItem('__forceReferrer', ${JSON.stringify(referrer)}); return 1; })()`,
  );
}

async function land(url) {
  await command('Page.navigate', { url });
  await waitFor("document.readyState === 'complete'", `load of ${url}`);
  await evaluate(HELPERS);
  // The landing record is written from an effect, so it lands after hydration.
  await waitFor("window.__landing() !== null", `landing record on ${url}`);
}

async function openAndMount(label) {
  await waitFor("document.querySelector('.buy-overlay.open') && document.getElementById('deliveryEmail')", `${label} dialog`);
  await waitFor(
    "Object.keys(document.getElementById('deliveryEmail')).some((k) => k.startsWith('__react'))",
    `${label} hydration`,
  );
  await evaluate(HELPERS);
  await evaluate("(() => { window.__fill('verify-probe@example.com'); return 1; })()");
  // React commits the controlled input state after the change event. Clicking
  // in the same evaluation can run startPayment against the previous empty
  // state and produce no request, which makes this verifier race hydration.
  await waitFor("document.querySelector('.buy-email-input.ok')", `${label} valid email state`);
  await evaluate("(() => { window.__continue(); return 1; })()");
  await waitFor("window.__calls.length > 0", `${label} checkout request`);
  await pause(1500);
  const calls = await evaluate('window.__calls');
  const analytics = await evaluate('window.__analytics');
  const iframes = await evaluate("document.querySelectorAll('.embedded-checkout-wrap iframe').length");
  return { calls, analytics, iframes };
}

// A Checkout Session's client secret is "<session id>_secret_<...>", so the
// session the buyer's own browser just created can be read back by id. Nothing
// about it is completed or modified.
async function metadataFor(clientSecret) {
  const id = String(clientSecret ?? '').split('_secret_')[0];
  // A failed /api/checkout returns no client secret. Report that through the
  // ordinary checks below rather than crashing the run, because "the request
  // 502'd" is exactly the outcome the clamp exists to prevent and a stack trace
  // hides which scenario produced it.
  if (!/^cs_test_/.test(id)) return { id: null, metadata: {}, paymentIntent: null };
  const session = await stripe.checkout.sessions.retrieve(id, { expand: ['payment_intent'] });
  return { id, metadata: session.metadata || {}, paymentIntent: session.payment_intent };
}

const results = [];

// ---------------------------------------------------------------------------
// 1. Landed on the homepage, bought on the homepage. Homepage mount.
// ---------------------------------------------------------------------------
{
  const at = 'homepage';
  await seedReferrer('https://www.google.com/');
  await land(`${appUrl}/?checkout=${listingId}`);
  const stored = JSON.parse(await evaluate('window.__landing()'));
  check(stored.page === '/', `${at}: landing recorded as / (got ${JSON.stringify(stored.page)})`);
  const { calls, analytics, iframes } = await openAndMount(at);
  check(calls.length === 1 && calls[0].status === 200, `${at}: one checkout request, 200 (${calls.map((c) => c.status).join(',')})`);
  const { id, metadata, paymentIntent } = await metadataFor(calls[0].clientSecret);
  results.push([at, id, metadata]);
  check(metadata.landingPage === '/', `${at}: landingPage is / (got ${JSON.stringify(metadata.landingPage)})`);
  check(metadata.checkoutPage === '/', `${at}: checkoutPage is / (got ${JSON.stringify(metadata.checkoutPage)})`);
  check(metadata.landingReferrer === 'www.google.com', `${at}: landingReferrer is www.google.com (got ${JSON.stringify(metadata.landingReferrer)})`);
  check(metadata.listingId === listingId, `${at}: the listing is still the one being bought`);
  check(metadata.amountCents && metadata.itemLabel && metadata.checkoutVersion === '3', `${at}: the money fields are untouched`);
  check(paymentIntent === null, `${at}: no PaymentIntent exists yet, because nothing was paid`);
  check(iframes === 1, `${at}: Stripe's payment form mounted, and nothing was paid`);
  // The two events Ritvik asked to leave alone.
  check(
    analytics.some((line) => line.includes('Checkout Email Submitted')),
    `${at}: Checkout Email Submitted still fires`,
  );
  check(
    analytics.some((line) => line.includes('Checkout Payment Loaded')),
    `${at}: Checkout Payment Loaded still fires`,
  );
}

await pause(2000);

// ---------------------------------------------------------------------------
// 2. Landed on a collection page, bought there. Collection mount.
// ---------------------------------------------------------------------------
{
  const at = 'collection';
  await seedReferrer('https://www.google.com/search?q=common+app+essay+examples');
  await land(`${appUrl}/essays/${collectionSlug}?checkout=${collectionListingId}`);
  const { calls, iframes } = await openAndMount(at);
  check(calls.length === 1 && calls[0].status === 200, `${at}: one checkout request, 200`);
  const { id, metadata, paymentIntent } = await metadataFor(calls[0].clientSecret);
  results.push([at, id, metadata]);
  check(metadata.landingPage === `/essays/${collectionSlug}`, `${at}: landingPage is the collection (got ${JSON.stringify(metadata.landingPage)})`);
  check(metadata.checkoutPage === `/essays/${collectionSlug}`, `${at}: checkoutPage is the collection (got ${JSON.stringify(metadata.checkoutPage)})`);
  // Only the referring host is retained. Paths can contain private document,
  // inbox, intranet, or group-chat identifiers that do not belong in Stripe.
  check(metadata.landingReferrer === 'www.google.com', `${at}: landingReferrer keeps only the host (got ${JSON.stringify(metadata.landingReferrer)})`);
  check(paymentIntent === null, `${at}: no PaymentIntent exists yet, because nothing was paid`);
  check(iframes === 1, `${at}: Stripe's payment form mounted, and nothing was paid`);
}

await pause(2000);

// ---------------------------------------------------------------------------
// 3. THE ONE THAT MATTERS. Landed on a collection page, navigated to the
//    homepage, bought there. The collection page must get the credit.
// ---------------------------------------------------------------------------
{
  const at = 'collection then homepage';
  await seedReferrer('https://www.google.com/');
  await land(`${appUrl}/essays/${collectionSlug}?utm_source=google&utm_medium=organic`);
  const landed = JSON.parse(await evaluate('window.__landing()'));
  check(landed.page === `/essays/${collectionSlug}`, `${at}: the collection is recorded on arrival`);

  // Leg one: a soft navigation, which is what every link on the site does.
  // next/link keeps the root layout mounted, so components/VisitSource is not
  // remounted and its effect does not run again.
  check(await evaluate('window.__homeLink()'), `${at}: the breadcrumb home link was found and clicked`);
  await waitFor("window.location.pathname === '/'", `${at} soft navigation to /`);
  await pause(1200);
  const afterSoftNav = JSON.parse(await evaluate('window.__landing()'));
  check(
    afterSoftNav.page === `/essays/${collectionSlug}`,
    `${at}: after the soft navigation the record still says the collection (got ${JSON.stringify(afterSoftNav.page)})`,
  );

  // Leg two, and this is the leg that has teeth. A reload, a typed URL or Back
  // to a page the bfcache dropped is a NEW DOCUMENT: the layout remounts and
  // VisitSource runs again, on the homepage, with sessionStorage still full.
  // First write wins is the only thing standing between that and the homepage
  // quietly taking credit for a sale the collection page earned. Without the
  // hard navigation this scenario passes whether or not that rule exists.
  await command('Page.navigate', { url: `${appUrl}/` });
  await waitFor("document.readyState === 'complete'", `${at} hard navigation to /`);
  await evaluate(HELPERS);
  await waitFor("window.__landing() !== null", `${at} landing record after the reload`);
  await pause(600);
  const afterHardNav = JSON.parse(await evaluate('window.__landing()'));
  check(
    afterHardNav.page === `/essays/${collectionSlug}`,
    `${at}: after a FULL page load of / the record STILL says the collection (got ${JSON.stringify(afterHardNav.page)})`,
  );

  await evaluate(HELPERS);
  // Open checkout from the homepage the normal way, via the card's Unlock.
  await waitFor("document.querySelector('.ecard-unlock') || document.querySelector('.d-unlock-btn')", `${at} an unlock control on /`);
  await evaluate("(() => { (document.querySelector('.d-unlock-btn') || document.querySelector('.ecard-unlock')).click(); return 1; })()");
  const { calls, iframes } = await openAndMount(at);
  check(calls.length === 1 && calls[0].status === 200, `${at}: one checkout request, 200`);
  const { id, metadata, paymentIntent } = await metadataFor(calls[0].clientSecret);
  results.push([at, id, metadata]);
  check(
    metadata.landingPage === `/essays/${collectionSlug}`,
    `${at}: THE COLLECTION PAGE GETS THE CREDIT, not the homepage (got ${JSON.stringify(metadata.landingPage)})`,
  );
  check(metadata.checkoutPage === '/', `${at}: and checkoutPage records that the sale closed on / (got ${JSON.stringify(metadata.checkoutPage)})`);
  check(metadata.landingUtm === 'source=google&medium=organic', `${at}: the campaign from the landing URL survived too (got ${JSON.stringify(metadata.landingUtm)})`);
  check(paymentIntent === null, `${at}: no PaymentIntent exists yet, because nothing was paid`);
  check(iframes === 1, `${at}: Stripe's payment form mounted, and nothing was paid`);
}

await pause(2000);

// ---------------------------------------------------------------------------
// 4. No referrer at all. Most direct traffic looks like this, and so does
//    every visit that arrives with Referrer-Policy: no-referrer upstream.
// ---------------------------------------------------------------------------
{
  const at = 'empty referrer';
  await seedReferrer('');
  await land(`${appUrl}/?checkout=${listingId}`);
  const { calls, iframes } = await openAndMount(at);
  check(calls.length === 1 && calls[0].status === 200, `${at}: the request still succeeds (${calls.map((c) => c.status).join(',')})`);
  const { id, metadata } = await metadataFor(calls[0].clientSecret);
  results.push([at, id, metadata]);
  check(!('landingReferrer' in metadata), `${at}: the key is omitted rather than sent blank`);
  check(!('landingUtm' in metadata), `${at}: and so is the campaign`);
  check(metadata.landingPage === '/' && metadata.checkoutPage === '/', `${at}: the page fields are still there`);
  check(iframes === 1, `${at}: Stripe's payment form still mounted`);
}

await pause(2000);

// ---------------------------------------------------------------------------
// 5. An absurdly long referrer path. The browser must discard the path and send
//    only the hostname, both to avoid copying private third-party URLs into
//    Stripe and to keep an untrusted referrer from breaking checkout.
// ---------------------------------------------------------------------------
{
  const at = 'absurd referrer';
  const absurd = 'https://example.com/' + 'a'.repeat(9_000);
  await seedReferrer(absurd);
  await land(`${appUrl}/?checkout=${listingId}`);
  const { calls, iframes } = await openAndMount(at);
  check(calls.length === 1 && calls[0].status === 200, `${at}: the request SUCCEEDS rather than 502ing (${calls.map((c) => `${c.status} ${c.error || ''}`).join(',')})`);
  check(
    calls[0].sent && typeof calls[0].sent.source?.landingReferrer === 'string' && calls[0].sent.source.landingReferrer.length > 0,
    `${at}: the browser did send a referrer, so this is a real test of the clamp`,
  );
  const { id, metadata } = await metadataFor(calls[0].clientSecret);
  results.push([at, id, metadata]);
  check(
    metadata.landingReferrer === 'example.com',
    `${at}: Stripe stored only the hostname (got ${JSON.stringify(metadata.landingReferrer)})`,
  );
  check(iframes === 1, `${at}: Stripe's payment form still mounted`);
}

// ---------------------------------------------------------------------------
// Nothing was bought.
// ---------------------------------------------------------------------------
for (const [label, id] of results) {
  if (!id) continue;
  const session = await stripe.checkout.sessions.retrieve(id);
  check(session.payment_status === 'unpaid', `${label}: session ${id} is still unpaid`);
}

const realErrors = consoleErrors.filter((t) => !/favicon|Download the React|Password field|_vercel\/(speed-)?insights/i.test(t));
check(realErrors.length === 0, `no console errors (${realErrors.length})`);

console.log(notes.join('\n'));
console.log('\nmetadata as Stripe stored it:');
for (const [label, id, metadata] of results) {
  console.log(`\n  ${label}  (${id || 'no session was created'})`);
  for (const key of Object.keys(metadata).sort()) {
    const value = metadata[key];
    console.log(`    ${key.padEnd(16)} ${value.length > 80 ? value.slice(0, 77) + '...' : value}`);
  }
}
if (realErrors.length) console.log('\nconsole errors:\n' + realErrors.map((t) => '  ' + t).join('\n'));

socket.close();
await fetch(`http://127.0.0.1:${chromePort}/json/close/${target.id}`).catch(() => {});
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n` + failures.map((f) => '  - ' + f).join('\n'));
  process.exit(1);
}
console.log('\ncheckout attribution checks passed');
