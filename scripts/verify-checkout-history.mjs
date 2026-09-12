#!/usr/bin/env node

// Back-button regression check for the checkout dialog, on both of its mounts.
//
// The bug this guards: closeBuy used to push a ?listing= entry where closeDetail
// pops. Unlock a listing, close checkout, press Back, and the entry behind the
// visitor was the checkout they had just left, so Back went forward into the
// payment screen.
//
// Every history write is attributed to its caller. pushState, replaceState,
// back and forward are wrapped in Page.addScriptToEvaluateOnNewDocument, which
// runs before any app code on the document, so the log below is the app's own
// calls and nothing else. The stack after each step is read from the recorded
// entries rather than from the browser, because window.history exposes only a
// length and the current entry.
//
// Start Next locally and Chrome with --remote-debugging-port=9223 first. The
// app URL must be localhost, not 127.0.0.1: Next's dev server serves
// /_next/static chunks only to the origin it was started on.
//
// No email is typed and no Stripe session is created. Checkout is asserted on
// its dialog state at step 1, never past it.

const chromePort = process.env.CHROME_DEBUG_PORT || '9223';
const appUrl = (process.env.APP_URL || 'http://localhost:3000/').replace(/\/$/, '');
const collectionPath = process.env.COLLECTION_PATH || '/essays/computer-science';

const target = await fetch(`http://127.0.0.1:${chromePort}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
const consoleErrors = [];

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params.exceptionDetails.text);
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    consoleErrors.push(`${message.params.entry.text} ${message.params.entry.url || ''}`.trim());
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
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, label, timeoutMs = 20000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try { last = await evaluate(expression); } catch (error) { last = `threw: ${error.message}`; }
    if (last === true) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label} (last value ${JSON.stringify(last)})`);
}

const failures = [];
function check(condition, message) {
  if (condition) return true;
  failures.push(message);
  return false;
}

// The instrumentation. __hist.stack mirrors the browser's session history so a
// press of Back can be predicted and printed; __hist.calls is the attributed
// log of every write the app made.
const instrument = `
(() => {
  const at = () => location.pathname + location.search + location.hash;
  // pushState and replaceState reach this wrapper through three other patches
  // of the same methods: Next's App Router, Vercel Analytics and Vercel Speed
  // Insights all wrap them, and this wrapper is installed first so it sits at
  // the bottom. history.back and history.forward are patched by nobody. Either
  // way the attribution is the first frame in the app's own chunks, so skip
  // every framework and vendor frame to reach it.
  const caller = () => {
    const lines = (new Error().stack || '').split('\\n').slice(1);
    const app = lines.find((l) => /_next\\/static\\/chunks\\/(app_|components_|_[a-z0-9]+\\._)/.test(l) && !/node_modules/.test(l));
    const other = lines.find((l) => !/<anonymous>/.test(l));
    // No source frame at all means nothing on the page made this call: it is a
    // Back or Forward the harness drove, standing in for the browser's own.
    if (!app && !other) return 'browser Back/Forward';
    return (app || other).trim().replace(/^at\\s+/, '').replace('http://localhost:3000/_next/static/chunks/', '');
  };
  const hist = { calls: [], stack: [at()], index: 0, marks: [] };
  window.__hist = hist;
  window.__histReset = () => { hist.calls.length = 0; };
  const realPush = history.pushState.bind(history);
  const realReplace = history.replaceState.bind(history);
  const realBack = history.back.bind(history);
  const realForward = history.forward.bind(history);
  const realGo = history.go.bind(history);
  history.pushState = function (state, title, url) {
    const out = realPush(state, title, url);
    hist.stack.length = hist.index + 1;
    hist.stack.push(at());
    hist.index = hist.stack.length - 1;
    hist.calls.push({ op: 'pushState', to: at(), state: state ? Object.keys(state).join(',') : null, by: caller() });
    return out;
  };
  history.replaceState = function (state, title, url) {
    const out = realReplace(state, title, url);
    hist.stack[hist.index] = at();
    hist.calls.push({ op: 'replaceState', to: at(), state: state ? Object.keys(state).join(',') : null, by: caller() });
    return out;
  };
  history.back = function () { hist.calls.push({ op: 'back', by: caller() }); return realBack(); };
  history.forward = function () { hist.calls.push({ op: 'forward', by: caller() }); return realForward(); };
  history.go = function (n) { hist.calls.push({ op: 'go(' + n + ')', by: caller() }); return realGo(n); };
  addEventListener('popstate', () => {
    const here = at();
    // Re-anchor on the nearest matching entry so the mirror follows the browser
    // through a Back or Forward the script drove itself.
    let moved = -1;
    for (const candidate of [hist.index - 1, hist.index + 1]) {
      if (hist.stack[candidate] === here) { moved = candidate; break; }
    }
    hist.index = moved >= 0 ? moved : hist.stack.indexOf(here);
    hist.calls.push({ op: 'popstate', to: here, index: hist.index });
  });
})();
`;

