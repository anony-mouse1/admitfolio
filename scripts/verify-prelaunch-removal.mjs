#!/usr/bin/env node

// DOM-level check that the pre-launch waitlist surfaces are gone from the
// homepage and that removing them broke nothing at either width. Start Next
// locally and Chrome with --remote-debugging-port=9223 before running this.
//
// The app URL must be localhost, not 127.0.0.1. Next serves /_next/static
// chunks only to the origin it was started on, so a 127.0.0.1 page gets 403 on
// its own JavaScript and the catalogue never hydrates.
//
// Two things are checked that a unit test cannot see. First, that the strings
// are absent from the served document and not merely hidden by CSS, which is
// the state they were in before: a crawler reads the document. Second, that the
// page still lays out at 390 and 1440 once a fixed-position element and a
// modal overlay have been deleted from the tree.

const chromePort = process.env.CHROME_DEBUG_PORT || '9223';
const appUrl = process.env.APP_URL || 'http://localhost:3000/';
const target = await fetch(`http://127.0.0.1:${chromePort}/json/new?${encodeURIComponent(appUrl)}`, { method: 'PUT' }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
const consoleErrors = [];

// Vercel Analytics and Speed Insights are injected by app/layout.tsx and their
// scripts are served by the Vercel platform, not by Next, so off-platform they
// 404 and the 404 body fails the MIME check. Expected everywhere but Vercel.
function record(text, url = '') {
  const where = `${text} ${url}`;
  if (where.includes('/_vercel/insights/') || where.includes('/_vercel/speed-insights/')) return;
  consoleErrors.push(url ? `${text} (${url})` : text);
}

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject, method } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(`${method}: ${message.error.message}`));
    else resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') record(message.params.exceptionDetails.text);
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') record(message.params.entry.text, message.params.entry.url);
});

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

function command(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, method });
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
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Every string and selector the removed surfaces put on the page. `Coming soon`
// is deliberately included: it also appears in the pre-launch branch of the
// featured section, so this doubles as a check that the branch is still dead
// code on a launched build.
const GONE_TEXT = [
  'Coming soon',
  'Be first to read the essays that got them in',
  'Join the waitlist',
  'Notify me when essays drop',
];
const GONE_SELECTORS = ['.wl-fab', '#waitlistModal', '.wl-msg', '.wl-dot', '.wl-fab-pulse'];

// Kept in step with HOME_FEATURED_COUNT in app/page.tsx. The homepage shows one
// row of featured essays under the collections band, not the six the memo picks.
const HOME_FEATURED_COUNT = 3;

const absenceProbe = `(() => {
  const html = document.documentElement.outerHTML;
  return {
    text: ${JSON.stringify(GONE_TEXT)}.filter((needle) => html.includes(needle)),
    selectors: ${JSON.stringify(GONE_SELECTORS)}.filter((selector) => document.querySelector(selector)),
    localStorageKey: (() => { try { return localStorage.getItem('admitly_waitlist_joined'); } catch { return null; } })(),
  };
})()`;

// The raw document, before any JavaScript runs. This is what a crawler sees and
// it is where both strings used to sit.
const served = await fetch(appUrl).then((response) => response.text());
const servedHits = GONE_TEXT.filter((needle) => served.includes(needle));
assert(servedHits.length === 0, `Served HTML still contains: ${servedHits.join(', ')}`);
assert(!served.includes('wl-fab') && !served.includes('waitlistModal'), 'Served HTML still contains waitlist markup');

await command('Page.enable');
await command('Runtime.enable');
await command('Log.enable');

