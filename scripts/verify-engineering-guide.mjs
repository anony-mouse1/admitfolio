#!/usr/bin/env node

// The engineering guide, checked first as a served document and then as a
// hydrated page at two widths. Start the app and Chrome before running it:
//
//   npx next build && npx next start -p 3000
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
//     --remote-debugging-port=9223 --user-data-dir=/tmp/chrome-admitfolio about:blank
//   node scripts/verify-engineering-guide.mjs
//
// APP_URL overrides the origin. Never `npm run build`; it applies migrations to
// production. This script reads and navigates. It never opens checkout, it
// writes nothing, and it touches no database.
//
// Not in package.json, for the same reason scripts/verify-*.mjs are not: it
// needs a server and a browser, and `test:*` is pure.
//
// The served half is the half that matters for search. Everything under
// "hydrated" reads a DOM React has already built, where a link that only exists
// after hydration is indistinguishable from one that was in the document.

const chromePort = process.env.CHROME_DEBUG_PORT || '9223';
const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

const GUIDE = '/guides/engineering-application-essays';
const COLLECTION = '/essays/engineering';

// The figures the article states, and the headings it states them under. Every
// one is checked against the raw HTML, so a layout change that drops half the
// article fails here rather than shipping quietly.
const SECTIONS = [
  'count-the-writing',
  'why-engineering',
  'how-much-to-explain',
  'short-answers',
  'which-engineering',
  'read-for-calibration',
  'before-you-submit',
];
// scripts/engineering-guide-figures.mjs is what these were counted from.
const FIGURES = [
  'the 116 essays in the Admitfolio engineering collection',
  '28 Common App personal statements',
  '26 UC Personal Insight Questions',
  '62 supplements or short answers',
  'Sixteen of the 44 engineering listings contain no Common App personal statement at all',
  'Seven of those are UC Personal Insight Question sets',
  'The other nine are supplements and short answers on their own',
  'the heaviest of them carries eight',
  'The most common shape, 17 of the 44',
  'Twenty-three of the 116 essays in the collection are short answers',
  'they sit in only eight listings',
  'one listing carries six of them',
  'Seven of the 44 listings are undeclared, general or first-year engineering',
  'Seventy-eight different colleges appear across the 44 listings, and 45 of them appear in more than one',
  'Eight of the listings carry UC Personal Insight Questions, six of them as complete sets of four',
  'Biomedical is the most common discipline in it, then aerospace, then mechanical',
];
// Phrases that must never appear. The article is aggregates only: a listing's
// own words, a seller, or a price would each be production data on a public
// page, and a count with no date attached is a claim that cannot be rechecked.
const FORBIDDEN = [/[—–]/, /\$\d/];

