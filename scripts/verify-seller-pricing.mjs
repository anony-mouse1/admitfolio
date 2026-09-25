#!/usr/bin/env node

// Drives the real sell-wizard pricing step and the real dashboard price editor
// in headless Chrome, at 390px and 1440px.
//
// Both screens sit behind a seller login, and a real session would mean the
// production database. So every /api/seller/* call is answered inside the
// browser, over the DevTools Fetch domain, by an in-memory stub seller, draft
// and listing: none of those requests ever reaches the server. The public
// catalogue is read once from the local server (a GET) so the price range is
// computed from real listings, then held in memory and served to the page.
// Any other API request that is not a plain read is blocked and fails the run.
// Nothing is saved, nothing is submitted, and no real listing's price is sent
// anywhere.
//
// Needs `npx next dev -p 3000` and Chrome with --remote-debugging-port=9223.

import fs from 'node:fs';
import ts from 'typescript';

const chromePort = process.env.CHROME_DEBUG_PORT || '9223';
const appUrl = (process.env.APP_URL || 'http://localhost:3000/').replace(/\/?$/, '/');
const shotDir = process.env.SCREENSHOT_DIR || '';
const appOrigin = new URL(appUrl).origin;

function assert(condition, message) { if (!condition) throw new Error(message); }

// ---- Independent expectations (not the code under test) --------------------
const earnedCents = (dollars) => Math.floor((dollars * 100 * 6000 + 5000) / 10000);
const money = (cents) => `$${(cents / 100).toFixed(2)}`;
const earningsText = (dollars) =>
  `You'd earn ${money(earnedCents(dollars))} before Stripe's card fee, usually around 3% plus 30 cents.That's your 60% share of each sale.`;
const EMPTY_EARNINGS = "Enter a price from $10 to $399 to see what you'd earn.";
function expectedMarket(prices, essayCount, other) {
  const kind = `${other ? 'Other live' : 'Live'} ${essayCount}-essay listings`;
  const sorted = [...prices].sort((a, b) => a - b);
  if (sorted.length < 3) return `Not enough ${kind.charAt(0).toLowerCase() + kind.slice(1)} yet to show a price range.`;
  const at = (f) => sorted[Math.min(sorted.length - 1, Math.floor(f * (sorted.length - 1) + 0.5))];
  const [low, high] = [at(0.25), at(0.75)];
  const middle = sorted.length >= 8 && low !== high ? `, most between $${low} and $${high}` : '';
  return `${kind} are priced $${sorted[0]} to $${sorted[sorted.length - 1]}${middle}. (${sorted.length} ${sorted.length === 1 ? 'listing' : 'listings'})`;
}
const MSG = {
  min: 'The lowest price you can set is $10.',
  cents: 'Whole dollars only, no cents. Round to the nearest dollar.',
  cap: 'The most you can charge for one listing is $399.',
};