const widths = [
  { label: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
  { label: 'mobile', width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
];
const results = {};

for (const viewport of widths) {
  await command('Emulation.setDeviceMetricsOverride', viewport);
  // Load through about:blank so the second viewport gets a real document at the
  // new width rather than a resize of the first one. Page.navigate resolves
  // before the new document commits, so the wait below is what synchronises.
  await command('Page.navigate', { url: 'about:blank' });
  await new Promise((resolve) => setTimeout(resolve, 200));
  await command('Page.navigate', { url: appUrl });
  await waitFor(`document.querySelectorAll('.home-featured-grid .catalog-card').length === ${HOME_FEATURED_COUNT}`, `${viewport.label} featured grid`);

  const absent = await evaluate(absenceProbe);
  assert(absent.text.length === 0, `${viewport.label}: hydrated DOM still contains ${absent.text.join(', ')}`);
  assert(absent.selectors.length === 0, `${viewport.label}: hydrated DOM still contains ${absent.selectors.join(', ')}`);

  // The popup used to fire on a 15s timer past 450px of scroll. Scroll past it,
  // wait the timer out, and assert nothing appears and no overlay opens.
  await evaluate('window.scrollTo(0, 900)');
  await new Promise((resolve) => setTimeout(resolve, 16000));
  const afterScroll = await evaluate(`(() => {
    const probe = ${absenceProbe};
    return {
      ...probe,
      openOverlays: document.querySelectorAll('.modal-overlay.open').length,
      bodyOverflow: document.body.style.overflow,
    };
  })()`);
  assert(afterScroll.text.length === 0, `${viewport.label}: popup copy appeared after scrolling`);
  assert(afterScroll.selectors.length === 0, `${viewport.label}: popup markup appeared after scrolling`);
  assert(afterScroll.openOverlays === 0, `${viewport.label}: an overlay opened on its own`);
  assert(afterScroll.bodyOverflow === '', `${viewport.label}: body scroll left locked at "${afterScroll.bodyOverflow}"`);

  // The page still renders. The fixed button sat above the fold edge, so the
  // overflow and clipping checks are the ones worth repeating after deleting it.
  await evaluate('window.scrollTo(0, 0)');
  const layout = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.home-featured-grid .catalog-card')];
    const rects = cards.map((card) => card.getBoundingClientRect());
    const overlaps = [];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (Math.max(a.left, b.left) < Math.min(a.right, b.right) && Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom)) overlaps.push([i, j]);
    }
    return {
      featured: cards.length,
      titled: cards.filter((card) => card.querySelector('.ecard-hook')?.textContent.trim()).length,
      overlaps,
      overflow: document.documentElement.scrollWidth - innerWidth,
      heroVisible: getComputedStyle(document.querySelector('.hero')).display !== 'none',
      seeAll: document.querySelector('.home-featured .home-see-more')?.textContent.trim() || '',
      collectionsSeeAll: document.querySelector('.home-collections .home-see-more')?.textContent.trim() || '',
      footerLinks: [...document.querySelectorAll('footer a')].map((node) => node.getAttribute('href')).filter((href) => href && !href.startsWith('#')),
      fixedElements: [...document.body.querySelectorAll('*')].filter((node) => getComputedStyle(node).position === 'fixed' && node.getBoundingClientRect().width > 0).length,
    };
  })()`);
  assert(layout.featured === HOME_FEATURED_COUNT, `${viewport.label}: expected ${HOME_FEATURED_COUNT} featured cards, got ${layout.featured}`);
  assert(layout.titled === layout.featured, `${viewport.label}: a featured card is missing its hook`);
  assert(layout.overlaps.length === 0, `${viewport.label}: featured cards overlap: ${JSON.stringify(layout.overlaps)}`);
  assert(layout.overflow <= 1, `${viewport.label}: page overflows by ${layout.overflow}px`);
  assert(layout.heroVisible, `${viewport.label}: hero is not visible on the home view`);
  assert(layout.seeAll === 'See all essays', `${viewport.label}: See all essays link is missing`);
  assert(layout.collectionsSeeAll === 'See all collections', `${viewport.label}: See all collections link is missing`);
  assert(layout.footerLinks.includes('/essays') && layout.footerLinks.includes('/guides'), `${viewport.label}: crawlable footer links are missing`);

  // Escape used to close the waitlist modal last in the chain. Removing that
  // branch must not have broken the branches above it.
  await evaluate("document.querySelector('.home-featured-grid .catalog-card').click()");
  await waitFor("Boolean(document.querySelector('.sheet'))", `${viewport.label} detail sheet`);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await waitFor("!document.querySelector('.sheet') && document.body.style.overflow === ''", `${viewport.label} sheet closed by Escape`);

  results[viewport.label] = layout;
}

assert(consoleErrors.length === 0, `Browser errors: ${consoleErrors.join('; ')}`);

console.log(JSON.stringify({ servedBytes: served.length, ...results, consoleErrors }, null, 2));
console.log('pre-launch waitlist removal verified');
socket.close();
