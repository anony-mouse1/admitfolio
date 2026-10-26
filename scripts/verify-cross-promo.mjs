#!/usr/bin/env node

// Browser checks for the Fatimah's Guide cross-promo, run by hand like the
// other verify-*.mjs scripts. Not a test:* script: it needs a dev server and a
// browser.
//
// THIS RUN NEVER REACHES THE DATABASE. Start the dev server with every
// connection string and secret pointed somewhere dead, so a mistake fails
// instead of reading production:
//
//   DATABASE_URL=postgresql://disabled:disabled@127.0.0.1:1/disabled \
//   DIRECT_URL=postgresql://disabled:disabled@127.0.0.1:1/disabled \
//   SUPABASE_URL=http://127.0.0.1:1 SUPABASE_SERVICE_ROLE_KEY=disabled \
//   STRIPE_SECRET_KEY=sk_test_disabled RESEND_API_KEY=disabled \
//   NEXT_PUBLIC_SITE_URL=http://localhost:3100 npx next dev -p 3100
//   node scripts/verify-cross-promo.mjs [screenshotDir]
//
// Then `git checkout -- AGENTS.md`: next dev appends its agent-rules block.
//
// Every /api/* request from the page is answered inside the browser: the
// catalogue with three placeholder listings, everything else with a 503. Only
// pages that render without the database are visited (the homepage, guides,
// /purchase/success with no session id, an unrecognised reading link, /admin
// with its API stubbed). The reading page's card needs a real purchase, so it
// is checked in source by scripts/cross-promo.test.mjs instead.

import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const appUrl = (process.env.APP_URL || 'http://localhost:3100').replace(/\/$/, '');
const shotDir = process.argv[2] || '';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = Number(process.env.CHROME_DEBUG_PORT || 9241);

const failures = [];
function check(condition, message) {
  console.log(`  ${condition ? 'ok  ' : 'FAIL'}  ${message}`);
  if (!condition) failures.push(message);
}

const BASE = 'https://fatimahs.guide/?utm_source=admitfolio';
const BANNER_URL = `${BASE}&utm_medium=banner&utm_campaign=crosspromo#consult`;
const blogUrl = (slug) => `${BASE}&utm_medium=blog&utm_campaign=crosspromo&utm_content=${slug}#consult`;
const SUCCESS_URL = `${BASE}&utm_medium=purchase&utm_campaign=crosspromo&utm_content=success#consult`;

// Placeholder listings. Not real data: no seller, no essay text.
const school = (name) => ({ school: name, targetSchool: name, headlineSchool: name, admitTags: [name], verifiedAdmitTags: [name] });
const fakeListing = (id, name) => ({
  id, ...school(name), applicationSystem: 'Common App', price: 25,
  teaser: 'Placeholder teaser for a verification run.',
  openingLine: 'Placeholder opening line for a verification run.',
  appliedMajors: null, major: null, createdAt: '2026-10-01T00:00:00.000Z',
  essays: [{ prompt: 'Personal statement', question: null, wordCount: 650 }],
  seller: { displayName: 'Anonymous', backgroundTags: [], anonymity: 'anonymous' },
  otherListingIds: [],
});
// Enough cards that the browse view is tall enough to scroll the matches
// nudge into view.
const SCHOOLS = ['Stanford University', 'Yale University', 'Duke University', 'Brown University'];
const LISTINGS = JSON.stringify({ ok: true, listings: Array.from({ length: 24 }, (_, i) => fakeListing(`verify-${i + 1}`, SCHOOLS[i % SCHOOLS.length])) });

