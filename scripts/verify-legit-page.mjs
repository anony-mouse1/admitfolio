#!/usr/bin/env node

// Proves the legitimacy page answers "is admitfolio legit" in the SERVED
// document, not only after hydration, and that it renders at 390 and 1440.
//
// Not in package.json. The `test:*` scripts are pure node; this one needs a
// running server and a browser, the same reason scripts/verify-*.mjs are all
// left out.
//
//   npx next build && npx next start -p 3177     (never `npm run build`)
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
//     --remote-debugging-port=9223 --user-data-dir=/tmp/chrome-admitfolio about:blank
//   APP_URL=http://localhost:3177 node scripts/verify-legit-page.mjs
//
// The app URL must be localhost, not 127.0.0.1: Next serves /_next/static only
// to the origin it started on, so a 127.0.0.1 page 403s on its own JavaScript.
//
// Reads only. It never opens checkout, never submits anything and touches no
// database.

const chromePort = process.env.CHROME_DEBUG_PORT || '9223';
const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

const LEGIT = '/legit';

// Every claim the page makes, written out here rather than imported from the
// page, so that deleting a claim fails this script instead of quietly agreeing
// with itself. Each must be in the raw HTML: a crawler that runs no JavaScript
// is the entire reason this page is not a section on the homepage.
const CLAIMS = [
  ['heading', 'Is Admitfolio legit?'],
  ['edu email confirmed by a code', 'confirmed by a code sent to it'],
  ['acceptance letter, present tense', 'uploads the acceptance letter for that school'],
  ['review panel screens submissions', 'Every submission is screened before anyone sees it'],
  ['a person makes the final call', 'No listing goes live on an automated decision alone'],
  ['human review count', '191 of the 192 listings on sale today carry a recorded human review'],
  ['reading link speed', 'It arrives in under a minute'],
  ['one year of access', 'keeps working for twelve months'],
  ['per-buyer watermark', 'stamped for you at the moment you open it'],
  ['support address', 'hello@admitfolio.com'],
  ['refunds route to support', 'Refunds and any problem with'],
  ['a lost link can be resent', 'A lost link can be resent, case by case'],
  ['what the essays are for', 'They are reading material'],
  ['the file carries a code', 'Every copy carries a code tied to the purchase'],
  ['colleges compare essays', 'Colleges do compare submitted essays'],
  ['colleges rescind offers', 'they do rescind offers over plagiarism'],
  ['and do it years later', 'in some cases years later'],
  ['consequences, not a penalty schedule', 'consequences, and we act on it'],
  ['faq: is it legit', '<h3>Is Admitfolio legit?</h3>'],
  ['faq: is it free', '<h3>Is Admitfolio free?</h3>'],
  ['faq: is it cheating', '<h3>Is buying a college essay cheating?</h3>'],
  ['faq: what happens after I pay', '<h3>What happens after I pay?</h3>'],
  ['canonical', 'rel="canonical"'],
  ['Organization schema', '"@type":"Organization"'],
];

// Claims the page must never make. The first three are the reason this list
// exists: none of them is true today, and the page's whole job is being
// believable. The rest are the house style rule and the schema decision.
const FORBIDDEN = [
  ['names Common App', 'Common App'],
  ['names Turnitin', 'Turnitin'],
  ['claims a plagiarism check runs', 'plagiarism check'],
  ['promises copying is caught', 'will be caught'],
  ['claims these essays are in a corpus', 'database of essays'],
  ['em dash in site copy', '—'],
  // Google restricted FAQ rich results to government and health sites, so
  // FAQPage markup here renders nothing and only adds a surface to get wrong.
  ['FAQPage schema', 'FAQPage'],
];

