#!/usr/bin/env node

// DOM-level check for the copy and cosmetics fixes. Start Next locally and
// Chrome with --remote-debugging-port=9223 before running this script.
//
// The app URL must be localhost, not 127.0.0.1. Next's dev server serves
// /_next/static chunks only to the origin it was started on, so a 127.0.0.1
// page gets 403 on its own JavaScript and the catalogue never hydrates.
//
// Covers: the "Accepted at" card label, Blog under Product in the footer, no em
// dashes in rendered copy, and school-resolved logo alt text. The proof-row
// separator and the essay-row key live inside the authenticated sell wizard, so
// they are checked against the source instead.

import fs from 'node:fs';

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

await command('Page.enable');
await command('Runtime.enable');
await command('Log.enable');
await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await command('Page.navigate', { url: `${appUrl}#browse` });
await waitFor("document.querySelectorAll('.public-grid .catalog-card').length > 0", 'desktop catalogue');

const desktop = await evaluate(`(() => {
  // AGENTS.md exempts the students' own writing, so strip every element that
  // renders seller text before looking for em dashes. What is left is site copy.
  const SELLER_TEXT = '.ecard-hook, .ecard-prompt, .ecard-meta, .d-sub, .d-teaser, .d-essays, .d-essay-summary-copy, .admit-names, .d-school, .ecard-school';
  const chromeText = () => {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll(SELLER_TEXT).forEach(node => node.remove());
    document.body.appendChild(clone);
    const text = clone.innerText;
    clone.remove();
    return text;
  };
  const body = document.body.innerText;
  const labels = [...document.querySelectorAll('.ecard-admits-label')].map(n => n.textContent.trim());
  const col = (title) => {
    const heading = [...document.querySelectorAll('footer .foot-col-title')].find(n => n.textContent.trim() === title);
    return heading ? [...heading.nextElementSibling.querySelectorAll('a')].map(a => a.textContent.trim()) : null;
  };
  return {
    cards: document.querySelectorAll('.public-grid .catalog-card').length,
    acceptedAt: labels.filter(t => t === 'Accepted at:').length,
    acceptedIn: labels.filter(t => t.startsWith('Accepted in')).length,
    bodyHasAcceptedIn: body.includes('Accepted in'),
    emDashes: chromeText().match(/\\u2014/g)?.length ?? 0,
    emDashContext: chromeText().split('\\n').filter(line => line.includes('\\u2014')).slice(0, 5),
    product: col('Product'),
    legal: col('Legal'),
    overflow: document.documentElement.scrollWidth - innerWidth,
  };
})()`);

assert(desktop.cards > 0, 'No catalogue cards rendered');
assert(desktop.acceptedAt === desktop.cards, `Expected ${desktop.cards} "Accepted at:" labels, got ${desktop.acceptedAt}`);
assert(desktop.acceptedIn === 0, `Still ${desktop.acceptedIn} "Accepted in" labels`);
assert(!desktop.bodyHasAcceptedIn, 'The string "Accepted in" is still rendered somewhere on the page');
assert(desktop.emDashes === 0, `Em dashes in site copy: ${JSON.stringify(desktop.emDashContext)}`);
assert(desktop.product?.includes('Blog'), `Blog is not in the Product footer column: ${JSON.stringify(desktop.product)}`);
assert(!desktop.legal?.includes('Blog'), `Blog is still in the Legal footer column: ${JSON.stringify(desktop.legal)}`);
assert(desktop.legal?.length === 2, `Legal column should hold Privacy and Terms only: ${JSON.stringify(desktop.legal)}`);
assert(desktop.overflow <= 1, `Desktop page overflows by ${desktop.overflow}px`);