// schoolKey decides the client key of each proof upload, so it is loaded
// rather than copied.
const admitProofJs = ts.transpileModule(fs.readFileSync(new URL('../lib/admitProof.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { schoolKey } = await import(`data:text/javascript;base64,${Buffer.from(admitProofJs).toString('base64')}`);

// ---- Stub data ----------------------------------------------------------------
const catalogResponse = await fetch(`${appUrl}api/listings`).then((r) => r.json());
assert(catalogResponse.ok && Array.isArray(catalogResponse.listings), 'could not read the local catalogue');
const ESSAYS = 3;
const template = catalogResponse.listings.find((l) => l.essays.length === ESSAYS);
assert(template, 'the catalogue has no 3-essay listing to shape the test listing on');
// The dashboard's listing, added to the served catalogue so the editor has to
// leave itself out of its own comparison.
const TEST_LISTING_ID = 'listing-pricing-verifier';
const TEST_LISTING_PRICE = 76;
const catalog = {
  ...catalogResponse,
  listings: [...catalogResponse.listings, { ...template, id: TEST_LISTING_ID, price: TEST_LISTING_PRICE }],
};
const threeEssayPrices = catalog.listings.filter((l) => l.essays.length === ESSAYS && l.price != null).map((l) => l.price);
const otherThreeEssayPrices = catalog.listings
  .filter((l) => l.essays.length === ESSAYS && l.price != null && l.id !== TEST_LISTING_ID)
  .map((l) => l.price);

const ADMITS = ['Harvard University', 'Yale University'];
const DRAFT_ID = 'draft-pricing-verifier';
const draft = {
  id: DRAFT_ID,
  step: 5,
  revision: 1,
  updatedAt: new Date(0).toISOString(),
  state: {
    currentUniversity: 'Stanford University',
    currentMajor: '',
    graduationYear: '2028',
    targetSchool: 'Harvard University',
    applicationSystem: 'Common App',
    admits: ADMITS,
    anonymity: 'anonymous',
    packagePrice: null,
    teaser: '',
    appliedMajors: '',
    sellerNote: '',
    essays: [1, 2, 3].map((n) => ({ clientKey: `essay-${n}`, sourceEssayId: null, sourceFileName: null, prompt: 'Common App · Personal Statement', question: null, price: null })),
  },
  assets: [
    ...[1, 2, 3].map((n) => ({ id: `asset-essay-${n}`, kind: 'essay', clientKey: `essay-${n}`, fileName: `essay-${n}.pdf` })),
    ...ADMITS.map((school, n) => ({ id: `asset-proof-${n}`, kind: 'admitProof', clientKey: schoolKey(school).replace(/\s+/g, '-'), fileName: `proof-${n}.pdf` })),
  ],
};
const application = {
  key: 'app-pricing-verifier',
  school: 'Harvard University',
  cycleLabel: 'Class of 2028',
  classYear: '2028',
  decision: 'admitted',
  verificationStatus: 'verified',
  verificationLabel: null,
  localLogoSrc: null,
  listings: [{
    id: TEST_LISTING_ID,
    title: 'Common App essays',
    essayCount: ESSAYS,
    wordCount: 1500,
    priceCents: TEST_LISTING_PRICE * 100,
    status: 'approved',
    anonymity: 'anonymous',
    reviewerNote: null,
    pricingMode: 'package',
    packagePrice: TEST_LISTING_PRICE,
    sales: 0,
    createdAt: '2026-09-12T12:00:00.000Z',
    essays: [1, 2, 3].map((n) => ({ id: `essay-${n}`, label: 'Personal Statement', price: null })),
  }],
};

const sent = { patch: [], finalize: [], listingPrice: [], blocked: [] };
let revision = 1;
const STUBS = {
  'GET /api/listings': () => [200, catalog],
  'GET /api/seller/session': () => [200, { email: 'pricing-verifier@example.edu' }],
  'GET /api/seller/profile': () => [200, { name: null, bio: null, backgroundTags: [], currentUniversity: 'Stanford University', currentMajor: null, graduationYear: '2028' }],
  'GET /api/seller/drafts': () => [200, { ok: true, drafts: [draft] }],
  'GET /api/seller/listings': () => [200, { listings: [], applications: [application], payouts: null, monthGross: 0 }],
  [`PATCH /api/seller/drafts/${DRAFT_ID}`]: (body) => { sent.patch.push(body); revision += 1; return [200, { ok: true, draft: { revision } }]; },
  [`POST /api/seller/drafts/${DRAFT_ID}/finalize`]: () => { sent.finalize.push(true); return [400, { error: 'Stubbed by the verifier. Nothing was submitted.' }]; },
  'POST /api/seller/listing-price': (body) => { sent.listingPrice.push(body); return [200, { ok: true, packagePrice: body.packagePrice }]; },
};
// Reads that may reach the local server untouched.
const PASS_THROUGH = new Set(['GET /api/version']);

// ---- DevTools plumbing ---------------------------------------------------------
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
    return;
  }
  if (message.method === 'Fetch.requestPaused') void answer(message.params);
  if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') consoleErrors.push(message.params.args.map((a) => a.value ?? a.description).join(' '));
});
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
function command(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
}
async function answer({ requestId, request }) {
  const url = new URL(request.url);
  const key = `${request.method} ${url.pathname}`;
  if (STUBS[key]) {
    let body = null;
    try { body = request.postData ? JSON.parse(request.postData) : null; } catch { body = request.postData; }
    const [status, json] = STUBS[key](body);
    await command('Fetch.fulfillRequest', {
      requestId,
      responseCode: status,
      responseHeaders: [{ name: 'content-type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(json)).toString('base64'),
    });
  } else if (PASS_THROUGH.has(key)) {
    await command('Fetch.continueRequest', { requestId });
  } else {
    sent.blocked.push(key);
    await command('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
  }
}
async function evaluate(expression) {
  const r = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(expression, label, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(expression)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

await command('Page.enable');
await command('Runtime.enable');
// Headless pages never hold focus otherwise, and a blur that never fires would
// let the "a low price is not raised on blur" check pass without testing it.
await command('Emulation.setFocusEmulationEnabled', { enabled: true });
await command('Fetch.enable', { patterns: [{ urlPattern: `${appOrigin}/api/*`, requestStage: 'Request' }] });

// Page helpers, installed once per load.
const HELPERS = `
  window.__pv = {
    set(selector, value) {
      const el = document.querySelector(selector);
      if (!el) throw new Error('no ' + selector);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    text(selector, scope) {
      const root = scope ? document.querySelector(scope) : document;
      const el = root && root.querySelector(selector);
      return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null;
    },
    click(text, scope) {
      const root = scope ? document.querySelector(scope) : document;
      const b = [...root.querySelectorAll('button')].find((n) => n.textContent.trim() === text && n.offsetParent !== null);
      if (!b) return false;
      b.click();
      return true;
    },
    // Layout problems inside one container: overflow, clipping, overlap.
    layout(scope, clipSelectors) {
      const problems = [];
      const box = document.querySelector(scope);
      if (!box) return ['missing ' + scope];
      const outer = box.getBoundingClientRect();
      if (document.documentElement.scrollWidth > window.innerWidth) problems.push('page scrolls sideways: ' + document.documentElement.scrollWidth + ' > ' + window.innerWidth);
      if (box.scrollWidth > box.clientWidth + 1) problems.push(scope + ' scrolls sideways');
      for (const selector of clipSelectors) {
        for (const el of box.querySelectorAll(selector)) {
          const r = el.getBoundingClientRect();
          if (r.width === 0) continue;
          if (r.left < outer.left - 0.5 || r.right > outer.right + 0.5) problems.push(selector + ' leaves ' + scope);
          if (el.scrollWidth > el.clientWidth + 1) problems.push(selector + ' is clipped');
        }
      }
      return problems;
    },
  };
`;

// ---- The run -----------------------------------------------------------------------
const matrix = [];
const numbers = [];
function record(screen, width, check, ok, detail = '') {
  matrix.push({ screen, width, check, result: ok ? 'pass' : 'FAIL', detail });
  if (!ok) throw new Error(`${screen} @${width}: ${check}${detail ? ` (${detail})` : ''}`);
}

try {
  for (const [width, height, mobile] of [[390, 844, true], [1440, 900, false]]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await command('Page.navigate', { url: 'about:blank' });
    await command('Page.navigate', { url: `${appUrl}?payouts=1` });
    await waitFor("Boolean(document.querySelector('.dash-resume-button'))", 'the stubbed dashboard');
    await evaluate(HELPERS);
    await evaluate("document.fonts.ready.then(() => true)");

    // ===== Dashboard price editor =====
    const D = 'Dashboard editor';
    assert(await evaluate("__pv.click('Edit')"), 'no Edit button on the published test listing');
    const PANEL = `[aria-label$=" controls"]`;
    await waitFor(`Boolean(document.querySelector('${PANEL} input[type=number]'))`, 'the price panel');
    const panelInput = `${PANEL} input[type=number]`;
    record(D, width, 'opens on the stored price', await evaluate(`document.querySelector('${panelInput}').value`) === String(TEST_LISTING_PRICE));
    record(D, width, 'input minimum is $10', await evaluate(`document.querySelector('${panelInput}').min`) === '10');
    record(D, width, 'range hint reads $10 to $399', /\$10 to \$399, whole dollars/.test(await evaluate(`document.querySelector('${PANEL}').textContent`)));

    for (const price of [TEST_LISTING_PRICE, 10, 11, 25, 399]) {
      await evaluate(`__pv.set('${panelInput}', '${price}')`);
      await settle();
      const shown = await evaluate(`__pv.text('.price-earn', '${PANEL}')`);
      numbers.push({ screen: D, width, price: `$${price}`, shows: shown.match(/\$[\d.]+/)?.[0], expected: money(earnedCents(price)) });
      record(D, width, `earnings at $${price}`, shown === earningsText(price), shown);
    }
    const market = await evaluate(`__pv.text('.price-market', '${PANEL}')`);
    record(D, width, 'range of other live 3-essay listings, itself excluded', market === expectedMarket(otherThreeEssayPrices, ESSAYS, true), market);

    for (const [price, message] of [['9', MSG.min], ['12.50', MSG.cents], ['400', MSG.cap]]) {
      const before = sent.listingPrice.length;
      await evaluate(`__pv.set('${panelInput}', '${price}')`);
      await settle();
      record(D, width, `$${price}: shows "${message}" as it is typed`, await evaluate(`__pv.text('[role=alert]', '${PANEL}')`) === message);
      record(D, width, `$${price}: input marked invalid`, await evaluate(`document.querySelector('${panelInput}').getAttribute('aria-invalid')`) === 'true');
      record(D, width, `$${price}: earnings line asks for a valid price`, await evaluate(`__pv.text('.price-earn', '${PANEL}')`) === EMPTY_EARNINGS);
      assert(await evaluate(`__pv.click('Save price', '${PANEL}')`), 'no Save price button');
      await settle(300);
      record(D, width, `$${price}: Save shows "${message}"`, await evaluate(`__pv.text('[role=alert]', '${PANEL}')`) === message);
      record(D, width, `$${price}: nothing sent`, sent.listingPrice.length === before);
    }

    const layoutD = await evaluate(`__pv.layout('${PANEL}', ['.price-earn', '.price-earn-main', '.price-market', 'input'])`);
    record(D, width, 'no overflow or clipped text', layoutD.length === 0, layoutD.join('; '));
    if (shotDir) {
      await evaluate(`document.querySelector('${PANEL}').scrollIntoView({ block: 'center' })`);
      await settle(300);
      const shot = await command('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`${shotDir}/dashboard-${width}.png`, Buffer.from(shot.data, 'base64'));
    }

    await evaluate(`__pv.set('${panelInput}', '50')`);
    await evaluate(`__pv.click('Save price', '${PANEL}')`);
    await waitFor(`!document.querySelector('${PANEL}')`, 'the panel to close after a valid save');
    record(D, width, '$50 saves with exactly 50 (to the stub)', sent.listingPrice.at(-1)?.packagePrice === 50, JSON.stringify(sent.listingPrice.at(-1)));

    // ===== Sell wizard pricing step =====
    const W = 'Sell wizard';
    assert(await evaluate("(document.querySelector('.dash-resume-button').click(), true)"), 'no resume button');
    await waitFor("(() => { const el = document.querySelector('#packagePrice'); return el && el.offsetParent !== null && el.value !== ''; })()", 'the pricing step with a prefilled price');
    await settle(300);

    record(W, width, 'prefills the recommended $76', await evaluate("document.querySelector('#packagePrice').value") === '76');
    record(W, width, 'shows "Recommended: $76"', await evaluate("__pv.text('.price-rec-value')") === 'Recommended: $76');
    record(W, width, 'no "Use" button while the price is the recommendation', await evaluate("!document.querySelector('.price-rec-use')"));
    record(W, width, 'says the recommendation is not a minimum', /A suggestion, not a minimum\. You can charge anything from \$10\./.test(await evaluate("__pv.text('.price-rec .field-hint')")));
    record(W, width, 'input minimum is $10', await evaluate("document.querySelector('#packagePrice').min") === '10');
    const wizardMarket = await evaluate("__pv.text('.price-market', '#packagePriceField')");
    record(W, width, 'range of live 3-essay listings', wizardMarket === expectedMarket(threeEssayPrices, ESSAYS, false), wizardMarket);

    for (const price of [76, 10, 11, 25, 399]) {
      await evaluate(`__pv.set('#packagePrice', '${price}')`);
      await settle();
      const shown = await evaluate("__pv.text('.price-earn', '#packagePriceField')");
      numbers.push({ screen: W, width, price: `$${price}`, shows: shown.match(/\$[\d.]+/)?.[0], expected: money(earnedCents(price)) });
      record(W, width, `earnings at $${price}`, shown === earningsText(price), shown);
      record(W, width, `no error at $${price}`, await evaluate("!document.querySelector('#packagePriceError')"));
    }

    // Below the recommendation is allowed and is never raised back up.
    await evaluate("__pv.set('#packagePrice', '12')");
    const focused = await evaluate("(() => { const el = document.querySelector('#packagePrice'); el.focus(); return document.activeElement === el; })()");
    record(W, width, 'the price box takes focus (so the blur below is real)', focused);
    const blurred = await evaluate("(() => { const el = document.querySelector('#packagePrice'); el.blur(); return document.activeElement !== el; })()");
    record(W, width, 'the price box loses focus', blurred);
    await settle(300);
    record(W, width, '$12 stays $12 after leaving the box', await evaluate("document.querySelector('#packagePrice').value") === '12');
    record(W, width, '"Use $76" appears once the price differs', await evaluate("__pv.text('.price-rec-use')") === 'Use $76');

    const layoutW = await evaluate("__pv.layout('.modal.open, .modal-overlay.open .modal', ['.price-rec', '.price-rec-value', '.price-rec-use', '.price-earn', '.price-earn-main', '.price-market', '#packagePrice'])");
    record(W, width, 'no overflow or clipped text', layoutW.length === 0, layoutW.join('; '));
    const useBox = await evaluate(`(() => {
      const a = document.querySelector('.price-rec-value').getBoundingClientRect();
      const b = document.querySelector('.price-rec-use').getBoundingClientRect();
      return { overlap: !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top), height: b.height };
    })()`);
    record(W, width, '"Use" button clear of the recommendation, at least 24px tall', !useBox.overlap && useBox.height >= 24, JSON.stringify(useBox));
    if (shotDir) {
      await evaluate("document.querySelector('#packagePriceField').scrollIntoView({ block: 'center' })");
      await settle(300);
      const shot = await command('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`${shotDir}/wizard-${width}.png`, Buffer.from(shot.data, 'base64'));
    }

    assert(await evaluate("__pv.click('Use $76')"), 'could not press Use $76');
    await settle();
    record(W, width, '"Use $76" restores $76', await evaluate("document.querySelector('#packagePrice').value") === '76');

    for (const [price, message] of [['9', MSG.min], ['12.50', MSG.cents], ['400', MSG.cap]]) {
      const before = sent.finalize.length;
      await evaluate(`__pv.set('#packagePrice', '${price}')`);
      await settle();
      record(W, width, `$${price}: shows "${message}" as it is typed`, await evaluate("__pv.text('#packagePriceError')") === message);
      record(W, width, `$${price}: input marked invalid`, await evaluate("document.querySelector('#packagePrice').getAttribute('aria-invalid')") === 'true');
      record(W, width, `$${price}: earnings line asks for a valid price`, await evaluate("__pv.text('.price-earn', '#packagePriceField')") === EMPTY_EARNINGS);
      assert(await evaluate("__pv.click('Submit for review')"), 'no Submit for review button');
      await waitFor("Boolean(document.querySelector('.confirm-danger'))", 'the submit confirmation');
      await evaluate("__pv.click('Send for review')");
      await settle(400);
      const errors = await evaluate("[...document.querySelectorAll('.field-error.show')].filter((e) => e.id !== 'packagePriceError' && e.offsetParent !== null).map((e) => e.textContent.trim())");
      record(W, width, `$${price}: Submit is refused with "${message}"`, errors.includes(message), errors.join(' | '));
      record(W, width, `$${price}: nothing submitted`, sent.finalize.length === before);
    }

    // A valid price gets through the form to the submit request, which the
    // stub refuses, so nothing is ever created.
    await evaluate("__pv.set('#packagePrice', '10')");
    await settle();
    await evaluate("__pv.click('Submit for review')");
    await waitFor("Boolean(document.querySelector('.confirm-danger'))", 'the submit confirmation');
    const finalizeBefore = sent.finalize.length;
    await evaluate("__pv.click('Send for review')");
    await waitFor("[...document.querySelectorAll('.field-error.show')].some((e) => /Stubbed by the verifier/.test(e.textContent))", 'the stubbed submit');
    record(W, width, '$10 reaches the submit request (stubbed)', sent.finalize.length === finalizeBefore + 1);
    record(W, width, 'the saved draft carries exactly 10', sent.patch.at(-1)?.state?.packagePrice === 10, JSON.stringify(sent.patch.at(-1)?.state?.packagePrice));
  }

  record('Both', 'all', 'no request left the browser except stubs and plain reads', sent.blocked.length === 0, sent.blocked.join(', '));
  record('Both', 'all', 'no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} finally {
  console.table(matrix);
  if (numbers.length) console.table(numbers);
  socket.close();
}
console.log(`seller pricing browser checks passed (${matrix.length} checks)`);