// ---- Chrome over CDP ----
const profile = await mkdtemp(path.join(process.env.TMPDIR || tmpdir(), 'verify-cross-promo-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let pageTarget;
for (let i = 0; i < 60 && !pageTarget; i++) {
  try { pageTarget = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
  if (!pageTarget) await new Promise((r) => setTimeout(r, 200));
}
const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', async (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Fetch.requestPaused') {
    const { requestId, request } = msg.params;
    const url = new URL(request.url);
    const json = (status, body) => send('Fetch.fulfillRequest', {
      requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(body).toString('base64'),
    });
    if (url.pathname === '/api/listings' && request.method === 'GET') await json(200, LISTINGS);
    else await json(503, JSON.stringify({ ok: false, error: 'Stubbed by verify-cross-promo' }));
  }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    // The stubbed 503s are expected; anything else (hydration, React) is not.
    if (!/503|Stubbed|Failed to load resource/i.test(text)) errors.push(text);
  }
});
function send(method, params = {}) {
  return new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description || expression);
  return res.result?.result?.value;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Runtime.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: `${appUrl}/api/*`, requestStage: 'Request' }] });

async function viewport(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 600 });
}
async function go(pathname, settle = 1800) {
  await send('Page.navigate', { url: `${appUrl}${pathname}` });
  for (let i = 0; i < 60; i++) {
    await wait(150);
    if (await evaluate('document.readyState').catch(() => '') === 'complete') break;
  }
  await evaluate('document.fonts.ready.then(() => true)');
  await wait(settle);
}
async function shot(name) {
  if (!shotDir) return;
  await mkdir(shotDir, { recursive: true });
  // Next's dev-only indicator sits in the bottom-left corner. Production has
  // none, so it is hidden from the screenshot rather than drawn over the banner.
  await evaluate(`document.querySelectorAll('nextjs-portal').forEach((el) => { el.style.display = 'none'; }), true`);
  const { result } = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(shotDir, `${name}.png`), Buffer.from(result.data, 'base64'));
  console.log(`  shot  ${path.join(shotDir, `${name}.png`)}`);
}

// Geometry of the banner as it is drawn right now.
const MEASURE = `(() => {
  const b = document.querySelector('.fg-promo');
  if (!b) return { present: false, htmlOn: document.documentElement.classList.contains('fg-promo-on') };
  const a = b.querySelector('a'); const x = b.querySelector('.fg-promo-x');
  const shown = [...a.querySelectorAll('.fg-promo-long,.fg-promo-short')].find((el) => getComputedStyle(el).display !== 'none');
  const range = document.createRange(); range.selectNodeContents(shown);
  const rects = [...range.getClientRects()].filter((r) => r.width > 0);
  const br = b.getBoundingClientRect(); const xr = x.getBoundingClientRect();
  const nudge = document.querySelector('.mf-nudge');
  return {
    present: true,
    htmlOn: document.documentElement.classList.contains('fg-promo-on'),
    text: shown.textContent, href: a.href, target: a.target,
    lines: new Set(rects.map((r) => Math.round(r.top))).size,
    textRight: Math.max(...rects.map((r) => r.right)), closeLeft: xr.left,
    bannerTop: br.top, bannerH: br.height, innerH: innerHeight,
    pad: parseFloat(getComputedStyle(document.body).paddingBottom),
    nudgeBottom: nudge ? nudge.getBoundingClientRect().bottom : null,
    suspended: b.dataset.suspended, visibility: getComputedStyle(b).visibility,
  };
})()`;

const LONG = "Want 1:1 help with your applications? Book a free call with Fatimah, Admitfolio's founder (bring a parent).";
const SHORT = "Free 1:1 call with Fatimah, Admitfolio's founder. Bring a parent.";