const WIDTHS = [
  { label: '1440', width: 1440, height: 900, mobile: false },
  { label: '390', width: 390, height: 844, mobile: true },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let checks = 0;
const pass = (line) => { checks += 1; console.log(`  ok  ${line}`); };

const text = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&#x27;|&#39;/gi, "'")
  .replace(/&quot;/gi, '"')
  .replace(/\s+/g, ' ')
  .trim();

// ---------------------------------------------------------------------------
// Served documents. Plain fetch, no JavaScript executed.
// ---------------------------------------------------------------------------
console.log('\nserved, no JavaScript');

const guideHtml = await fetch(`${appUrl}${GUIDE}`).then((r) => r.text());

assert(/<h1>Engineering application essays: what you actually have to write<\/h1>/.test(guideHtml), 'no h1 in the served document');
pass('the headline is in the raw HTML');

for (const id of SECTIONS) {
  assert(guideHtml.includes(`id="${id}"`), `section ${id} is missing from the served document`);
}
pass(`all ${SECTIONS.length} section headings are in the raw HTML`);

// Whitespace collapsed, because the source wraps mid-sentence. Still the
// served document: this is the text a crawler that runs no JavaScript reads.
const body = text(guideHtml);
for (const figure of FIGURES) {
  assert(body.includes(figure), `the figure "${figure}" is not in the served document`);
}
pass(`all ${FIGURES.length} catalogue figures are in the served text`);

assert(body.includes('Counted on September 18, 2026'), 'the figures carry no date, so a reader cannot tell how old they are');
pass('the figures are dated in the document');

for (const pattern of FORBIDDEN) {
  assert(!pattern.test(body), `the served copy matches the forbidden pattern ${pattern}`);
}
pass('no em dash, no en dash, no price in the copy');

// The call to action, and the back link the nav used to sit on top of. The
// aside is sliced out first: the footer that follows it carries its own
// /#browse link, so an unbounded regex from the aside would find that one and
// report a fragment the article does not have.
// RelatedGuides is an <aside> too and it comes first, so find the one carrying
// the articleCta class rather than the first aside in the document.
const ctaMatch = /<aside[^>]*class="[^"]*articleCta[^"]*"[^>]*>/.exec(guideHtml);
assert(ctaMatch, 'no call to action block in the served document');
const ctaOpen = ctaMatch.index;
const ctaAside = guideHtml.slice(ctaOpen, guideHtml.indexOf('</aside>', ctaOpen));
const ctaHref = /<a[^>]*href="([^"]+)"/.exec(ctaAside);
assert(ctaHref, 'the call to action has no link in the served document');
assert(ctaHref[1] === COLLECTION, `the call to action points at ${ctaHref[1]}, expected ${COLLECTION}`);
assert(!/href="\/#/.test(ctaAside), `the call to action still ends at a homepage fragment: ${ctaAside.match(/href="\/#[^"]*"/)}`);
assert((ctaAside.match(/<a\b/g) || []).length === 1, 'the call to action should hold one link, not a block of them');
pass(`the call to action holds one link and it points at ${COLLECTION}`);

const collectionLinks = [...new Set([...guideHtml.matchAll(/href="(\/essays[^"]*)"/g)].map((m) => m[1]))];
assert(
  collectionLinks.length === 2 && collectionLinks.includes(COLLECTION) && collectionLinks.includes('/essays'),
  `the article offers ${JSON.stringify(collectionLinks)}, expected only ${COLLECTION} and the footer's /essays`,
);
pass('the only collection link outside the footer is the call to action');

const backHref = /<a[^>]*backLink[^>]*href="([^"]+)"|href="([^"]+)"[^>]*backLink/.exec(guideHtml);
assert(backHref && (backHref[1] || backHref[2]) === '/guides', 'the back link does not point at /guides');
pass('the back link points at /guides');

// Metadata. The canonical and the sitemap entry come from the same registry
// function, and this is where that stops being an assumption.
const canonical = /<link rel="canonical" href="([^"]+)"\/?>/.exec(guideHtml);
assert(canonical, 'no canonical tag');
assert(new URL(canonical[1]).pathname === GUIDE, `canonical is ${canonical[1]}`);
pass(`the canonical is ${canonical[1]}`);
for (const [what, pattern] of [
  ['an OpenGraph article type', /property="og:type" content="article"/],
  ['a published time', /property="article:published_time"/],
  ['a modified time', /property="article:modified_time"/],
  ['Article JSON-LD', /"@type":"Article"/],
]) {
  assert(pattern.test(guideHtml), `the article has no ${what}`);
}
pass('OpenGraph article tags and Article JSON-LD are present');

// In the sitemap. Fetched, not read off the route file.
const sitemap = await fetch(`${appUrl}/sitemap.xml`).then((r) => r.text());
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
assert(locs.includes(GUIDE), `${GUIDE} is not in the fetched sitemap: ${JSON.stringify(locs)}`);
assert(locs.includes(COLLECTION), `${COLLECTION} is not in the fetched sitemap`);
const entry = new RegExp(`<loc>[^<]*${GUIDE}</loc>\\s*<lastmod>([^<]+)</lastmod>`).exec(sitemap);
assert(entry, `${GUIDE} is in the sitemap with no lastmod`);
pass(`the sitemap lists ${GUIDE}, lastmod ${entry[1]}`);

// The blog index, and the collection naming the guide back.
const indexHtml = await fetch(`${appUrl}/guides`).then((r) => r.text());
assert(indexHtml.includes(`href="${GUIDE}"`), 'the blog index does not link the new guide');
const order = [...indexHtml.matchAll(/href="(\/guides\/[^"]+)"/g)].map((m) => m[1]);
assert(order[0] === GUIDE, `the index lists ${order[0]} first; the newest article should lead`);
assert(indexHtml.includes('Count the writing first'), 'the index card is missing its cover title');
pass('the blog index leads with the new guide and renders its cover title');

const collectionHtml = await fetch(`${appUrl}${COLLECTION}`).then((r) => r.text());
assert(collectionHtml.includes(`href="${GUIDE}"`), `${COLLECTION} does not link back to the guide`);
assert(text(collectionHtml).includes('Want the method before the examples?'), `${COLLECTION} has no guide note`);
pass(`${COLLECTION} links back to the guide in its served HTML`);

// ---------------------------------------------------------------------------
// Hydrated, at both widths.
// ---------------------------------------------------------------------------
const target = await fetch(`http://127.0.0.1:${chromePort}/json/new?${encodeURIComponent(`${appUrl}${GUIDE}`)}`, { method: 'PUT' })
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
// Vercel Analytics and Speed Insights post to endpoints that only exist on
// Vercel, so a local server answers 404 and Chrome reports it twice. Present on
// every page of the site and nothing to do with this branch.
const VERCEL_INSIGHTS = /_vercel\/(insights|speed-insights)|Failed to load resource: the server responded with a status of 404/;
const realErrors = () => consoleErrors.filter((t) => !VERCEL_INSIGHTS.test(t));
async function go(path) {
  consoleErrors = [];
  await command('Page.navigate', { url: `${appUrl}${path}` });
  await waitFor('document.readyState === "complete"', `${path} to load`);
}

// The back link sat underneath the fixed nav on all seven articles before
// 645-649 of guides.module.css pushed the shell down: elementFromPoint at the
// link's own centre returned the nav on desktop and the logo on mobile, so
// "Back to all essay guides" was not clickable anywhere. The eighth article
// takes the same CSS, so it needs the same proof rather than an assumption.
const BACK_LINK_PROBE = `(() => {
  const link = document.querySelector('a[class*="backLink"]');
  if (!link) return { missing: true };
  const box = link.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const hit = document.elementFromPoint(x, y);
  const nav = document.querySelector('nav.nav');
  const navBox = nav ? nav.getBoundingClientRect() : null;
  return {
    href: link.getAttribute('href'),
    top: Math.round(box.top),
    navBottom: navBox ? Math.round(navBox.bottom) : null,
    clearsNav: navBox ? box.top >= navBox.bottom : true,
    hitIsTheLink: hit === link || link.contains(hit),
    hitTag: hit ? \`\${hit.tagName.toLowerCase()}.\${(hit.className || '').toString().split(' ')[0]}\` : null,
    inViewport: box.top >= 0 && box.bottom <= window.innerHeight,
    clipped: link.scrollWidth > link.clientWidth + 1,
  };
})()`;

const LAYOUT_PROBE = `(() => {
  const overflow = [];
  const clipped = [];
  const shell = document.querySelector('article[class*="articleShell"]');
  for (const el of shell.querySelectorAll('h1, h2, h3, p, li, div[class*="callout"], div[class*="articleStat"], a')) {
    if (el.scrollWidth > el.clientWidth + 1) clipped.push(el.tagName.toLowerCase() + ': ' + el.textContent.trim().slice(0, 40));
    const box = el.getBoundingClientRect();
    if (box.right > window.innerWidth + 1 || box.left < -1) overflow.push(el.tagName.toLowerCase() + ': ' + el.textContent.trim().slice(0, 40));
  }
  const cta = document.querySelector('aside[class*="articleCta"]');
  const ctaLink = cta ? cta.querySelector('a') : null;
  const ctaBox = cta ? cta.getBoundingClientRect() : null;
  const linkBox = ctaLink ? ctaLink.getBoundingClientRect() : null;
  return {
    clipped, overflow,
    sideways: document.scrollingElement.scrollWidth > window.innerWidth + 1,
    // Scoped to the body: the Summary block carries an h2[id] of its own.
    headings: shell.querySelectorAll('div[class*="articleBody"] h2[id]').length,
    tocItems: shell.querySelectorAll('nav[class*="articleToc"] a').length,
    summaryItems: shell.querySelectorAll('section[class*="articleSummary"] li').length,
    checklistItems: [...shell.querySelectorAll('h2[id="before-you-submit"] ~ ul li')].length,
    relatedCards: shell.querySelectorAll('#related-guides a').length,
    ctaHref: ctaLink ? ctaLink.getAttribute('href') : null,
    ctaVisible: linkBox ? linkBox.width > 0 && linkBox.height > 0 : false,
    ctaInside: ctaBox && linkBox ? linkBox.left >= ctaBox.left - 1 && linkBox.right <= ctaBox.right + 1 : false,
    // Every in-body anchor the reader can actually click.
    bodyLinks: [...shell.querySelectorAll('div[class*="articleBody"] a')].map((a) => a.getAttribute('href')),
  };
})()`;

// The index card has no photo, so it takes the CSS cover. That branch of
// GuideCover had never rendered on this site before this article.
const CARD_PROBE = `(() => {
  const card = document.querySelector('a[href="${GUIDE}"]');
  if (!card) return { missing: true };
  const cover = card.querySelector('div[class*="blogCover"]');
  const title = cover ? cover.querySelector('span[class*="coverTitle"]') : null;
  const box = cover ? cover.getBoundingClientRect() : null;
  const titleBox = title ? title.getBoundingClientRect() : null;
  return {
    hasCover: Boolean(cover),
    hasPhoto: Boolean(cover && cover.querySelector('img')),
    background: cover ? getComputedStyle(cover).backgroundColor : null,
    title: title ? title.textContent.trim() : null,
    coverHeight: box ? Math.round(box.height) : null,
    titleInsideCover: box && titleBox
      ? titleBox.left >= box.left - 1 && titleBox.right <= box.right + 1
        && titleBox.top >= box.top - 1 && titleBox.bottom <= box.bottom + 1
      : false,
    titleClipped: title ? title.scrollWidth > title.clientWidth + 1 : false,
    meta: card.querySelector('div[class*="blogCardMeta"]')?.textContent.trim() || null,
  };
})()`;

await command('Page.enable');
await command('Runtime.enable');
await command('Log.enable');

for (const viewport of WIDTHS) {
  console.log(`\nhydrated at ${viewport.label}`);
  await command('Emulation.setDeviceMetricsOverride', {
    width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile,
  });

  await go(GUIDE);
  const back = await evaluate(BACK_LINK_PROBE);
  assert(!back.missing, `${viewport.label}: no back link`);
  assert(back.href === '/guides', `${viewport.label}: the back link points at ${back.href}`);
  assert(back.clearsNav, `${viewport.label}: the back link starts at ${back.top}, above the nav's bottom edge at ${back.navBottom}`);
  assert(back.hitIsTheLink, `${viewport.label}: a click at the back link's centre lands on ${back.hitTag}, not the link`);
  assert(back.inViewport, `${viewport.label}: the back link is off screen on first paint`);
  assert(!back.clipped, `${viewport.label}: the back link text is clipped`);
  pass(`${viewport.label}: the back link is clickable, ${back.top - back.navBottom}px clear of the nav`);

  const layout = await evaluate(LAYOUT_PROBE);
  assert(layout.clipped.length === 0, `${viewport.label}: clipped text ${JSON.stringify(layout.clipped)}`);
  assert(layout.overflow.length === 0, `${viewport.label}: content outside the viewport ${JSON.stringify(layout.overflow)}`);
  assert(!layout.sideways, `${viewport.label}: the page scrolls sideways`);
  assert(layout.headings === SECTIONS.length, `${viewport.label}: ${layout.headings} sections, expected ${SECTIONS.length}`);
  assert(layout.tocItems === SECTIONS.length, `${viewport.label}: ${layout.tocItems} table of contents entries`);
  assert(layout.summaryItems === 4, `${viewport.label}: ${layout.summaryItems} summary bullets, expected 4`);
  assert(layout.checklistItems === 6, `${viewport.label}: ${layout.checklistItems} checklist items, expected 6`);
  assert(layout.relatedCards === 3, `${viewport.label}: ${layout.relatedCards} related guides, expected 3`);
  pass(`${viewport.label}: ${layout.headings} sections, ${layout.tocItems} contents entries, no clipping, no sideways scroll`);

  assert(layout.ctaHref === COLLECTION, `${viewport.label}: the call to action points at ${layout.ctaHref}`);
  assert(layout.ctaVisible, `${viewport.label}: the call to action link is not visible`);
  assert(layout.ctaInside, `${viewport.label}: the call to action link sits outside its own block`);
  pass(`${viewport.label}: the call to action is visible and points at ${COLLECTION}`);

  // Three in-body links, all to other articles. This is the article that gives
  // uc-piq-examples its first inbound link from another guide.
  const expectedBody = ['/guides/why-this-college-essay-examples', '/guides/uc-piq-examples', '/guides/how-to-take-inspiration-from-college-essays'];
  for (const href of expectedBody) {
    assert(layout.bodyLinks.includes(href), `${viewport.label}: the body does not link ${href}`);
  }
  assert(
    layout.bodyLinks.filter((href) => href.startsWith('/')).length === expectedBody.length,
    `${viewport.label}: unexpected internal body links ${JSON.stringify(layout.bodyLinks)}`,
  );
  pass(`${viewport.label}: ${expectedBody.length} in-body links to other guides, including uc-piq-examples`);
  assert(realErrors().length === 0, `${viewport.label}: console errors ${JSON.stringify(realErrors())}`);

  await go('/guides');
  const card = await evaluate(CARD_PROBE);
  assert(!card.missing, `${viewport.label}: the index has no card for the new guide`);
  assert(card.hasCover && !card.hasPhoto, `${viewport.label}: the card should render the CSS cover, not a photo`);
  assert(card.title === 'Count the writing first', `${viewport.label}: the cover title reads "${card.title}"`);
  assert(card.titleInsideCover, `${viewport.label}: the cover title sits outside its cover`);
  assert(!card.titleClipped, `${viewport.label}: the cover title is clipped`);
  assert(card.coverHeight > 100, `${viewport.label}: the cover collapsed to ${card.coverHeight}px`);
  assert(/min read/.test(card.meta || ''), `${viewport.label}: the card meta line reads "${card.meta}"`);
  assert(realErrors().length === 0, `${viewport.label}: console errors on the index ${JSON.stringify(realErrors())}`);
  pass(`${viewport.label}: the index card renders the CSS cover, ${card.coverHeight}px, "${card.meta}"`);

  // Follow the link the way a reader would, and land on essays.
  await go(GUIDE);
  await evaluate(`document.querySelector('aside[class*="articleCta"] a').click(); true`);
  await waitFor(`location.pathname === '${COLLECTION}'`, `${COLLECTION} at ${viewport.label}`);
  await waitFor("document.querySelectorAll('.public-grid .catalog-card').length > 0", `cards at ${viewport.label}`);
  const landed = await evaluate(`(() => ({
    cards: document.querySelectorAll('.public-grid .catalog-card').length,
    h1: document.querySelector('h1')?.textContent.trim() || '',
    guideNote: document.querySelector('a[href="${GUIDE}"]')?.textContent.trim() || null,
    sideways: document.scrollingElement.scrollWidth > window.innerWidth + 1,
  }))()`);
  assert(landed.cards > 0, `${viewport.label}: ${COLLECTION} rendered no cards`);
  assert(!landed.sideways, `${viewport.label}: ${COLLECTION} scrolls sideways`);
  assert(landed.guideNote, `${viewport.label}: ${COLLECTION} does not link back to the guide`);
  assert(realErrors().length === 0, `${viewport.label}: console errors on ${COLLECTION} ${JSON.stringify(realErrors())}`);
  pass(`${viewport.label}: the call to action lands on "${landed.h1}", ${landed.cards} cards, links back to the guide`);
}

socket.close();
console.log(`\n${checks} checks passed\n`);
