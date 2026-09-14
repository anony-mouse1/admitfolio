#!/usr/bin/env node

// Browser checks for the one-screen checkout, run by hand like the other
// verify-*.mjs scripts. Not in package.json and not a test:* script: it needs a
// dev server and a browser, and test:* is pure.
//
//   npx next dev -p 3000
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
//     --remote-debugging-port=9223 --user-data-dir=/tmp/chrome-admitfolio about:blank
//   node scripts/verify-checkout-one-screen.mjs
//
// The app URL must be localhost, not 127.0.0.1: Next's dev server serves
// /_next/static only to the origin it was started on.
//
// NOTHING HERE COMPLETES A CHECKOUT. It asserts on dialog state and on whether
// a Stripe Checkout Session was created. "Pay" is never clicked.
//
// /api/checkout is throttled at 8 per minute per IP and every call bills a real
// sandbox Checkout Session, so the first call of a run is live and its client
// secret is replayed for the rest. The component under test is untouched by
// that: it still fetches, still gets a real secret, and Stripe still
// initialises against a real session.

const chromePort = process.env.CHROME_DEBUG_PORT || '9223';
const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const collectionSlug = process.env.COLLECTION_SLUG || 'common-app-personal-statement';

const failures = [];
const notes = [];
function check(condition, message) {
  if (condition) notes.push(`  ok    ${message}`);
  else { failures.push(message); notes.push(`  FAIL  ${message}`); }
}

