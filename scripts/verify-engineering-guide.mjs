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
// Claims the article has to keep making. Each one used to be carried by a
// count off /api/listings and is now stated as a fact about engineering
// applications, so this is what stops the substance going out with the
// arithmetic.
const CLAIMS = [
  'usually ask for more writing than the Common App essay',
  'Two questions run through almost every engineering supplement',
  "A college's writing requirements appear once you add it in My Colleges",
  'Sooner or later an engineering supplement will ask you why engineering',
  'The standard answer is an origin story',
  'mostly large public universities running their own portals',
  'Biomedical, aerospace and mechanical applicants all meet the same prompt',
  'some admit you straight to a named major, others take you into a college of engineering',
  'four Personal Insight Questions of up to 350 words each',
];
// The catalogue figures that were cut, and the shapes they would come back in.
// They go stale the day another engineering essay is listed, Google caches the
// old ones, and a reader who has never heard of this site is being handed our
// inventory instead of an answer.
const NO_CATALOGUE_FIGURES = [
  /\b\d+ listings?\b/i,
  /\b\d+ (of the|different) \d+/i,
  /\bof the \d+ (engineering )?listings\b/i,
  /\b\d+ (essays|colleges|supplements|short answers|personal statements) (in|across|appear)/i,
  /\bCounted on\b/i,
  /\bin (the|our|this) (Admitfolio )?(engineering )?collection\b/i,
  /\bthe collection (holds|shows|is)\b/i,
  /\bSeventy-eight\b/i,
  /\bTwenty-three\b/i,
  /\bSixteen of\b/i,
];
// Site copy rules, and one of our own: no price, because a figure a seller
// controls does not belong in an article a crawler caches.
const FORBIDDEN = [/[\u2014\u2013]/, /\$\d/];

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
for (const claim of CLAIMS) {
  assert(body.includes(claim), `the claim "${claim}" is no longer in the served document`);
}
pass(`all ${CLAIMS.length} claims survive in the served text`);

for (const pattern of NO_CATALOGUE_FIGURES) {
  const found = pattern.exec(body);
  assert(!found, `a catalogue figure is back in the copy: "${found && found[0]}" matches ${pattern}`);
}
pass('no catalogue count, and nothing shaped like one, is in the copy');

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
assert(indexHtml.includes('/blog-images/engineering.webp'), 'the index card does not carry the cover photo');
const cardAlt = /<img[^>]*src="\/blog-images\/engineering\.webp"[^>]*alt="([^"]*)"|<img[^>]*alt="([^"]*)"[^>]*src="\/blog-images\/engineering\.webp"/.exec(indexHtml);
assert(cardAlt && (cardAlt[1] || cardAlt[2]), 'the cover photo has no alt text in the served HTML');
pass(`the blog index leads with the new guide, cover photo alt "${cardAlt[1] || cardAlt[2]}"`);

// The file the registry points at has to be served, and be the size and type
// the rest of public/blog-images is. A 404 cover renders as a bare grey box
// that looks deliberate.
const photo = await fetch(`${appUrl}/blog-images/engineering.webp`);
assert(photo.status === 200, `the cover photo answered ${photo.status}`);
assert(photo.headers.get('content-type') === 'image/webp', `the cover photo is served as ${photo.headers.get('content-type')}`);
const photoBytes = (await photo.arrayBuffer()).byteLength;
// why-college.webp is the largest of the seven that were here first.
assert(photoBytes < 321882, `the cover photo is ${photoBytes} bytes, larger than every photo already in the directory`);
pass(`the cover photo is served, image/webp, ${(photoBytes / 1024).toFixed(1)} KB`);

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

// The index card, which has to sit in a row with seven others without looking
// like the odd one out. The photo is object-fit: cover inside a fixed-height
// box, so what matters is that it decoded, that it fills the box, and that the
// box is the same height as its neighbours'.
const CARD_PROBE = `(() => {
  const card = document.querySelector('a[href="${GUIDE}"]');
  if (!card) return { missing: true };
  const cover = card.querySelector('div[class*="blogCover"]');
  const img = cover ? cover.querySelector('img') : null;
  const box = cover ? cover.getBoundingClientRect() : null;
  const imgBox = img ? img.getBoundingClientRect() : null;
  const neighbours = [...document.querySelectorAll('div[class*="blogCover"]')]
    .map((el) => Math.round(el.getBoundingClientRect().height));
  return {
    hasCover: Boolean(cover),
    hasPhoto: Boolean(img),
    src: img ? img.getAttribute('src') : null,
    alt: img ? img.getAttribute('alt') : null,
    // naturalWidth is 0 when the file failed to decode, which is how a broken
    // cover looks identical to a slow one in a screenshot.
    decoded: img ? img.naturalWidth > 0 : false,
    naturalSize: img ? img.naturalWidth + 'x' + img.naturalHeight : null,
    objectFit: img ? getComputedStyle(img).objectFit : null,
    // The img is laid out at its own aspect ratio and overflows the fixed
    // height box, which .blogCover clips. So "fills" means no gap on either
    // axis, not equal boxes: every one of the eight overflows vertically.
    fillsCover: box && imgBox
      ? imgBox.width >= box.width - 1 && imgBox.height >= box.height - 1
      : false,
    coverClips: cover ? getComputedStyle(cover).overflow === 'hidden' : false,
    coverHeight: box ? Math.round(box.height) : null,
    // Every card in the grid should be the same height as this one.
    coversAgree: neighbours.length > 1 && new Set(neighbours).size === 1,
    coverCount: neighbours.length,
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

  // Two in-body links, both doing work the surrounding sentence needs: one
  // separates why-engineering from why-this-college, the other hands off the UC
  // application, which is a different application rather than a supplement. The
  // third, a general "read examples properly" pointer, was cut as a link the
  // related-guides block and the call to action were both already making. This
  // is still the article that gives uc-piq-examples its first inbound link from
  // another guide.
  const expectedBody = ['/guides/why-this-college-essay-examples', '/guides/uc-piq-examples'];
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
  assert(card.hasCover && card.hasPhoto, `${viewport.label}: the card has no cover photo`);
  assert(card.src === '/blog-images/engineering.webp', `${viewport.label}: the cover src is ${card.src}`);
  assert((card.alt || '').length > 0, `${viewport.label}: the cover photo has no alt text`);
  assert(card.decoded, `${viewport.label}: the cover photo did not decode, so the card is a grey box`);
  assert(card.naturalSize === '1200x800', `${viewport.label}: the cover photo decoded at ${card.naturalSize}, expected 1200x800`);
  assert(card.objectFit === 'cover', `${viewport.label}: the cover photo is ${card.objectFit}, so it will letterbox or stretch`);
  assert(card.fillsCover, `${viewport.label}: the photo leaves a gap in its cover box`);
  assert(card.coverClips, `${viewport.label}: the cover no longer clips, so the photo overflows the card`);
  assert(card.coverHeight > 100, `${viewport.label}: the cover collapsed to ${card.coverHeight}px`);
  assert(card.coverCount === 8, `${viewport.label}: ${card.coverCount} cards on the index, expected 8`);
  assert(card.coversAgree, `${viewport.label}: the new card is a different height from its neighbours`);
  assert(/min read/.test(card.meta || ''), `${viewport.label}: the card meta line reads "${card.meta}"`);
  assert(realErrors().length === 0, `${viewport.label}: console errors on the index ${JSON.stringify(realErrors())}`);
  pass(`${viewport.label}: the card shows its photo at ${card.coverHeight}px, same height as the other 7, "${card.meta}"`);

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
