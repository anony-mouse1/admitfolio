#!/usr/bin/env node

// Keyboard and mouse checks for the buyer flow, run by hand like the other
// verify-*.mjs scripts. Not in package.json and not a test:* script: it needs a
// dev server and a browser, and test:* is pure.
//
//   npx next dev -p 3000
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
//     --disable-gpu --disable-gpu-vsync --disable-frame-rate-limit \
//     --disable-background-timer-throttling --disable-renderer-backgrounding \
//     --remote-debugging-port=9223 --user-data-dir=/tmp/chrome-admitfolio about:blank
//   node scripts/verify-buyer-flow-a11y.mjs
//
// The extra flags matter on a Mac. Without them headless Chrome tied its frames
// to the display, and with the screen asleep it stopped answering partway
// through a run, at 0% CPU.
//
// ONLY=1 or ONLY=2 runs one numbered section below, and WIDTH=1440 or
// WIDTH=390 one width, instead of all of them. In section 2, CASE="mouse,
// collection page" (or any part of a case name) runs only the matching cases.
//
// The app URL must be localhost, not 127.0.0.1: Next's dev server serves
// /_next/static only to the origin it was started on.
//
// Every key press and click is a real input event sent through the DevTools
// protocol, not element.click(), so focus order, default actions and event
// bubbling are the browser's own.
//
// NOTHING HERE STARTS A PAYMENT. Checkout is opened and closed, but Continue to
// payment is never pressed, so /api/checkout is never called and no Stripe
// session is created. It reads listings through /api/listings and writes
// nothing.

const chromePort = process.env.CHROME_DEBUG_PORT || '9223';
const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const collectionSlug = process.env.COLLECTION_SLUG || 'common-app-personal-statement';
const only = process.env.ONLY || '';
const runs = (section) => !only || only === section;

const WIDTHS = [
  { label: '1440', width: 1440, height: 900, mobile: false },
  { label: '390', width: 390, height: 844, mobile: true },
].filter((w) => !process.env.WIDTH || w.label === process.env.WIDTH);

const failures = [];
const notes = [];
let lastCheck = 'none yet';
function check(condition, message) {
  lastCheck = message;
  if (condition) notes.push(`  ok    ${message}`);
  else {
    failures.push(message);
    notes.push(`  FAIL  ${message}`);
    // Printed as it happens too, so a later timeout cannot hide it.
    console.log(`  FAIL  ${message}`);
  }
}

const target = await (await fetch(`http://localhost:${chromePort}/json/new?about:blank`, { method: 'PUT' })).json();
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