// Records every createEmbeddedCheckoutPage, mount and destroy on the page, and
// caches the one live /api/checkout response. Injected before any page script.
const PROBE = String.raw`
(() => {
  const t0 = Date.now();
  window.__cx = [];
  const log = (kind, detail) => { window.__cx.push({ t: Date.now() - t0, kind, detail: String(detail ?? '') }); };
  window.__cxlog = log;
  window.__sessions = () => window.__cx.filter((e) => e.kind === 'create:start').length;
  window.__checkoutFail = 0;
  // Held in sessionStorage so one live call covers the whole run: the script
  // navigates a dozen times and eight live calls a minute is the throttle. It
  // is a sandbox client secret in a throwaway headless profile, and no checkout
  // is ever completed against it.
  let cachedBody = null;
  try { cachedBody = sessionStorage.getItem('__verifyCheckoutBody'); } catch { cachedBody = null; }
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/api/checkout') === -1) return realFetch(input, init);
    log('api:checkout', cachedBody ? 'replay' : 'live');
    if (window.__checkoutFail) {
      return new Response(JSON.stringify({ error: 'Too many attempts. Please wait a minute.' }), {
        status: window.__checkoutFail, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!cachedBody) {
      const response = await realFetch(input, init);
      cachedBody = await response.text();
      if (response.ok) { try { sessionStorage.setItem('__verifyCheckoutBody', cachedBody); } catch { /* private mode */ } }
      else cachedBody = null;
      return new Response(cachedBody || '{"error":"Could not load secure checkout. Please try again."}', {
        status: response.status, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(cachedBody, { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  let realStripe;
  Object.defineProperty(window, 'Stripe', {
    configurable: true,
    get() { return realStripe; },
    set(fn) {
      realStripe = function (...args) {
        const s = fn.apply(this, args);
        const orig = s.createEmbeddedCheckoutPage ? s.createEmbeddedCheckoutPage.bind(s) : null;
        if (orig) {
          s.createEmbeddedCheckoutPage = function (opts) {
            const n = window.__sessions() + 1;
            log('create:start', '#' + n);
            return orig(opts).then((inst) => {
              log('create:ok', '#' + n);
              const d = inst.destroy.bind(inst);
              inst.destroy = function () { log('destroy', '#' + n); return d(); };
              const m = inst.mount.bind(inst);
              inst.mount = function (...a) { log('mount', '#' + n); return m(...a); };
              return inst;
            }, (err) => { log('create:throw', '#' + n + ' ' + (err && err.message)); throw err; });
          };
        }
        return s;
      };
      Object.assign(realStripe, fn);
    },
  });
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
  // The URL matters: a bare "Failed to load resource: 404" says nothing about
  // whether it was ours.
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
// Everything crosses the wire as a JSON string: returnByValue on anything
// holding a DOM node hits "Object reference chain is too long".
async function evaluate(expression) {
  const r = await command('Runtime.evaluate', {
    expression: `Promise.resolve((() => (${expression}))()).then((v) => JSON.stringify(v ?? null))`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value === undefined ? undefined : JSON.parse(r.result.value);
}
async function waitFor(expression, label, timeoutMs = 20000) {
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

const listingId = await fetch(`${appUrl}/api/listings`).then((r) => r.json()).then((d) => d.listings[0].id);
// A collection page only knows the listings it renders, so ?checkout= has to
// name one of those or CollectionBrowser opens nothing at all.
const collectionHtml = await fetch(`${appUrl}/essays/${collectionSlug}`).then((r) => r.text());
const collectionListingId = (collectionHtml.match(/listing=([a-z0-9]{20,})/) || [])[1];
if (!collectionListingId) throw new Error(`no listing found on /essays/${collectionSlug}`);

const HELPERS = `(() => {
  window.__fill = (email) => {
    const input = document.getElementById('deliveryEmail');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, email);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  // The detail sheet's own control where one is open, otherwise the card's
  // Unlock. Matched by class, not by text: on a collection page every card is
  // an anchor whose text contains the word Unlock, so a text match picks a card
  // link and navigates off the page instead of opening the dialog.
  window.__unlock = () => {
    const control = document.querySelector('.d-unlock-btn') || document.querySelector('.ecard-unlock');
    if (!control) return false;
    control.click();
    return true;
  };
  window.__continue = () => {
    const b = document.querySelector('.buy-start-payment');
    if (!b) return null;
    b.click();
    return b.textContent.trim();
  };
  window.__close = () => { document.querySelector('.buy-back').click(); };
  window.__look = () => {
    const control = document.querySelector('.buy-start-payment');
    const err = document.getElementById('deliveryEmailError');
    const input = document.getElementById('deliveryEmail');
    const card = document.querySelector('.buy-stripe-card');
    return {
      sessions: window.__sessions(),
      fieldValue: input ? input.value : null,
      fieldError: err && err.className.includes('show') ? err.textContent.trim() : '',
      fieldErrorRole: err ? err.getAttribute('role') : null,
      describedBy: input ? input.getAttribute('aria-describedby') : null,
      invalid: input ? input.getAttribute('aria-invalid') : null,
      control: control ? control.textContent.trim() : null,
      controlAriaDisabled: control ? control.getAttribute('aria-disabled') : null,
      controlDisabled: control ? control.disabled : null,
      controlDimmed: control ? Number(getComputedStyle(control).opacity) : null,
      controlCursor: control ? getComputedStyle(control).cursor : null,
      paymentButtons: [...document.querySelectorAll('.buy-payment button')].map((b) => b.textContent.trim()),
      iframes: document.querySelectorAll('.embedded-checkout-wrap iframe').length,
      embeddedError: (document.querySelector('.embedded-checkout-error') || {}).textContent || '',
      controlBottom: control ? Math.round(control.getBoundingClientRect().bottom) : null,
      cardTop: card ? Math.round(card.getBoundingClientRect().top) : null,
      viewport: window.innerHeight,
      overflowsX: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  };
  return 1;
})()`;

async function openCheckout(url) {
  await command('Page.navigate', { url });
  await waitFor("document.querySelector('.buy-overlay.open') && document.getElementById('deliveryEmail')", `checkout dialog at ${url}`);
  // A collection page server-renders the dialog, so the control is on screen
  // and inert until React attaches: about 230ms under `next dev`, less under
  // `next start`, but never zero. Clicking into that gap makes this script fail
  // on something the buyer would experience as one dead tap, not as the thing
  // being measured. A React fiber key on the input is the attach signal.
  await waitFor(
    "Object.keys(document.getElementById('deliveryEmail')).some((k) => k.startsWith('__react'))",
    `hydration at ${url}`,
  );
  await evaluate(HELPERS);
}

// ---------------------------------------------------------------------------
// Both mounts, both widths, three moments: landing, mid-type, mounted.
// ---------------------------------------------------------------------------
const surfaces = [
  ['homepage', `${appUrl}/?checkout=${listingId}`],
  ['collection', `${appUrl}/essays/${collectionSlug}?checkout=${collectionListingId}`],
];
const widths = [[390, 844, true], [1440, 900, false]];

for (const [surface, url] of surfaces) {
  for (const [width, height, mobile] of widths) {
    const at = `${surface} @ ${width}`;
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await openCheckout(url);

    const landing = await evaluate('window.__look()');
    notes.push(`${at} landing`);
    check(landing.control === 'Continue to payment', `${at} landing: the control is on screen and says Continue to payment`);
    check(landing.controlAriaDisabled === null, `${at} landing: nothing announces the control as disabled`);
    check(landing.controlDisabled === false, `${at} landing: and it is not really disabled either`);
    check(landing.controlDimmed === 1, `${at} landing: it is not dimmed to look unavailable (opacity ${landing.controlDimmed})`);
    check(landing.controlCursor === 'pointer', `${at} landing: and the cursor says it can be clicked`);
    check(landing.fieldErrorRole === 'alert', `${at} landing: the field message is a live region`);
    check(landing.describedBy === 'deliveryEmailHint deliveryEmailError', `${at} landing: and the input points at it`);
    check(landing.invalid === null, `${at} landing: the input is not marked invalid before anyone has typed`);
    check(landing.sessions === 0, `${at} landing: no Stripe session yet`);
    check(landing.iframes === 0, `${at} landing: and no payment iframe`);
    check(landing.controlBottom <= landing.viewport, `${at} landing: the control is above the fold (${landing.controlBottom} of ${landing.viewport})`);
    check(!landing.overflowsX, `${at} landing: the page does not scroll sideways`);

    // Clicking with an empty field explains itself rather than going dead.
    check(await evaluate('window.__continue()') === 'Continue to payment', `${at} empty click: the control took the click`);
    await pause(250);
    const empty = await evaluate('window.__look()');
    check(empty.fieldError === 'Enter a valid delivery email.', `${at} empty click: it says why`);
    check(empty.invalid === 'true', `${at} empty click: and marks the input invalid`);
    check(empty.sessions === 0, `${at} empty click: and starts no Stripe session`);

    // Mid-type. Half an address is not a reason to mount anything.
    await evaluate("(() => { window.__fill('half@'); return 1; })()");
    await pause(150);
    const midType = await evaluate('window.__look()');
    check(midType.sessions === 0, `${at} mid-type: still no Stripe session`);
    check(midType.control === 'Continue to payment', `${at} mid-type: the control is still there`);
    check(midType.controlAriaDisabled === null, `${at} mid-type: and still not announced as disabled`);
    check(await evaluate('window.__continue()') !== null, `${at} mid-type: a malformed address still takes the click`);
    await pause(250);
    const midTypeAfter = await evaluate('window.__look()');
    check(midTypeAfter.fieldError === 'Enter a valid delivery email.', `${at} mid-type: and says why`);
    check(midTypeAfter.sessions === 0, `${at} mid-type: and starts no Stripe session`);

    // Mounted. One deliberate click, one session.
    await evaluate("(() => { window.__fill('verify-probe@example.com'); return 1; })()");
    await evaluate('window.__continue()');
    await waitFor("document.querySelectorAll('.embedded-checkout-wrap iframe').length > 0", `${at} payment form`);
    await pause(1200);
    const mounted = await evaluate('window.__look()');
    check(mounted.sessions === 1, `${at} mounted: exactly one Stripe session for one click`);
    check(mounted.control === null, `${at} mounted: the control steps aside once the form is up`);
    check(mounted.paymentButtons.length === 0, `${at} mounted: and leaves no second control behind`);
    check(!mounted.overflowsX, `${at} mounted: the page still does not scroll sideways`);
    check(mounted.cardTop <= mounted.viewport, `${at} mounted: the payment card is on screen (top ${mounted.cardTop} of ${mounted.viewport})`);

    // Close and reopen. This is what used to spend a session per reopen.
    await evaluate('(() => { window.__close(); return 1; })()');
    await pause(700);
    check(await evaluate('window.__unlock()'), `${at} reopen: the listing sheet offers unlock again`);
    await waitFor("document.querySelector('.buy-overlay.open') && document.getElementById('deliveryEmail')", `${at} dialog again`);
    await pause(2500);
    const reopened = await evaluate('window.__look()');
    check(reopened.sessions === 1, `${at} reopen: reopening spends no session (${reopened.sessions} total, was 1)`);
    check(reopened.fieldValue === '', `${at} reopen: the field is empty, as a fresh dialog should be`);
    check(reopened.iframes === 0, `${at} reopen: and no payment form is mounted`);
    check(reopened.control === 'Continue to payment', `${at} reopen: the control is back and says Continue to payment`);
  }
}

// ---------------------------------------------------------------------------
// A failed mount leaves something to try again with.
// ---------------------------------------------------------------------------
for (const [width, height, mobile] of widths) {
  const at = `retry @ ${width}`;
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await openCheckout(`${appUrl}/?checkout=${listingId}`);

  // Prime the cached client secret with one good mount, then close back to the
  // landing state so the failure below is the buyer's first attempt.
  await evaluate("(() => { window.__fill('verify-probe@example.com'); window.__continue(); return 1; })()");
  await waitFor("document.querySelectorAll('.embedded-checkout-wrap iframe').length > 0", `${at} priming mount`);
  await pause(1000);
  await evaluate('(() => { window.__close(); return 1; })()');
  await pause(600);
  await evaluate('window.__unlock()');
  await waitFor("document.querySelector('.buy-overlay.open') && document.getElementById('deliveryEmail')", `${at} dialog again`);

  await evaluate('(() => { window.__checkoutFail = 429; return 1; })()');
  await evaluate("(() => { window.__fill('verify-probe@example.com'); window.__continue(); return 1; })()");
  await pause(3000);
  const failed = await evaluate('window.__look()');
  check(failed.fieldError === 'Too many attempts. Please wait a minute.', `${at}: the throttle's own words reach the buyer`);
  check(failed.fieldErrorRole === 'alert', `${at}: announced, not just painted red`);
  check(failed.invalid === null, `${at}: and the address is not blamed for it, the tick still stands`);
  check(failed.control === 'Try again', `${at}: a control comes back and says Try again`);
  check(failed.controlAriaDisabled === null && failed.controlDisabled === false, `${at}: enabled, and announced as enabled`);
  check(failed.iframes === 0, `${at}: the dead mount is gone rather than left on screen`);
  check(failed.embeddedError === '', `${at}: and the message is in one place, not two`);
  check(failed.fieldValue === 'verify-probe@example.com', `${at}: the address the buyer typed is still in the field`);
  check(failed.controlBottom <= failed.viewport, `${at}: and the way out is above the fold (${failed.controlBottom} of ${failed.viewport})`);

  await evaluate('(() => { window.__checkoutFail = 0; return 1; })()');
  const sessionsBeforeRetry = failed.sessions;
  check(await evaluate('window.__continue()') === 'Try again', `${at}: the retry takes one click`);
  await waitFor("document.querySelectorAll('.embedded-checkout-wrap iframe').length > 0", `${at} recovered payment form`);
  await pause(800);
  const recovered = await evaluate('window.__look()');
  check(recovered.iframes === 1, `${at}: and the payment form comes up`);
  check(recovered.fieldValue === 'verify-probe@example.com', `${at}: with the same address, nothing retyped`);
  check(recovered.fieldError === '', `${at}: and the message cleared`);
  check(recovered.sessions === sessionsBeforeRetry + 1, `${at}: one retry, one new session`);
}

