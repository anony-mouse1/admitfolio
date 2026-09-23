#!/usr/bin/env node

// Keyboard and mouse checks for the buyer flow, run by hand like the other
// verify-*.mjs scripts. Not in package.json and not a test:* script: it needs a
// dev server and a browser, and test:* is pure.
//
//   npx next dev -p 3000
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
//     --remote-debugging-port=9223 --user-data-dir=/tmp/chrome-admitfolio about:blank
//   node scripts/verify-buyer-flow-a11y.mjs
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

const WIDTHS = [
  { label: '1440', width: 1440, height: 900, mobile: false },
  { label: '390', width: 390, height: 844, mobile: true },
];

const failures = [];
const notes = [];
function check(condition, message) {
  if (condition) notes.push(`  ok    ${message}`);
  else { failures.push(message); notes.push(`  FAIL  ${message}`); }
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

function command(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
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

// A real click at the centre of the element, after scrolling it into view.
// The site scrolls smoothly, so the scroll is instant here and the point is
// measured afterwards, and the element has to be the one actually under it.
async function clickSelector(expression) {
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

/* ---------------------------------------------------------------------------
   1. Unlock on a homepage card
   ------------------------------------------------------------------------- */

for (const width of WIDTHS) {
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

/* ------------------------------------------------------------------------ */

const relevantErrors = consoleErrors.filter((text) => !/Download the React DevTools|\[HMR\]|\[Fast Refresh\]/.test(text));
check(relevantErrors.length === 0, `no console errors${relevantErrors.length ? `: ${relevantErrors.slice(0, 3).join(' | ')}` : ''}`);

socket.close();
await fetch(`http://localhost:${chromePort}/json/close/${target.id}`);

console.log(notes.join('\n'));
if (failures.length) {
  console.log(`\n${failures.length} FAILED`);
  process.exit(1);
}
console.log(`\nall ${notes.length} checks passed`);