// Logo alt text: on the detail sheet each school chip renders the resolved
// short name beside its badge, so the alt must now agree with it.
await evaluate("document.querySelector('.public-grid .catalog-card').click()");
await waitFor("Boolean(document.querySelector('.sheet'))", 'listing detail sheet');
await waitFor("document.querySelectorAll('.sheet .d-school').length > 0", 'admit chips');
// The chip is [badge monogram][short label][optional tick], so strip the badge
// and the tick to recover the label the resolver produced.
const chips = await evaluate(`[...document.querySelectorAll('.sheet .d-school')].map(chip => {
  let label = chip.textContent;
  for (const part of chip.querySelectorAll('.badge, .d-verified')) label = label.replace(part.textContent, '');
  return {
    label: label.trim(),
    alt: chip.querySelector('img.badge-logo')?.getAttribute('alt') ?? null,
    raw: chip.getAttribute('title'),
  };
})`);
const withLogo = chips.filter((chip) => chip.alt);
assert(withLogo.length > 0, 'No school chip rendered a logo, so alt text could not be checked');
for (const chip of withLogo) {
  assert(chip.alt === `${chip.label} logo`, `Alt text is not the resolved short name: alt="${chip.alt}" label="${chip.label}" raw="${chip.raw}"`);
}
const resolved = withLogo.filter((chip) => chip.raw && chip.raw !== chip.label);
await evaluate("document.querySelector('.sheet-x')?.click()");

await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
// about:blank first, so this is a real navigation even when the desktop pass
// already left the URL on #browse. Issuing a reload straight after a navigate
// cancels it and leaves the page with no catalogue.
await command('Page.navigate', { url: 'about:blank' });
await command('Page.navigate', { url: `${appUrl}#browse` });
await waitFor("document.querySelectorAll('.public-grid .catalog-card').length > 0", 'mobile catalogue');
const mobile = await evaluate(`(() => {
  const SELLER_TEXT = '.ecard-hook, .ecard-prompt, .ecard-meta, .d-sub, .d-teaser, .d-essays, .d-essay-summary-copy, .admit-names, .d-school, .ecard-school';
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll(SELLER_TEXT).forEach(node => node.remove());
  document.body.appendChild(clone);
  const chrome = clone.innerText;
  clone.remove();
  return {
    cards: document.querySelectorAll('.public-grid .catalog-card').length,
    acceptedAt: [...document.querySelectorAll('.ecard-admits-label')].filter(n => n.textContent.trim() === 'Accepted at:').length,
    emDashes: chrome.match(/\\u2014/g)?.length ?? 0,
    overflow: document.documentElement.scrollWidth - innerWidth,
  };
})()`);
assert(mobile.cards > 0, 'No mobile catalogue cards');
assert(mobile.acceptedAt === mobile.cards, 'Mobile cards are missing the "Accepted at:" label');
assert(mobile.emDashes === 0, 'Em dashes in mobile site copy');
assert(mobile.overflow <= 1, `Mobile page overflows by ${mobile.overflow}px`);
// public/hero-loop-embed.html asks Google's favicon service for ten school
// marks and CSP blocks every one, so the homepage logs those on every load.
// Pre-existing and reported separately, not caused by this batch. Counted and
// reported rather than ignored, so it stays visible until it is fixed.
const knownHeroFaviconCsp = (text) => text.includes('google.com/s2/favicons') && text.includes('Content Security Policy');
const heroFaviconErrors = consoleErrors.filter(knownHeroFaviconCsp);
const otherErrors = consoleErrors.filter((text) => !knownHeroFaviconCsp(text));
assert(otherErrors.length === 0, `Browser errors: ${otherErrors.join('; ')}`);

// Source-level, because both sit inside the authenticated sell wizard.
const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
assert(
  /<span className="proof-school">\{a\.label\}<\/span>[\s\S]{0,600}?<span className="sr-only">/.test(page),
  'The proof row needs real separator text between the school and the filename',
);
assert(/<div className="essay-row" key=\{row\.clientKey\}>/.test(page), 'Essay rows must be keyed by clientKey');
assert(!/<div className="essay-row" key=\{i\}>/.test(page), 'Essay rows must not be keyed by index');

console.log(JSON.stringify({ desktop, chips, resolvedShortNames: resolved.length, mobile, heroFaviconErrors: heroFaviconErrors.length, otherErrors }, null, 2));
console.log('copy and cosmetics checks passed');
socket.close();