await command('Page.enable');
await command('Runtime.enable');
await command('Log.enable');
await command('Page.addScriptToEvaluateOnNewDocument', { source: instrument });

const VIEWPORTS = {
  desktop: { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
};

async function viewport(name) {
  await command('Emulation.setDeviceMetricsOverride', VIEWPORTS[name]);
}

async function go(url) {
  // Two things have to be true at the start of a scenario. The document must be
  // new, because a navigation that differs only by fragment reuses it and the
  // mirrored stack would carry over; and the session history must be empty, or
  // a real Back at index 0 walks off into the harness's own setup navigation
  // and detaches the debugger. about:blank plus a reset gives both.
  await command('Page.navigate', { url: 'about:blank' });
  await new Promise((resolve) => setTimeout(resolve, 120));
  await command('Page.resetNavigationHistory');
  await command('Page.navigate', { url });
  await waitFor('!!window.__hist', 'instrumentation');
}

// React owns a DOM node once it has stamped a fiber on it. Clicking before that
// runs the browser's own default instead of the app's handler, which on a
// collection page means following the card anchor as a real navigation.
async function waitForHydration(selector, label) {
  await waitFor(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return !!el && Object.keys(el).some((k) => k.startsWith('__react')); })()`,
    `${label} to hydrate`,
  );
}

// What the page is showing, in the three terms the scenarios are written in.
const STATE = `(() => ({
  url: location.pathname + location.search + location.hash,
  histState: history.state ? Object.keys(history.state).filter((k) => k === 'checkout' || k === 'listing' || k === 'collectionListing' || k === 'collectionCheckout') : [],
  checkout: !!document.querySelector('.buy-overlay.open'),
  sheet: !!document.querySelector('.ov'),
  backLabel: (document.querySelector('.buy-back')?.textContent || '').replace(/\\s+/g, ' ').trim(),
  pillLabel: document.querySelector('.buy-overlay .mobile-page-close')?.getAttribute('aria-label') || '',
  stack: window.__hist.stack.slice(),
  index: window.__hist.index,
  calls: window.__hist.calls.slice(),
}))()`;

async function state() { return evaluate(STATE); }
async function resetCalls() { await evaluate('window.__histReset()'); }

function renderStack(s) {
  return s.stack.map((entry, i) => `${i === s.index ? '>' : ' '} ${entry}`).join('\n     ');
}

const report = [];
async function step(label) {
  const s = await state();
  report.push({ label, ...s });
  const calls = s.calls.map((c) => (c.op === 'popstate' ? `popstate -> ${c.to}` : `${c.op}${c.to ? ' -> ' + c.to : ''}  [${c.by}]`));
  console.log(`\n  ${label}`);
  console.log(`     ${renderStack(s)}`);
  console.log(`     checkout=${s.checkout} sheet=${s.sheet} state=[${s.histState.join(',')}]${s.backLabel ? ` back="${s.backLabel}"` : ''}${s.pillLabel ? ` pill="${s.pillLabel}"` : ''}`);
  if (calls.length) console.log(`     writes: ${calls.join(' | ')}`);
  await resetCalls();
  return s;
}

async function click(selector, label) {
  const ok = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
  if (!ok) throw new Error(`No element to click for ${label}: ${selector}`);
  await new Promise((resolve) => setTimeout(resolve, 450));
}

async function key(name) {
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await new Promise((resolve) => setTimeout(resolve, 450));
}

async function browserBack() {
  await evaluate('window.__browserBack = 1');
  await command('Runtime.evaluate', { expression: 'history.back()' });
  await new Promise((resolve) => setTimeout(resolve, 450));
}

async function browserForward() {
  await command('Runtime.evaluate', { expression: 'history.forward()' });
  await new Promise((resolve) => setTimeout(resolve, 450));
}

// Real selectors. The card is a role=button div, its Unlock is a div inside it
// that stops propagation, the detail sheet is .ov and its unlock a real button.
const CARDS = '.public-grid .catalog-card';
const CARD_UNLOCK = `${CARDS}:first-child .ecard-unlock`;
const SHEET = '.ov';
const SHEET_UNLOCK = '.ov .d-unlock-btn';
// Two links carry .home-see-more since the collections band shipped. The band's
// navigates to /essays; this one opens the catalogue in place.
const SEE_ALL_ESSAYS = 'a.home-see-more[href="#browse"]';

// ---------------------------------------------------------------- homepage --

await viewport('desktop');
await go(`${appUrl}/#browse`);
await waitFor(`document.querySelectorAll('${CARDS}').length >= 6`, 'catalogue');

// The catalogue is reached the way a visitor reaches it, from the homepage
// through See all essays, rather than by loading /#browse directly. That leaves
// one entry of runway behind the catalogue, so a Back pressed after checkout
// closes has somewhere real to land instead of leaving the site.
async function freshBrowse() {
  await go(`${appUrl}/`);
  await waitFor(`document.querySelectorAll('${CARDS}').length >= 3`, 'featured cards');
  await waitForHydration(SEE_ALL_ESSAYS, 'See all essays');
  await click(SEE_ALL_ESSAYS, 'See all essays');
  await waitFor(`document.querySelectorAll('${CARDS}').length >= 6`, 'catalogue');
  await waitForHydration(CARD_UNLOCK, 'the card unlock');
  await resetCalls();
}

async function openCardCheckout() {
  await click(CARD_UNLOCK, 'card unlock');
  await waitFor(`!!document.querySelector('.buy-overlay.open')`, 'checkout open');
  await waitForHydration('.buy-overlay .buy-back', 'the checkout back link');
}

async function openSheet() {
  await click(`${CARDS}`, 'card body');
  await waitFor(`!!document.querySelector('${SHEET_UNLOCK}')`, 'detail sheet');
  await waitForHydration(SHEET_UNLOCK, 'the sheet unlock');
}

async function openSheetCheckout() {
  await click(SHEET_UNLOCK, 'sheet unlock');
  await waitFor(`!!document.querySelector('.buy-overlay.open')`, 'checkout open from sheet');
  await waitForHydration('.buy-overlay .buy-back', 'the checkout back link');
}

const scenarios = [];
function scenario(name, fn) { scenarios.push({ name, fn }); }

scenario('homepage: card unlock, then browser Back', async () => {
  await freshBrowse();
  const a = await step('browse');
  await openCardCheckout();
  const b = await step('card unlock -> checkout');
  check(b.stack.length === a.stack.length + 1, 'card unlock should push exactly one entry');
  check(b.backLabel === '← Back to essays', `card unlock label should read Back to essays, got "${b.backLabel}"`);
  // openBuy reads this back on a Forward restore to tell a pushed entry from a
  // pasted link, and Next replaceStates its own router state onto the same
  // entry immediately afterwards, so it has to survive that.
  check(b.histState.includes('checkout'), `openBuy's { checkout } state must survive Next's replaceState, got [${b.histState.join(',')}]`);
  await browserBack();
  const c = await step('browser Back');
  check(!c.checkout, 'browser Back from a card checkout must not stay in checkout');
  check(!c.url.includes('checkout='), `browser Back should leave the checkout URL, got ${c.url}`);
  check(!c.url.includes('listing='), `card path has no sheet, so Back must not land on a listing URL, got ${c.url}`);
});

for (const [label, act] of [
  ['in-page back link', async () => click('.buy-overlay.open .buy-back', 'back link')],
  ['the x', async () => click('.buy-overlay.open .modal-close', 'x')],
  ['escape', async () => key('Escape')],
]) {
  scenario(`homepage: card unlock, then ${label}`, async () => {
    await freshBrowse();
    const a = await step('browse');
    await openCardCheckout();
    await step('card unlock -> checkout');
    await act();
    const c = await step(`close by ${label}`);
    check(!c.checkout, `${label} should close checkout`);
    check(c.index === a.index, `${label} should return to the entry the visitor came from, index ${c.index} vs ${a.index}`);
    check(!c.url.includes('checkout='), `${label} should leave the checkout URL, got ${c.url}`);
    check(!c.url.includes('listing='), `${label} on the card path must not open a listing, got ${c.url}`);
    await browserBack();
    const d = await step('then browser Back');
    check(!d.checkout, `Back after ${label} must not go forward into checkout`);
    check(!d.url.includes('checkout='), `Back after ${label} must not return to the checkout URL, got ${d.url}`);
    check(d.index === a.index - 1, `Back after ${label} should carry on backwards, index ${d.index} vs ${a.index - 1}`);
  });
}

scenario('homepage: card unlock, then the mobile close pill', async () => {
  await viewport('mobile');
  await freshBrowse();
  const a = await step('browse (390px)');
  await openCardCheckout();
  const b = await step('card unlock -> checkout');
  check(b.pillLabel === 'Back to essays', `mobile pill should read Back to essays, got "${b.pillLabel}"`);
  await click('.buy-overlay.open .mobile-page-close', 'mobile pill');
  const c = await step('close by mobile pill');
  check(!c.checkout, 'the mobile pill should close checkout');
  check(c.index === a.index, `the mobile pill should return to the catalogue entry, index ${c.index} vs ${a.index}`);
  await browserBack();
  const d = await step('then browser Back');
  check(!d.checkout, 'Back after the mobile pill must not go forward into checkout');
  check(!d.url.includes('checkout='), `Back after the mobile pill must not return to the checkout URL, got ${d.url}`);
  check(d.index === a.index - 1, `Back after the mobile pill should carry on backwards, index ${d.index} vs ${a.index - 1}`);
  await viewport('desktop');
});

scenario('homepage: detail sheet unlock, then browser Back', async () => {
  await freshBrowse();
  const a = await step('browse');
  await openSheet();
  const b = await step('open listing');
  check(b.url.includes('listing='), `opening the sheet should set ?listing=, got ${b.url}`);
  await openSheetCheckout();
  const c = await step('sheet unlock -> checkout');
  check(c.index === a.index + 2, `sheet path should be browse, listing, checkout, cursor at ${c.index} vs ${a.index + 2}`);
  check(c.backLabel === '← Back to listing', `sheet path label should read Back to listing, got "${c.backLabel}"`);
  await browserBack();
  const d = await step('browser Back');
  check(!d.checkout, 'browser Back from the sheet path must not stay in checkout');
  check(d.url.includes('listing='), `sheet path Back should land on the listing, got ${d.url}`);
});

scenario('homepage: detail sheet unlock, then checkout closes itself', async () => {
  await freshBrowse();
  const a = await step('browse');
  await openSheet();
  await openSheetCheckout();
  await step('sheet unlock -> checkout');
  await click('.buy-overlay.open .buy-back', 'back link');
  const c = await step('close checkout');
  check(!c.checkout, 'the back link should close checkout');
  check(c.url.includes('listing='), `closing should return to the listing, got ${c.url}`);
  check(c.index === a.index + 1, `closing should pop back to the listing entry, index ${c.index} vs ${a.index + 1}`);
  await browserBack();
  const d = await step('then browser Back');
  check(!d.checkout, 'Back after closing must not go forward into checkout');
  check(!d.url.includes('listing='), `Back from the listing should reach the catalogue, got ${d.url}`);
});

scenario('homepage: direct ?checkout= URL, then Back and then close', async () => {
  await freshBrowse();
  await openSheet();
  const listingId = await evaluate(`new URLSearchParams(location.search).get('listing')`);
  if (!listingId) throw new Error('Could not read a listing id from the sheet URL');
  await go(`${appUrl}/?checkout=${encodeURIComponent(listingId)}`);
  await waitFor(`!!document.querySelector('.buy-overlay.open')`, 'checkout restored from URL');
  await waitForHydration('.buy-overlay .buy-back', 'the checkout back link');
  await resetCalls();
  const a = await step('direct ?checkout= load');
  check(a.stack.length === 1, `a pasted checkout link is one entry, got ${a.stack.length}`);
  check(a.backLabel === '← Back to listing', `direct load should offer the listing, got "${a.backLabel}"`);
  await click('.buy-overlay.open .buy-back', 'back link');
  const b = await step('close checkout');
  check(!b.checkout, 'closing a direct checkout should close it');
  check(b.stack.length === 1, `closing a direct checkout must replace, not push, got ${b.stack.length} entries`);
  check(b.url.includes('listing='), `closing should fall back to the listing, got ${b.url}`);
  check(b.calls.some((c) => c.op === 'replaceState'), 'closing a direct checkout should replaceState');
  check(!b.calls.some((c) => c.op === 'pushState'), 'closing a direct checkout must not pushState');
});

scenario('homepage: browse, listing, unlock, Back, Forward', async () => {
  await freshBrowse();
  await openSheet();
  await openSheetCheckout();
  await step('sheet unlock -> checkout');
  await browserBack();
  const b = await step('browser Back');
  check(!b.checkout, 'Back should leave checkout');
  check(b.url.includes('listing='), `Back should land on the listing, got ${b.url}`);
  await browserForward();
  const c = await step('browser Forward');
  check(c.checkout, 'Forward should return to checkout');
  check(c.histState.includes('checkout'), `Forward should land on an entry still stamped { checkout }, got [${c.histState.join(',')}]`);
  check(c.url.includes('checkout='), `Forward should restore the checkout URL, got ${c.url}`);
  check(c.backLabel === '← Back to listing', `Forward should keep the sheet-path label, got "${c.backLabel}"`);
  await click('.buy-overlay.open .buy-back', 'back link');
  const d = await step('close after Forward');
  check(!d.checkout, 'closing after a Forward should close checkout');
  check(d.url.includes('listing='), `closing after a Forward should return to the listing, got ${d.url}`);
  check(!d.calls.some((c) => c.op === 'pushState'), 'closing after a Forward must not pushState');
});

// -------------------------------------------------------- collection pages --

scenario('collection page: unlock, close, and browser Back', async () => {
  await go(`${appUrl}${collectionPath}`);
  await waitFor(`document.querySelectorAll('a.ecard-link').length >= 3`, 'collection cards');
  await waitForHydration('a.ecard-link', 'the collection cards');
  await resetCalls();
  const a = await step('collection');
  await click('a.ecard-link', 'collection card');
  await waitFor(`!!document.querySelector('${SHEET_UNLOCK}')`, 'collection detail sheet');
  await waitForHydration(SHEET_UNLOCK, 'the sheet unlock');
  const b = await step('open listing');
  check(b.url.includes('listing='), `the sheet should set ?listing= on the collection, got ${b.url}`);
  check(b.url.startsWith(collectionPath), `the collection page must keep its own path, got ${b.url}`);
  await click(SHEET_UNLOCK, 'sheet unlock');
  await waitFor(`!!document.querySelector('.buy-overlay.open')`, 'collection checkout');
  await waitForHydration('.buy-overlay .buy-back', 'the checkout back link');
  const c = await step('unlock -> checkout');
  check(c.url.startsWith(`${collectionPath}?checkout=`), `collection checkout keeps its path, got ${c.url}`);
  check(c.backLabel === '← Back to listing', `the collection always returns to the listing, got "${c.backLabel}"`);
  check(c.index === a.index + 2, `collection stack should be page, listing, checkout, cursor at ${c.index} vs ${a.index + 2}`);
  await click('.buy-overlay.open .buy-back', 'back link');
  const d = await step('close checkout');
  check(!d.checkout, 'closing should close the collection checkout');
  check(d.url.includes('listing='), `closing should return to the listing, got ${d.url}`);
  check(d.index === a.index + 1, `closing should pop back to the listing entry, index ${d.index} vs ${a.index + 1}`);
  check(!d.calls.some((x) => x.op === 'pushState'), 'the collection close must not pushState');
  await browserBack();
  const e = await step('browser Back');
  check(!e.checkout, 'Back must not go forward into the collection checkout');
  check(e.url === collectionPath || !e.url.includes('listing='), `Back should reach the collection, got ${e.url}`);
});

scenario('collection page: unlock, then browser Back straight away', async () => {
  await go(`${appUrl}${collectionPath}`);
  await waitFor(`document.querySelectorAll('a.ecard-link').length >= 3`, 'collection cards');
  await waitForHydration('a.ecard-link', 'the collection cards');
  await click('a.ecard-link', 'collection card');
  await waitFor(`!!document.querySelector('${SHEET_UNLOCK}')`, 'collection detail sheet');
  await waitForHydration(SHEET_UNLOCK, 'the sheet unlock');
  await click(SHEET_UNLOCK, 'sheet unlock');
  await waitFor(`!!document.querySelector('.buy-overlay.open')`, 'collection checkout');
  await waitForHydration('.buy-overlay .buy-back', 'the checkout back link');
  await step('unlock -> checkout');
  await browserBack();
  const b = await step('browser Back');
  check(!b.checkout, 'Back should leave the collection checkout');
  check(b.url.includes('listing='), `Back should land on the listing, got ${b.url}`);
});

scenario('collection page: direct ?checkout= URL, then close', async () => {
  const listingId = await evaluate(`(() => {
    const a = document.querySelector('a.ecard-link');
    return a ? new URL(a.href).searchParams.get('listing') : '';
  })()`);
  if (!listingId) throw new Error('No listing id on the collection page');
  await go(`${appUrl}${collectionPath}?checkout=${encodeURIComponent(listingId)}`);
  await waitFor(`!!document.querySelector('.buy-overlay.open')`, 'collection checkout from URL');
  await waitForHydration('.buy-overlay .buy-back', 'the checkout back link');
  await resetCalls();
  const a = await step('direct ?checkout= load');
  check(a.stack.length === 1, `a pasted collection checkout link is one entry, got ${a.stack.length}`);
  await click('.buy-overlay.open .buy-back', 'back link');
  const b = await step('close checkout');
  check(!b.checkout, 'closing a direct collection checkout should close it');
  check(b.stack.length === 1, `closing must replace, not push, got ${b.stack.length} entries`);
  check(b.calls.some((c) => c.op === 'replaceState'), 'closing a direct collection checkout should replaceState');
  check(!b.calls.some((c) => c.op === 'pushState'), 'closing a direct collection checkout must not pushState');
});

let ran = 0;
for (const { name, fn } of scenarios) {
  console.log(`\n=== ${name} ===`);
  try {
    await fn();
    ran += 1;
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  ABORTED: ${error.message}`);
  }
}

const realErrors = consoleErrors.filter((text) => !/favicon|Download the React DevTools|Stripe\.js|js\.stripe\.com/i.test(text));
if (realErrors.length) failures.push(`console errors: ${realErrors.slice(0, 5).join(' | ')}`);

console.log(`\n${'='.repeat(70)}`);
if (failures.length) {
  console.log(`FAIL: ${failures.length} problem(s) across ${ran}/${scenarios.length} scenarios`);
  failures.forEach((f) => console.log(`  - ${f}`));
  await command('Target.closeTarget', { targetId: target.id }).catch(() => {});
  process.exit(1);
}
console.log(`PASS: ${ran}/${scenarios.length} scenarios, every history write attributed`);
await command('Target.closeTarget', { targetId: target.id }).catch(() => {});
process.exit(0);