// A browser that stops answering has to stop the run loudly. Without a
// timeout the run just hangs, and the checks it never reached are easy to
// mistake for checks that passed.
function command(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`the browser did not answer ${method} within 30s`));
    }, 30000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, label, timeoutMs = 30000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try { last = await evaluate(expression); } catch (error) { last = `threw: ${error.message}`; }
    if (last === true) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${label} (last: ${JSON.stringify(last)})`);
}

const settle = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

const KEYS = {
  Tab: { code: 'Tab', keyCode: 9 },
  Enter: { code: 'Enter', keyCode: 13, text: '\r' },
  ' ': { code: 'Space', keyCode: 32, text: ' ' },
  Escape: { code: 'Escape', keyCode: 27 },
};

async function press(key, { shift = false } = {}) {
  const { code, keyCode, text } = KEYS[key];
  const base = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers: shift ? 8 : 0 };
  await command('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(text ? { text } : {}) });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await settle(120);
}

// The sheet and checkout slide in, and a click measured mid-slide misses.
// Only their own animations count: the page behind has loops that never end.
async function waitForStill() {
  await waitFor(`(() => {
    const running = document.getAnimations()
      .filter((a) => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.buy-overlay, .ov'))
      .filter((a) => a.effect.getTiming().iterations !== Infinity && a.playState === 'running');
    return running.length === 0 || running.map((a) => a.animationName || a.transitionProperty).join(', ');
  })()`, 'sheet and checkout animations to finish');
}

// A real click at the centre of the element, after scrolling it into view.
// The site scrolls smoothly, so the scroll is instant here and the point is
// measured afterwards, and the element has to be the one actually under it.
async function clickSelector(expression) {
  await waitForStill();
  const point = await evaluate(`(() => {
    const el = ${expression};
    if (!el) return null;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, hit: !!hit && (hit === el || el.contains(hit)) };
  })()`);
  if (!point) throw new Error(`nothing to click: ${expression}`);
  if (!point.hit) throw new Error(`something else is on top of ${expression}`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await command('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
  }
  await settle(300);
}

const STATE = `({
  checkoutOpen: !!document.querySelector('.buy-overlay.open'),
  sheetOpen: !!document.querySelector('.ov'),
  search: location.search,
})`;

async function load(path, width) {
  await command('Emulation.setDeviceMetricsOverride', {
    width: width.width, height: width.height, deviceScaleFactor: 1, mobile: width.mobile,
  });
  await command('Page.navigate', { url: `${appUrl}${path}` });
  await waitFor(`document.readyState === 'complete'`, `${path} to load`);
}

async function loadHomepage(width) {
  await load('/', width);
  await waitFor(`document.querySelectorAll('.catalog-card .ecard-unlock').length >= 3`, 'homepage cards');
  await settle(400);
}

await command('Runtime.enable');
await command('Log.enable');
await command('Page.enable');
// A headless tab that is not in front has its animations paused, so the sheet
// and checkout never finish sliding in. Focus emulation keeps :focus-visible
// and focus events behaving as they do in a window the visitor is using.
await command('Page.bringToFront');
await command('Emulation.setFocusEmulationEnabled', { enabled: true });

async function runChecks() {
  /* ---------------------------------------------------------------------------
     1. Unlock on a homepage card
     ------------------------------------------------------------------------- */

  for (const width of runs('1') ? WIDTHS : []) {
    const at = `@${width.label}`;
    await loadHomepage(width);

    const shape = await evaluate(`(() => {
      const unlocks = [...document.querySelectorAll('.catalog-card .ecard-unlock')];
      return {
        count: unlocks.length,
        buttons: unlocks.filter((u) => u.tagName === 'BUTTON' && u.type === 'button').length,
        tabbable: unlocks.filter((u) => u.tabIndex === 0).length,
      };
    })()`);
    check(shape.count > 0 && shape.buttons === shape.count, `${at} every homepage Unlock is a type=button button (${shape.buttons}/${shape.count})`);
    check(shape.tabbable === shape.count, `${at} every homepage Unlock is in the tab order (${shape.tabbable}/${shape.count})`);

    // Keyboard: Tab from the card lands on its own Unlock, and Enter there opens
    // checkout without also opening the sheet.
    for (const key of ['Enter', ' ']) {
      const name = key === ' ' ? 'Space' : key;
      await loadHomepage(width);
      await evaluate(`document.querySelector('.catalog-card').focus()`);
      await press('Tab');
      const landed = await evaluate(`document.activeElement === document.querySelector('.catalog-card .ecard-unlock')`);
      check(landed, `${at} Tab from a card reaches that card's Unlock`);
      const ring = await evaluate(`(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineOffset; })()`);
      check(ring === 'solid 3px 3px', `${at} the focused Unlock shows the 3px ring with a gap (${ring})`);
      await press(key);
      const state = await evaluate(STATE);
      check(state.checkoutOpen, `${at} ${name} on Unlock opens checkout`);
      check(!state.sheetOpen && !state.search.includes('listing='), `${at} ${name} on Unlock does not also open the card behind it`);
    }

    // The card itself still opens the sheet from the keyboard.
    await loadHomepage(width);
    await evaluate(`document.querySelector('.catalog-card').focus()`);
    await press('Enter');
    let state = await evaluate(STATE);
    check(state.sheetOpen && !state.checkoutOpen, `${at} Enter on the card still opens the listing, not checkout`);

    // Mouse: Unlock opens checkout only, the card body opens the sheet only.
    await loadHomepage(width);
    await clickSelector(`document.querySelector('.catalog-card .ecard-unlock')`);
    state = await evaluate(STATE);
    check(state.checkoutOpen && !state.sheetOpen, `${at} clicking Unlock opens checkout and not the listing`);

    await loadHomepage(width);
    await clickSelector(`document.querySelector('.catalog-card .ecard-hook, .catalog-card .ecard-head')`);
    state = await evaluate(STATE);
    check(state.sheetOpen && !state.checkoutOpen, `${at} clicking the card body opens the listing, not checkout`);
  }

  /* ---------------------------------------------------------------------------
     2. The listing sheet takes focus
     ------------------------------------------------------------------------- */

  const IN_SHEET = `(() => {
    const a = document.activeElement;
    const ov = document.querySelector('.ov');
    return {
      inside: !!ov && !!a && ov.contains(a),
      onSheet: a === ov,
      unlock: !!a && a.classList.contains('d-unlock-btn'),
      label: a ? a.tagName.toLowerCase() + '.' + String(a.className).split(' ')[0] + ' ' + (a.textContent || '').trim().slice(0, 24) : 'none',
    };
  })()`;

  const SHEET_PAGES = [
    { name: 'homepage', load: loadHomepage, card: `document.querySelector('.catalog-card')` },
    {
      name: 'collection page',
      load: async (width) => {
        await load(`/essays/${collectionSlug}`, width);
        await waitFor(`document.querySelectorAll('a.ecard-link').length >= 1`, 'collection cards');
        await settle(800);
      },
      card: `document.querySelector('a.ecard-link')`,
    },
  ];

  for (const width of runs('2') ? WIDTHS : []) {
    const at = `@${width.label}`;
    for (const page of SHEET_PAGES) {
      for (const mode of ['keyboard', 'mouse']) {
        const how = `${at} ${mode}, ${page.name}:`;
        if (process.env.CASE && !how.includes(process.env.CASE)) continue;
        await page.load(width);
        await evaluate(`(window.__card = ${page.card}, true)`);
        if (mode === 'keyboard') {
          await evaluate(`window.__card.focus()`);
          await press('Enter');
        } else {
          await clickSelector(`window.__card.querySelector('.ecard-hook, .ecard-head')`);
        }
        await waitFor(`!!document.querySelector('.ov .d-unlock-btn')`, 'the listing sheet');
        await waitForStill();

        const opened = await evaluate(IN_SHEET);
        check(opened.inside, `${how} focus moves into the sheet when it opens (on ${opened.label})`);

        // Tab reaches the sheet's own Unlock, and every stop on the way is in the sheet.
        const stops = await evaluate(`[...document.querySelectorAll('.ov a[href], .ov button')].filter((el) => el.getClientRects().length > 0).length`);
        let reached = false;
        const path = [];
        for (let i = 0; i < stops + 1 && !reached; i++) {
          await press('Tab');
          const w = await evaluate(IN_SHEET);
          path.push(w);
          reached = w.unlock;
        }
        check(reached, `${how} Tab reaches the sheet's Unlock (after ${path.length} presses)`);
        check(path.every((w) => w.inside), `${how} every Tab stop on the way is inside the sheet`);
        const ring = await evaluate(`(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineOffset; })()`);
        check(ring === 'solid 3px 3px', `${how} the sheet's Unlock shows the 3px ring with a gap (${ring})`);

        // Two full laps in each direction never leave the sheet.
        for (const shift of [false, true]) {
          const lap = [];
          for (let i = 0; i < stops * 2 + 1; i++) {
            await press('Tab', { shift });
            lap.push(await evaluate(IN_SHEET));
          }
          const escaped = lap.find((w) => !w.inside);
          check(!escaped, `${how} ${shift ? 'Shift+Tab' : 'Tab'} stays inside the sheet for two laps${escaped ? ` (reached ${escaped.label})` : ''}`);
        }

        // Unlock from the sheet by keyboard, close checkout, and land back on Unlock.
        if (mode === 'keyboard') {
          await evaluate(`document.querySelector('.ov .d-unlock-btn').focus()`);
          await press('Enter');
          await waitFor(`!!document.querySelector('.buy-overlay.open')`, 'checkout to open');
          await waitForStill();
          await press('Escape');
          await waitFor(`!document.querySelector('.buy-overlay.open')`, 'checkout to close');
          await settle(400);
          const back = await evaluate(IN_SHEET);
          check(back.unlock, `${how} closing checkout puts focus back on the sheet's Unlock (on ${back.label})`);
        }

        // Closing the sheet hands focus back to the card that opened it.
        if (mode === 'keyboard') await press('Escape');
        else await clickSelector(`[...document.querySelectorAll('.ov .sheet-x')].find((el) => el.getClientRects().length > 0)`);
        await waitFor(`!document.querySelector('.ov')`, 'the sheet to close');
        await settle(300);
        check(await evaluate(`document.activeElement === window.__card`), `${how} closing the sheet returns focus to the card`);
      }
    }
  }

  // Nothing above may have started a payment.
  check(
    (await evaluate(`performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/checkout')).length`)) === 0,
    'no request reached /api/checkout, so no Stripe session was created',
  );
}

// A run that stops early says so, and says where. It never reads as a pass.
let stoppedBy = null;
let stoppedAfter = '';
try {
  await runChecks();
} catch (error) {
  stoppedBy = error;
  stoppedAfter = lastCheck;
}

/* ------------------------------------------------------------------------ */

const relevantErrors = consoleErrors.filter((text) => !/Download the React DevTools|\[HMR\]|\[Fast Refresh\]/.test(text));
check(relevantErrors.length === 0, `no console errors${relevantErrors.length ? `: ${relevantErrors.slice(0, 3).join(' | ')}` : ''}`);

socket.close();
await fetch(`http://localhost:${chromePort}/json/close/${target.id}`, { signal: AbortSignal.timeout(5000) }).catch(() => {});

console.log(notes.join('\n'));
if (stoppedBy) {
  console.log(`\nINCOMPLETE: stopped after "${stoppedAfter}"`);
  console.log(`  by: ${stoppedBy.message}`);
  console.log(`  ${notes.length} checks ran, ${failures.length} failed. Every check after that point did not run.`);
  process.exit(2);
}
if (failures.length) {
  console.log(`\n${failures.length} FAILED`);
  process.exit(1);
}
console.log(`\nall ${notes.length} checks passed`);
