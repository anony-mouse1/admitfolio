#!/usr/bin/env node

// DOM-level check that each guide's closing call to action points where it
// should, and that swapping the destination did not disturb the block it sits
// in. Start the app locally and Chrome with --remote-debugging-port=9223
// before running this script:
//
//   npx next dev -p 3000
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
//     --remote-debugging-port=9223 --user-data-dir=/tmp/chrome-admitfolio about:blank
//   node scripts/verify-guide-collection-links.mjs
//
// APP_URL overrides the origin, so the same script runs against `npx next
// start` on another port. Never `npm run build`; it applies migrations.
//
// The app URL must be localhost, not 127.0.0.1. Next serves /_next/static
// chunks only to the origin it was started on, so a 127.0.0.1 page gets 403 on
// its own JavaScript and nothing hydrates.
//
// It reads the public catalogue and navigates. It never opens checkout and it
// writes nothing.

const chromePort = process.env.CHROME_DEBUG_PORT || '9223';
const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

// The pairing under test, written out rather than imported, so this script
// fails when lib/collections.ts changes rather than agreeing with it silently.
const PAIRED = {
  'uc-piq-examples': '/essays/uc-personal-insight-questions',
  'common-app-essay-examples': '/essays/common-app-personal-statement',
  'common-app-essay-word-count': '/essays/common-app-personal-statement',
};
// Deliberately still pointing at the homepage: no collection is about what
// these are about. See the comment on GUIDE_COLLECTIONS in lib/collections.ts.
const UNPAIRED = [
  'how-to-take-inspiration-from-college-essays',
  'how-to-start-a-college-essay',
  'college-essay-format',
  'why-this-college-essay-examples',
];
const WIDTHS = [
  { label: '1440', width: 1440, height: 900, mobile: false },
  { label: '390', width: 390, height: 844, mobile: true },
];

const target = await fetch(`http://127.0.0.1:${chromePort}/json/new?${encodeURIComponent(`${appUrl}/guides`)}`, { method: 'PUT' })
  .then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
let consoleErrors = [];

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

// Vercel Analytics and Speed Insights inject script tags whose endpoints only
// exist on Vercel, so a local server answers both with a 404 that Chrome then
// reports twice: once for the fetch and once for the MIME type. Nothing to do
// with this change, and present on every page of the site.
const VERCEL_INSIGHTS = /_vercel\/(insights|speed-insights)|Failed to load resource: the server responded with a status of 404/;
const realErrors = () => consoleErrors.filter((text) => !VERCEL_INSIGHTS.test(text));

async function go(path) {
  consoleErrors = [];
  await command('Page.navigate', { url: `${appUrl}${path}` });
  await waitFor('document.readyState === "complete"', `${path} to load`);
}

// Everything the call to action block can tell us in one round trip. The
// overflow numbers are the point: the copy got longer, and longer copy is how a
// button ends up clipped or pushed outside its card at 390.
const CTA_PROBE = `(() => {
  const aside = document.querySelector('aside[class*="articleCta"]');
  if (!aside) return null;
  const link = aside.querySelector('a');
  if (!link) return { linkMissing: true };
  const box = aside.getBoundingClientRect();
  const linkBox = link.getBoundingClientRect();
  const style = getComputedStyle(link);
  return {
    href: new URL(link.getAttribute('href'), location.href).pathname + new URL(link.getAttribute('href'), location.href).hash,
    label: link.textContent.trim(),
    heading: aside.querySelector('h2')?.textContent.trim() || '',
    body: aside.querySelector('p')?.textContent.trim() || '',
    links: aside.querySelectorAll('a').length,
    visible: linkBox.width > 0 && linkBox.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
    // A label that wrapped is fine. A label wider than the box it lives in is
    // text the reader cannot finish.
    labelClipped: link.scrollWidth > link.clientWidth + 1,
    asideOverflows: aside.scrollWidth > aside.clientWidth + 1,
    linkInsideAside: linkBox.left >= box.left - 1 && linkBox.right <= box.right + 1,
    pageScrollsSideways: document.scrollingElement.scrollWidth > window.innerWidth + 1,
    asideWidth: Math.round(box.width),
    linkWidth: Math.round(linkBox.width),
  };
})()`;

// ---------------------------------------------------------------------------
// The served document first, before a browser is involved at all.
//
// This is the half that matters for the thing being fixed. A link that only
// exists after React runs is a link a crawler never sees, and every assertion
// below this point reads the hydrated DOM, where the two are indistinguishable.
// Plain fetch, no JavaScript executed, exactly what Googlebot's first pass gets.
// ---------------------------------------------------------------------------

const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

let checks = 0;
for (const [slug, expected] of Object.entries(PAIRED)) {
  const html = await fetch(`${appUrl}/guides/${slug}`).then((response) => response.text());
  const collectionLinks = [...new Set(hrefs(html).filter((href) => href.startsWith('/essays/')))];
  assert(
    collectionLinks.length === 1 && collectionLinks[0] === expected,
    `served /guides/${slug} offers ${JSON.stringify(collectionLinks)}, expected exactly ["${expected}"]`,
  );
  checks += 1;
}
for (const slug of UNPAIRED) {
  const html = await fetch(`${appUrl}/guides/${slug}`).then((response) => response.text());
  const collectionLinks = hrefs(html).filter((href) => href.startsWith('/essays/'));
  assert(collectionLinks.length === 0, `served /guides/${slug} links to ${JSON.stringify(collectionLinks)} and should link to no collection`);
  checks += 1;
}
{
  const html = await fetch(`${appUrl}/`).then((response) => response.text());
  const band = [...new Set(hrefs(html).filter((href) => href.startsWith('/essays/')))];
  // The band renders its "N listings" badge from the client catalogue fetch, so
  // the count is absent here by design. The anchor must not be.
  assert(band.length === 6, `the served homepage offers ${band.length} collection links, expected 6: ${JSON.stringify(band)}`);
  assert(hrefs(html).includes('/essays'), 'the served homepage has no link to the collection hub');
  checks += 1;
}
{
  const html = await fetch(`${appUrl}/essays`).then((response) => response.text());
  const hub = [...new Set(hrefs(html).filter((href) => href.startsWith('/essays/')))];
  assert(hub.length === 6, `the served hub offers ${hub.length} collection links, expected 6`);
  checks += 1;
}