// ---------------------------------------------------------------------------
// The whole gesture Codex asked about: close while it is loading, reopen fast.
// Four rounds of this used to cross the 8 per minute throttle.
// ---------------------------------------------------------------------------
await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await openCheckout(`${appUrl}/?checkout=${listingId}`);
for (let round = 1; round <= 5; round += 1) {
  await evaluate("(() => { window.__fill('verify-probe@example.com'); window.__continue(); return 1; })()");
  // Close the moment the session is created, so the close always lands while
  // the card still reads "Loading secure checkout" and the round is still
  // exactly one click and one session.
  await waitFor(`window.__sessions() >= ${round}`, `close-and-reopen round ${round} session`);
  await evaluate('(() => { window.__close(); return 1; })()');
  await pause(400);
  await evaluate('window.__unlock()');
  await waitFor("document.querySelector('.buy-overlay.open') && document.getElementById('deliveryEmail')", `close-and-reopen round ${round}`);
  await pause(300);
}
await pause(2500);
const churn = await evaluate('window.__look()');
check(churn.sessions === 5, `close and reopen five times mid-load: five sessions, one per click (got ${churn.sessions}; it was two a round before the fix, and the fourth round crossed the throttle)`);
check(churn.embeddedError === '' && churn.fieldError === '', 'and the buyer is not left on an error');
check(churn.control === 'Continue to payment', 'with the control still on screen');

// _vercel/insights and _vercel/speed-insights 404 under `next start`: those
// scripts are served by Vercel's edge, not by the app. The IntegrationError is
// this script's own doing, the forced 429 above: our fetchClientSecret rethrows
// so Stripe knows the fetch failed, and Stripe's promise chain has no catch.
const realErrors = consoleErrors.filter((t) => !/favicon|Download the React|Password field|_vercel\/(speed-)?insights|fetchClientSecret failed/i.test(t));
check(realErrors.length === 0, `no console errors (${realErrors.length})`);

console.log(notes.join('\n'));
if (realErrors.length) console.log('\nconsole errors:\n' + realErrors.map((t) => '  ' + t).join('\n'));
socket.close();
await fetch(`http://127.0.0.1:${chromePort}/json/close/${target.id}`).catch(() => {});
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n` + failures.map((f) => '  - ' + f).join('\n'));
  process.exit(1);
}
console.log('\ncheckout one-screen checks passed');
