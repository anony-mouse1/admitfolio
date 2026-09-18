#!/usr/bin/env node

// Measures the listing sheet's "What you get" panel on the real app, at real
// viewports, against real listings.
//
// NOT in package.json: it needs a running server and a browser, and every
// `test:*` script is pure. Run it against a production build:
//
//   npx next build && npx next start -p 3100
//   BASE=http://localhost:3100 node scripts/verify-listing-value-panel.mjs
//
// The question it exists to answer is the one #88 got wrong: does the Unlock
// button stay above the fold on a phone. The panel is deliberately never
// collapsed, so it adds height to the sheet ahead of the button, and the
// longest listing in the catalogue carries 18 essays. A button below 844 on an
// iPhone viewport is a regression, not a detail.
//
// Reads only. It never clicks Unlock and never reaches Stripe.

import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://localhost:3100';
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

// Real listing ids, chosen by a read-only query for the shapes that stress the
// panel. See the coverage matrix in the pull request.
const CASES = [
  { name: 'four identical PIQs, one row, no college',  id: 'cmrtpuz9w0006g40k0bh7t189', essays: 4,  groups: 1 },
  { name: 'most rows in the catalogue',                 id: 'cmsic67i10004tti84ky8zcme', essays: 11, groups: 8 },
  { name: 'most essays in the catalogue',               id: 'cmt2fo0fp0002mfb4wzc6kbwk', essays: 18, groups: 7 },
  { name: 'single essay',                               id: 'cmru21tvl00026w4i97gv94jx', essays: 1,  groups: 1 },
  { name: 'longest seller question, 1,201 chars',       id: 'cmrudzb520002g920sowmx0l7', essays: 2,  groups: 2 },
  { name: 'college known, three rows',                  id: 'cmrywmkwn0002icgsma9zo5nt', essays: 3,  groups: 3 },
];

/* ------------------------------ CDP plumbing ------------------------------ */

let nextId = 1;
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(msg.error.message));
      else entry.resolve(msg.result);
    };
    ws.onerror = () => reject(new Error(`cannot reach ${url}`));
    ws.onopen = () => resolve({
      send(method, params = {}, sessionId) {
        const id = nextId++;
        return new Promise((res, rej) => {
          pending.set(id, { resolve: res, reject: rej });
          ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
      },
      close: () => ws.close(),
    });
  });
}

async function evaluate(cdp, session, expression) {
  const { result, exceptionDetails } = await cdp.send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    session,
  );
  if (exceptionDetails) throw new Error(exceptionDetails.text || 'evaluate threw');
  return result.value;
}

/* ------------------------------ measurement ------------------------------ */

// The measurement runs with script execution disabled, so what is measured is
// the server-rendered document before hydration. That is what a phone on a slow
// connection looks at, and it is the state #88 shipped a broken button in.
async function measure(cdp, session, url, viewport, { hydrated }) {
  await cdp.send('Emulation.setScriptExecutionDisabled', { value: !hydrated }, session);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    ...viewport, deviceScaleFactor: 2, mobile: viewport.width < 700,
  }, session);
  await cdp.send('Page.navigate', { url }, session);
  // Wait for the document rather than for the network: with scripts off there
  // is nothing else coming.
  for (let i = 0; i < 100; i += 1) {
    const state = await evaluate(cdp, session, 'document.readyState');
    if (state === 'complete') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return evaluate(cdp, session, `(() => {
    const q = (s) => document.querySelector(s);
    const sheet = q('.sheet');
    const btn = q('.d-unlock-btn');
    const panel = q('.d-value');
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) };
    };
    return {
      hasSheet: !!sheet,
      unlock: rect(btn),
      panel: rect(panel),
      // Distance from the top of the SHEET, which is what the reader scrolls,
      // not from the viewport, which the overlay offsets.
      unlockFromSheetTop: btn && sheet
        ? Math.round(btn.getBoundingClientRect().top - sheet.getBoundingClientRect().top)
        : null,
      rows: document.querySelectorAll('.d-value-list li').length,
      metas: [...document.querySelectorAll('.d-value-meta')].map((el) => el.textContent.trim()),
      included: document.querySelectorAll('.d-value-inc li').length,
      headCount: q('.d-value-count') ? q('.d-value-count').textContent.trim() : null,
      forLine: q('.d-value-for') ? q('.d-value-for').textContent.replace(/\\s+/g, ' ').trim() : null,
      perEssay: q('.d-price small') ? q('.d-price small').textContent.trim() : null,
      // The old surface. It must be gone, not merely hidden.
      legacyDetails: document.querySelectorAll('.d-essay-details').length,
      legacyList: document.querySelectorAll('.d-essays').length,
      // Any word count anywhere in the panel. Null on every row today.
      wordsText: [...document.querySelectorAll('.d-value-meta')]
        .map((el) => el.textContent).filter((t) => /word/i.test(t)),
      // Horizontal overflow of the sheet, the other thing 390 breaks.
      docScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      sheetScrollWidth: sheet ? sheet.scrollWidth : null,
      sheetClientWidth: sheet ? sheet.clientWidth : null,
      // Does the panel's own text clip?
      clipped: [...document.querySelectorAll('.d-value-label, .d-value-count, .d-value-for, .d-value-inc span')]
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent.trim().slice(0, 40)),
    };
  })()`);
}