await command('Page.enable');
await command('Runtime.enable');
await command('Log.enable');

for (const viewport of WIDTHS) {
  await command('Emulation.setDeviceMetricsOverride', {
    width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile,
  });

  for (const [slug, expected] of Object.entries(PAIRED)) {
    await go(`/guides/${slug}`);
    const cta = await evaluate(CTA_PROBE);
    assert(cta, `${slug} at ${viewport.label}: no call to action block`);
    assert(!cta.linkMissing, `${slug} at ${viewport.label}: the call to action has no link`);
    assert(cta.href === expected, `${slug} at ${viewport.label}: links to ${cta.href}, expected ${expected}`);
    assert(cta.visible, `${slug} at ${viewport.label}: the link is not visible`);
    assert(!cta.labelClipped, `${slug} at ${viewport.label}: "${cta.label}" is clipped`);
    assert(!cta.asideOverflows, `${slug} at ${viewport.label}: the call to action block overflows`);
    assert(cta.linkInsideAside, `${slug} at ${viewport.label}: the link sits outside its own block`);
    assert(!cta.pageScrollsSideways, `${slug} at ${viewport.label}: the page scrolls sideways`);
    // One link, not a block of them. The brief was real links a reader would
    // click, not a keyword list at the foot of every article.
    assert(cta.links === 1, `${slug} at ${viewport.label}: ${cta.links} links in the call to action, expected 1`);
    assert(cta.heading.length > 0 && cta.body.length > 0, `${slug} at ${viewport.label}: the block lost its heading or copy`);
    // AGENTS.md: no em dashes in site copy.
    assert(!/[–—]/.test(`${cta.heading} ${cta.body} ${cta.label}`), `${slug} at ${viewport.label}: em dash in the call to action`);
    assert(realErrors().length === 0, `${slug} at ${viewport.label}: console errors ${JSON.stringify(realErrors())}`);
    checks += 1;
  }

  for (const slug of UNPAIRED) {
    await go(`/guides/${slug}`);
    const cta = await evaluate(CTA_PROBE);
    assert(cta && !cta.linkMissing, `${slug} at ${viewport.label}: no call to action link`);
    assert(cta.href === '/#browse', `${slug} at ${viewport.label}: links to ${cta.href}, expected the untouched /#browse`);
    assert(!cta.labelClipped && !cta.asideOverflows, `${slug} at ${viewport.label}: the untouched block is no longer intact`);
    assert(!cta.pageScrollsSideways, `${slug} at ${viewport.label}: the page scrolls sideways`);
    assert(realErrors().length === 0, `${slug} at ${viewport.label}: console errors ${JSON.stringify(realErrors())}`);
    checks += 1;
  }

  // The homepage collections band is the collection pages' other referring
  // link. Its cards must be anchors a crawler can follow, not click handlers,
  // and the count badge is the only part allowed to wait on the client fetch.
  await go('/');
  await waitFor("document.querySelectorAll('.home-collection').length === 6", `the collections band at ${viewport.label}`);
  const band = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.home-collection')];
    return {
      anchors: cards.filter((card) => card.tagName === 'A' && card.getAttribute('href')?.startsWith('/essays/')).length,
      hrefs: cards.map((card) => card.getAttribute('href')),
      clickable: cards.every((card) => card.getBoundingClientRect().width > 0),
      seeMore: document.querySelector('.home-collections .home-see-more')?.getAttribute('href') || null,
    };
  })()`);
  assert(band.anchors === 6, `the band at ${viewport.label} has ${band.anchors} real anchors, expected 6`);
  assert(band.clickable, `the band at ${viewport.label} has a card with no box`);
  assert(band.seeMore === '/essays', `the band's closing pill at ${viewport.label} points at ${band.seeMore}`);
  checks += 1;

  // Following a new link has to land somewhere with essays on it, at both
  // widths, or the link is worse than the fragment it replaced.
  for (const [slug, expected] of Object.entries(PAIRED)) {
    await go(`/guides/${slug}`);
    await evaluate(`document.querySelector('aside[class*="articleCta"] a').click(); true`);
    await waitFor(`location.pathname === '${expected}'`, `${slug} to reach ${expected} at ${viewport.label}`);
    await waitFor("document.querySelectorAll('.public-grid .catalog-card').length > 0", `cards on ${expected} at ${viewport.label}`);
    const landed = await evaluate(`(() => ({
      cards: document.querySelectorAll('.public-grid .catalog-card').length,
      h1: document.querySelector('h1')?.textContent.trim() || '',
      sideways: document.scrollingElement.scrollWidth > window.innerWidth + 1,
    }))()`);
    assert(landed.cards > 0, `${expected} at ${viewport.label} rendered no cards`);
    assert(!landed.sideways, `${expected} at ${viewport.label} scrolls sideways`);
    console.log(`  ${viewport.label.padStart(4)}  /guides/${slug} -> ${expected}  ${landed.cards} cards  "${landed.h1}"`);
    checks += 1;
  }
}

await command('Emulation.clearDeviceMetricsOverride');
socket.close();
console.log(`guide collection link checks passed (${checks} checks over ${WIDTHS.length} widths)`);