try {
  // ---- Homepage, desktop ----
  console.log('homepage 1440');
  await viewport(1440, 900);
  await go('/');
  let m = await evaluate(MEASURE);
  check(m.present && m.htmlOn, 'banner shows and <html> carries fg-promo-on');
  check(m.text === LONG, 'desktop shows the full line');
  check(m.lines === 1, 'desktop line fits on one line');
  check(m.textRight <= m.closeLeft - 4, 'text clears the close button');
  check(m.href === BANNER_URL && m.target === '_blank', 'banner link is utm_medium=banner in a new tab');
  check(Math.abs(m.pad - m.bannerH) <= 1, `page padding (${m.pad}) matches banner height (${m.bannerH})`);
  check(Math.abs(m.bannerTop + m.bannerH - m.innerH) <= 1, 'banner sits on the bottom edge');
  await shot('banner-desktop-1440');
  // The matches nudge only exists on the browse view, once its button has
  // scrolled under the nav.
  const nudgeCheck = `(async () => {
    if (location.hash !== '#browse') { location.hash = '#browse'; await new Promise((r) => setTimeout(r, 900)); }
    window.scrollTo({ top: 1400, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 700));
    const n = document.querySelector('.mf-nudge'); const b = document.querySelector('.fg-promo');
    return n ? { nudgeBottom: n.getBoundingClientRect().bottom, bannerTop: b.getBoundingClientRect().top } : null;
  })()`;
  const nudge = await evaluate(nudgeCheck);
  check(nudge && nudge.nudgeBottom <= nudge.bannerTop, `matches nudge sits above the banner ${JSON.stringify(nudge)}`);
  await shot('banner-desktop-1440-with-nudge');
  const FOOTER_CLEAR = `(async () => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 500));
    const els = [...document.querySelectorAll('footer *')].filter((el) => el.children.length === 0 && el.textContent.trim()
      && getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length);
    const lastEl = els.reduce((a, el) => (el.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom ? el : a));
    const last = lastEl.getBoundingClientRect().bottom; const top = document.querySelector('.fg-promo').getBoundingClientRect().top;
    return { ok: last <= top + 0.5, last, top, el: lastEl.className + ' ' + lastEl.textContent.trim().slice(0, 40) };
  })()`;
  const footer = await evaluate(FOOTER_CLEAR);
  check(footer.ok, `scrolled to the end, the footer text ends above the banner ${footer.ok ? '' : JSON.stringify(footer)}`);

  // ---- Homepage, phone widths ----
  for (const [w, h] of [[390, 844], [375, 812], [360, 760], [320, 640]]) {
    console.log(`homepage ${w}`);
    await viewport(w, h);
    await go('/');
    m = await evaluate(MEASURE);
    check(m.text === SHORT, `${w}: phone line`);
    check(m.lines <= 2, `${w}: ${m.lines} line(s)`);
    check(m.textRight <= m.closeLeft - 4, `${w}: text never runs under the close button`);
    check(Math.abs(m.pad - m.bannerH) <= 1, `${w}: padding (${m.pad}) matches banner height (${m.bannerH})`);
    if (w === 390) await shot('banner-phone-390');
    const phoneNudge = await evaluate(nudgeCheck);
    check(phoneNudge && phoneNudge.nudgeBottom <= phoneNudge.bannerTop, `${w}: matches nudge sits above the banner ${JSON.stringify(phoneNudge)}`);
    if (w === 390) await shot('banner-phone-390-with-nudge');
    const phoneFooter = await evaluate(FOOTER_CLEAR);
    check(phoneFooter.ok, `${w}: footer text ends above the banner ${phoneFooter.ok ? '' : JSON.stringify(phoneFooter)}`);
    if (w === 320) await shot('banner-phone-320');
  }

  // ---- Detail sheet and mobile checkout cover the banner ----
  console.log('detail sheet and checkout, 390');
  await viewport(390, 844);
  const covered = `(() => {
    const b = document.querySelector('.fg-promo').getBoundingClientRect();
    const hits = [[20, b.top + b.height / 2], [innerWidth / 2, b.top + b.height / 2], [innerWidth - 20, b.top + b.height / 2]]
      .map(([x, y]) => document.elementFromPoint(x, y));
    return hits.every((el) => el && !el.closest('.fg-promo'));
  })()`;
  await go('/?listing=verify-1');
  check(await evaluate(`!!document.querySelector('.ov')`), 'detail sheet opened');
  check(await evaluate(covered), 'detail sheet, with its sticky price bar, covers the banner');
  await go('/?checkout=verify-1');
  check(await evaluate(`!!document.querySelector('.buy-overlay.open')`), 'mobile checkout opened');
  check(await evaluate(covered), 'mobile checkout covers the banner');

  // ---- Guide: card link, and the banner steps aside while the card is in view ----
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    console.log(`guide ${w}`);
    await viewport(w, h);
    await go('/guides/uc-piq-examples');
    const card = await evaluate(`(() => { const c = document.querySelector('[data-cross-promo-card]'); const a = c && c.querySelector('a');
      return c && { text: c.innerText, href: a.href, target: a.target }; })()`);
    check(card && card.href === blogUrl('uc-piq-examples') && card.target === '_blank', `${w}: card link is utm_medium=blog, utm_content=uc-piq-examples`);
    check(card && card.text.includes("Book a free call with Fatimah, Admitfolio's founder (bring a parent)."), `${w}: card copy`);
    m = await evaluate(MEASURE);
    check(m.suspended === 'false' && m.visibility === 'visible', `${w}: banner shows at the top of the guide`);
    await evaluate(`document.querySelector('[data-cross-promo-card]').scrollIntoView({ block: 'center', behavior: 'instant' })`);
    await wait(700);
    m = await evaluate(MEASURE);
    check(m.suspended === 'true' && m.visibility === 'hidden', `${w}: banner hides while the card is in view`);
    await shot(w === 1440 ? 'guide-card-desktop-1440' : 'guide-card-phone-390');
    await evaluate(`window.scrollTo({ top: 0, behavior: 'instant' })`);
    await wait(700);
    m = await evaluate(MEASURE);
    check(m.suspended === 'false' && m.visibility === 'visible', `${w}: banner comes back once the card scrolls out`);
  }
  const allGuides = await evaluate(`fetch('/guides').then(() => true)`);
  if (allGuides) {
    const slugs = ['college-essay-format', 'common-app-essay-examples', 'common-app-essay-word-count', 'engineering-application-essays',
      'how-to-start-a-college-essay', 'how-to-take-inspiration-from-college-essays', 'uc-piq-examples', 'why-this-college-essay-examples'];
    for (const slug of slugs) {
      const html = await (await fetch(`${appUrl}/guides/${slug}`)).text();
      check(html.includes(blogUrl(slug).replaceAll('&', '&amp;')), `${slug}: server-rendered card carries its own utm_content`);
    }
  }

  // ---- Pages the banner stays off ----
  console.log('excluded pages');
  await viewport(1440, 900);
  for (const p of ['/purchase/success', '/purchase/not-a-real-token', '/admin']) {
    await go(p);
    m = await evaluate(MEASURE);
    check(!m.present && !m.htmlOn, `no banner and no padding on ${p}`);
  }
  await go('/purchase/success');
  const success = await evaluate(`(() => { const a = [...document.querySelectorAll('a')].find((el) => el.href.startsWith('https://fatimahs.guide'));
    return a && { href: a.href, text: a.textContent.trim(), target: a.target, rel: a.rel }; })()`);
  check(success && success.href === SUCCESS_URL, 'payment received line is utm_medium=purchase, utm_content=success');
  check(success && success.text === "Book a free 1:1 call with Fatimah, Admitfolio's founder (bring a parent).", 'payment received copy');
  check(success && success.target === '_blank' && /noreferrer/.test(success.rel), 'payment received link opens a new tab without a referrer');
  await shot('payment-received-1440');

  // ---- Dismissal is remembered, and survives storage that throws ----
  console.log('dismissal');
  await go('/');
  await evaluate(`document.querySelector('.fg-promo-x').click()`);
  await wait(300);
  m = await evaluate(MEASURE);
  check(!m.present && !m.htmlOn, 'dismiss removes the banner and its padding');
  check(await evaluate(`localStorage.getItem('admitfolio:fg-promo-dismissed')`) === '1', 'dismissal written to localStorage');
  await go('/guides');
  check(!(await evaluate(MEASURE)).present, 'dismissal holds on the next page');
  await evaluate(`localStorage.removeItem('admitfolio:fg-promo-dismissed')`);
  const blocker = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage blocked'); } });` });
  await go('/');
  m = await evaluate(MEASURE);
  check(m.present, 'banner still shows when localStorage throws');
  await evaluate(`document.querySelector('.fg-promo-x').click()`);
  await wait(300);
  check(!(await evaluate(MEASURE)).present, 'and still dismisses for the visit');
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: blocker.result.identifier });

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
} finally {
  ws.close();
  chrome.kill();
}

console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall cross promo browser checks passed');
process.exit(failures.length ? 1 : 0);
