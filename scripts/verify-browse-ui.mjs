#!/usr/bin/env node

// DOM-level regression check for the launched catalogue. Start Next locally
// and Chrome with --remote-debugging-port=9223 before running this script.
//
// The app URL must be localhost, not 127.0.0.1. Next's dev server serves
// /_next/static chunks only to the origin it was started on, so a 127.0.0.1
// page gets 403 on its own JavaScript and the catalogue never hydrates.

const chromePort = process.env.CHROME_DEBUG_PORT || '9223';
const appUrl = process.env.APP_URL || 'http://localhost:3000/';
const target = await fetch(`http://127.0.0.1:${chromePort}/json/new?${encodeURIComponent(appUrl)}`, { method: 'PUT' }).then((response) => response.json());
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
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') consoleErrors.push(message.params.entry.text);
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

async function waitFor(expression, label, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await command('Page.enable');
await command('Runtime.enable');
await command('Log.enable');
await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await command('Page.navigate', { url: `${appUrl}#browse` });
await waitFor("document.querySelectorAll('.public-grid .catalog-card').length >= 20", 'desktop catalogue');

const desktop = await evaluate(`(() => {
  const cards = [...document.querySelectorAll('.public-grid .catalog-card')];
  const rects = cards.map(card => card.getBoundingClientRect());
  const overlaps = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (Math.max(a.left,b.left) < Math.min(a.right,b.right) && Math.max(a.top,b.top) < Math.min(a.bottom,b.bottom)) overlaps.push([i,j]);
  }
  return {
    cards: cards.length,
    overlaps,
    nav: [...document.querySelectorAll('.nav-links a')].map(node => node.textContent.trim()),
    heroHidden: getComputedStyle(document.querySelector('.hero')).display === 'none',
    matcherButton: [...document.querySelectorAll('.nav button')].some(node => node.textContent.includes('Find my matches')),
    titleCount: cards.filter(card => card.querySelector('.ecard-hook')?.textContent.trim()).length,
    overflow: document.documentElement.scrollWidth - innerWidth,
  };
})()`);
assert(desktop.cards === 24, `Expected 24 initial cards, got ${desktop.cards}`);
assert(desktop.overlaps.length === 0, `Desktop cards overlap: ${JSON.stringify(desktop.overlaps)}`);
assert(desktop.nav.join('|') === 'Browse essays|Featured|Sell your essays', `Unexpected nav: ${desktop.nav.join('|')}`);
assert(desktop.heroHidden, 'Hero is still visible in Browse view');
assert(desktop.matcherButton, 'Find my matches button is missing');
assert(desktop.titleCount === desktop.cards, 'A visible card is missing its title');
assert(desktop.overflow <= 1, `Desktop page overflows by ${desktop.overflow}px`);

await evaluate("[...document.querySelectorAll('.nav button')].find(node => node.textContent.includes('Find my matches')).click()");
await waitFor("Boolean(document.querySelector('.mf-panel'))", 'matcher panel');
await evaluate("document.querySelector('.mf-chip').click()");
await waitFor("document.querySelectorAll('.mf-res').length > 0", 'matcher results');
const matcherResults = await evaluate("document.querySelectorAll('.mf-res').length");
assert(matcherResults > 0, 'Matcher returned no results');
await evaluate("document.querySelector('.mf-mini').click()");
await waitFor("document.querySelector('.pub-count')?.textContent.includes('matches for')", 'matched grid');

await evaluate("document.querySelector('.logo').click()");
await waitFor("getComputedStyle(document.querySelector('.hero')).display !== 'none' && document.querySelectorAll('.home-featured-grid .catalog-card').length === 6", 'home featured view');
const home = await evaluate(`({
  featured: document.querySelectorAll('.home-featured-grid .catalog-card').length,
  seeAll: document.querySelector('.home-see-more')?.textContent.trim(),
  schools: [...document.querySelectorAll('.home-featured-grid .ecard-school')].map(node => node.textContent.trim()),
})`);
assert(home.featured === 6, `Expected six featured cards, got ${home.featured}`);
assert(home.seeAll === 'See all essays', 'See all essays link is missing');

await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await command('Page.navigate', { url: `${appUrl}#browse` });
await command('Page.reload', { ignoreCache: true });
await new Promise((resolve) => setTimeout(resolve, 3000));
await waitFor("document.querySelectorAll('.public-grid .catalog-card').length > 0", 'mobile catalogue');
const mobile = await evaluate(`(() => {
  const cards = [...document.querySelectorAll('.public-grid .catalog-card')];
  const rects = cards.map(card => card.getBoundingClientRect());
  return {
    cards: cards.length,
    oneColumn: rects.every((rect,index) => index === 0 || Math.abs(rect.left - rects[0].left) < 1),
    overflow: document.documentElement.scrollWidth - innerWidth,
    buttonVisible: (() => { const button = [...document.querySelectorAll('.nav button')].find(node => node.textContent.includes('Find my matches')); return Boolean(button && button.getBoundingClientRect().width); })(),
  };
})()`);
assert(mobile.cards > 0, 'Expected at least one matched mobile card');
assert(mobile.oneColumn, 'Mobile cards are not one column');
assert(mobile.overflow <= 1, `Mobile page overflows by ${mobile.overflow}px`);
assert(mobile.buttonVisible, 'Mobile matcher button is not visible');
assert(consoleErrors.length === 0, `Browser errors: ${consoleErrors.join('; ')}`);

console.log(JSON.stringify({ desktop, matcherResults, home, mobile, consoleErrors }, null, 2));
socket.close();