const WIDTHS = [
  { label: '1440', width: 1440, height: 900, mobile: false },
  { label: '390', width: 390, height: 844, mobile: true },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ---------------------------------------------------------------------------
// The served document first, before a browser is involved at all.
// ---------------------------------------------------------------------------

const response = await fetch(`${appUrl}${LEGIT}`);
assert(response.status === 200, `${LEGIT} served ${response.status}`);
const html = await response.text();

for (const [label, needle] of CLAIMS) {
  assert(html.includes(needle), `served HTML is missing the ${label} claim: ${needle}`);
}
for (const [label, needle] of FORBIDDEN) {
  assert(!html.includes(needle), `served HTML ${label}, which it must not: ${needle}`);
}
console.log(`served HTML: all ${CLAIMS.length} claims present, all ${FORBIDDEN.length} forbidden strings absent`);

// The page is prerendered rather than rendered per request. Static is correct
// here: nothing on it is per visitor, and a cached page is what a crawler and a
// hesitating buyer both get fastest.
// Next sets this header twice on a prerendered route, and fetch joins repeated
// headers into "1, 1". Match on the values rather than on the joined string.
const prerender = (response.headers.get('x-nextjs-prerender') || '').split(',').map((v) => v.trim());
assert(prerender.length > 0 && prerender.every((v) => v === '1'), `${LEGIT} is not prerendered`);
console.log('served HTML: x-nextjs-prerender: 1');

// The sitemap has to list it, or none of the above is ever crawled.
const sitemap = await fetch(`${appUrl}/sitemap.xml`).then((r) => r.text());
// Matched on the path, not on appUrl. The sitemap's origin comes from
// NEXT_PUBLIC_SITE_URL via crawlOrigin(), which is localhost:3000 locally
// whatever port the server was started on. What matters here is that the entry
// exists; scripts/sitemap.test.mjs is what pins the origin to the apex.
const sitemapPaths = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
assert(sitemapPaths.includes(LEGIT), `${LEGIT} is not in the sitemap, which lists ${sitemapPaths.join(' ')}`);
console.log('sitemap: /legit listed');

// Where the page is linked from, counted in each served document. The checkout
// overlay's proof panel is mounted twice, once for desktop and once for phone,
// which is how that component has always worked: every string inside it appears
// twice for the same reason. The numbers below record that rather than hide it,
// so a change to the linking plan shows up here as a number that moved.
const LINK_COUNTS = [
  ['/', 3],                                   // footer, plus the checkout panel's two mounts
  ['/essays', 1],                             // footer only
  ['/essays/biology', 4],                     // body note, footer, and the two checkout mounts
  ['/essays/engineering', 4],
  ['/essays/business', 4],
  ['/essays/computer-science', 4],
  ['/essays/common-app-personal-statement', 4],
  ['/essays/uc-personal-insight-questions', 4],
  ['/guides', 1],                             // footer only: no in-body link in the guides, on purpose
  ['/guides/college-essay-format', 1],
  ['/guides/uc-piq-examples', 1],
];
for (const [path, expected] of LINK_COUNTS) {
  const page = await fetch(`${appUrl}${path}`).then((r) => r.text());
  const found = (page.match(/href="\/legit"/g) || []).length;
  assert(found === expected, `${path} has ${found} links to /legit, expected ${expected}`);
}
console.log(`links: ${LINK_COUNTS.length} pages link to /legit at the expected counts`);

// No guide gets an in-body link. Ritvik's call: an identical block appended to
// every article reads as persuasion, and Google counts the first link to a URL
// on a page anyway. The footer link is the one every guide has.
for (const path of ['/guides/college-essay-format', '/guides/uc-piq-examples']) {
  const page = await fetch(`${appUrl}${path}`).then((r) => r.text());
  const beforeFooter = page.slice(0, page.indexOf('foot-col-title'));
  assert(!beforeFooter.includes('href="/legit"'), `${path} has an in-body link to /legit`);
}
console.log('links: no guide carries an in-body link, only the footer');

// ---------------------------------------------------------------------------
// Then the rendered page, at both widths.
// ---------------------------------------------------------------------------

const target = await fetch(
  `http://127.0.0.1:${chromePort}/json/new?${encodeURIComponent(`${appUrl}${LEGIT}`)}`,
  { method: 'PUT' },
).then((r) => r.json());
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

// Vercel Analytics and Speed Insights inject script tags whose endpoints exist
// only on Vercel, so a local server 404s both and Chrome reports each twice.
// Present on every page of the site and nothing to do with this one.
const VERCEL_INSIGHTS = /_vercel\/(insights|speed-insights)|Failed to load resource: the server responded with a status of 404/;
const realErrors = () => consoleErrors.filter((text) => !VERCEL_INSIGHTS.test(text));

await command('Page.enable');
await command('Runtime.enable');
await command('Log.enable');

// What the reader actually gets: is the text on screen, does it fit, and does
// anything run off the side. The overflow numbers are the point at 390.
const PROBE = `(() => {
  const main = document.querySelector('main');
  const article = main && main.querySelector('article');
  const h1 = document.querySelector('h1');
  const steps = document.querySelectorAll('ol[class*="steps"] > li');
  const faq = document.querySelectorAll('div[class*="faq"] > h3');
  const figure = document.querySelector('span[class*="stepFigure"]');
  const box = article ? article.getBoundingClientRect() : null;
  const wide = [...document.querySelectorAll('main *')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
  }).map((el) => el.tagName + '.' + (el.className || '').toString().slice(0, 40));
  const clipped = [...document.querySelectorAll('main h1, main h2, main h3, main strong, main span')]
    .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible')
    .map((el) => el.textContent.trim().slice(0, 40));
  return {
    h1: h1 ? h1.textContent.trim() : null,
    h1Visible: h1 ? h1.getBoundingClientRect().height > 0 : false,
    steps: steps.length,
    stepsAllVisible: [...steps].every((li) => li.getBoundingClientRect().height > 0),
    faq: faq.length,
    faqAllVisible: [...faq].every((h) => h.getBoundingClientRect().height > 0),
    figure: figure ? figure.textContent.trim() : null,
    figureVisible: figure ? figure.getBoundingClientRect().height > 0 : false,
    articleWidth: box ? Math.round(box.width) : 0,
    articleInsideViewport: box ? box.left >= -1 && box.right <= window.innerWidth + 1 : false,
    pageScrollsSideways: document.scrollingElement.scrollWidth > window.innerWidth + 1,
    overflowing: wide,
    clipped,
    legitLinksInDom: document.querySelectorAll('a[href="/legit"]').length,
    navItems: [...document.querySelectorAll('.nav-links a')].map((a) => a.textContent.trim()),
    navOverlaps: (() => {
      const links = document.querySelector('.nav-links');
      const cta = document.querySelector('.nav-cta');
      const logo = document.querySelector('.nav .logo');
      if (!links || !cta || !logo) return null;
      const l = links.getBoundingClientRect();
      const c = cta.getBoundingClientRect();
      const g = logo.getBoundingClientRect();
      if (l.width === 0) return 'nav-links hidden at this width';
      return { logoIntoLinks: Math.round(g.right - l.left), linksIntoCta: Math.round(l.right - c.left) };
    })(),
  };
})()`;

for (const width of WIDTHS) {
  consoleErrors = [];
  await command('Emulation.setDeviceMetricsOverride', {
    width: width.width, height: width.height, deviceScaleFactor: 1, mobile: width.mobile,
  });
  await command('Page.navigate', { url: `${appUrl}${LEGIT}` });
  await waitFor('document.readyState === "complete"', `${LEGIT} at ${width.label}`);
  await waitFor('document.querySelector("h1") !== null', `the heading at ${width.label}`);
  const probe = await evaluate(PROBE);

  assert(probe.h1 === 'Is Admitfolio legit?', `${width.label}: wrong h1 ${probe.h1}`);
  assert(probe.h1Visible, `${width.label}: the heading has no height`);
  assert(probe.steps === 4, `${width.label}: ${probe.steps} verification steps, expected 4`);
  assert(probe.stepsAllVisible, `${width.label}: a verification step is not visible`);
  assert(probe.faq === 4, `${width.label}: ${probe.faq} FAQ questions, expected 4`);
  assert(probe.faqAllVisible, `${width.label}: an FAQ question is not visible`);
  assert(probe.figureVisible, `${width.label}: the human-review figure is not visible`);
  assert(probe.figure.includes('191 of the 192'), `${width.label}: the figure does not read 191 of 192`);
  assert(!probe.pageScrollsSideways, `${width.label}: the page scrolls sideways`);
  assert(probe.articleInsideViewport, `${width.label}: the article is outside the viewport`);
  assert(probe.overflowing.length === 0, `${width.label}: overflowing ${probe.overflowing.join(', ')}`);
  assert(probe.clipped.length === 0, `${width.label}: clipped text ${probe.clipped.join(' | ')}`);
  assert(realErrors().length === 0, `${width.label}: console errors ${realErrors().join(' | ')}`);

  console.log(
    `${width.label}: h1 + 4 steps + 4 questions render, article ${probe.articleWidth}px, `
    + `no overflow, no clipped text, no console errors`,
  );
  // The nav is printed rather than asserted, because what it records is a
  // decision not to touch it. /legit is NOT in the nav: measured with a fifth
  // item added, the links row wraps to two lines from 1100px down instead of
  // from 960px, and at 901px the "Find my matches" button lands 51px outside
  // the nav pill. Four items leave 77px of slack at 1440 and five leave 24px.
  // The footer, the collection pages and the checkout panel carry the link
  // instead. If the nav copy ever shortens, re-measure before revisiting.
  assert(probe.navItems.length === 4, `${width.label}: the nav has ${probe.navItems.length} items, expected 4`);
  console.log(`${width.label}: nav ${JSON.stringify(probe.navItems)} ${JSON.stringify(probe.navOverlaps)}`);
}

socket.close();
console.log('\nlegit page verified');