/* --------------------------------- run --------------------------------- */

const targets = await (await fetch('http://localhost:9222/json/list')).json();
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('no page target; start Chrome with --remote-debugging-port=9222');
const cdp = await connect(page.webSocketDebuggerUrl);
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.id, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
await cdp.send('Runtime.enable', {}, sessionId);

// Which collection page carries each listing. Resolved once, against the JSON
// API, so the ids above do not also have to hardcode a slug.
const collections = JSON.parse(process.env.COLLECTIONS || '{}');

let checks = 0;
let failures = 0;
const rows = [];
const check = (label, fn) => {
  try {
    fn();
    checks += 1;
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${label}: ${error.message}`);
  }
};

for (const testCase of CASES) {
  const slug = collections[testCase.id];
  if (!slug) {
    console.error(`  SKIP ${testCase.name}: no collection carries ${testCase.id}`);
    continue;
  }
  const url = `${BASE}/essays/${slug}?listing=${testCase.id}`;
  for (const [vpName, viewport] of [['390', PHONE], ['1440', DESKTOP]]) {
    for (const hydrated of [false, true]) {
      const m = await measure(cdp, sessionId, url, viewport, { hydrated });
      rows.push({ case: testCase.name, vp: vpName, hydrated, ...m });
      const tag = `${testCase.name} @ ${vpName} ${hydrated ? 'hydrated' : 'first paint'}`;

      check(`${tag}: sheet renders`, () => assert.ok(m.hasSheet));
      check(`${tag}: panel renders`, () => assert.ok(m.panel, 'no .d-value'));
      check(`${tag}: one row per group`, () => assert.equal(m.rows, testCase.groups));
      check(`${tag}: three included lines`, () => assert.equal(m.included, 3));
      check(`${tag}: the old <details> is gone`, () => {
        assert.equal(m.legacyDetails, 0, '.d-essay-details still present');
        assert.equal(m.legacyList, 0, '.d-essays still present');
      });
      check(`${tag}: panel sits above the Unlock button`, () => {
        assert.ok(m.panel.bottom <= m.unlock.top, `panel bottom ${m.panel.bottom} > unlock top ${m.unlock.top}`);
      });
      check(`${tag}: no word count, every row is null today`, () => {
        assert.deepEqual(m.wordsText, []);
      });
      check(`${tag}: single-row listings print no per-row count`, () => {
        if (testCase.groups === 1) assert.deepEqual(m.metas, []);
      });
      check(`${tag}: per-essay price only on multi-essay listings`, () => {
        if (testCase.essays === 1) assert.equal(m.perEssay, null);
        else assert.match(m.perEssay || '', /^\$\d+ an essay$/);
      });
      check(`${tag}: no horizontal overflow`, () => {
        assert.ok(m.docScrollWidth <= m.innerWidth, `${m.docScrollWidth} > ${m.innerWidth}`);
        assert.ok(m.sheetScrollWidth <= m.sheetClientWidth + 1, `sheet ${m.sheetScrollWidth} > ${m.sheetClientWidth}`);
      });
      check(`${tag}: no clipped panel text`, () => assert.deepEqual(m.clipped, []));

      // The one that matters. A phone viewport is 844 tall.
      if (vpName === '390') {
        check(`${tag}: UNLOCK ABOVE THE FOLD`, () => {
          assert.ok(m.unlock.top < PHONE.height, `unlock button at y=${m.unlock.top}, below the ${PHONE.height} fold`);
        });
      }
    }
  }
}

console.log('');
console.log('case                                     vp    state        panel h  unlock y  rows');
for (const r of rows) {
  console.log(
    `${r.case.padEnd(40)} ${r.vp.padEnd(5)} ${(r.hydrated ? 'hydrated' : 'first paint').padEnd(12)} ` +
    `${String(r.panel?.height ?? '-').padStart(7)}  ${String(r.unlock?.top ?? '-').padStart(8)}  ${String(r.rows).padStart(4)}`,
  );
}
console.log('');
console.log(`${checks} checks passed, ${failures} failed`);
cdp.close();
process.exitCode = failures ? 1 : 0;
