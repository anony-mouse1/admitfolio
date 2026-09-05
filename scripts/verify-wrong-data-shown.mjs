#!/usr/bin/env node

// DOM-level check for the "wrong data shown" fixes. Start Next locally and
// Chrome with --remote-debugging-port=9223 before running this script.
//
// The app URL must be localhost, not 127.0.0.1. Next's dev server serves
// /_next/static chunks only to the origin it was started on, so a 127.0.0.1
// page gets 403 on its own JavaScript and the catalogue never hydrates.
//
// The seller dashboard is behind a login, so the money and price-input fixes
// are asserted against the source. What is reachable without a session is the
// public catalogue: duplicate admit schools, the unpriced-listing label, and
// the hero embed no longer reaching for a favicon service.

import fs from 'node:fs';

const chromePort = process.env.CHROME_DEBUG_PORT || '9223';
const appUrl = process.env.APP_URL || 'http://localhost:3000/';
const target = await fetch(`http://127.0.0.1:${chromePort}/json/new?${encodeURIComponent(appUrl)}`, { method: 'PUT' }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
const consoleErrors = [];
const blockedRequests = [];

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
  if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
    blockedRequests.push(`${message.params.response.status} ${message.params.response.url.slice(0, 100)}`);
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
await command('Network.enable');

// The hero embed used to pull ten school marks off Google's favicon service.
await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await command('Page.navigate', { url: `${appUrl}hero-loop-embed.html` });
await waitFor("document.querySelectorAll('.afl-badge').length > 0", 'hero embed badges');
await new Promise((resolve) => setTimeout(resolve, 3000));
const hero = await evaluate(`(() => {
  const imgs = [...document.querySelectorAll('.afl-badge img')];
  return {
    badges: document.querySelectorAll('.afl-badge').length,
    marks: imgs.length,
    remote: imgs.map(i => i.getAttribute('src')).filter(src => /^https?:/i.test(src)),
    broken: imgs.filter(i => i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src')),
  };
})()`);
assert(hero.badges > 0, 'Hero embed rendered no badges');
assert(hero.marks > 0, 'Hero embed rendered no school marks at all');
assert(hero.remote.length === 0, `Hero embed still loads remote marks: ${JSON.stringify(hero.remote)}`);
assert(hero.broken.length === 0, `Hero embed marks failed to load: ${JSON.stringify(hero.broken)}`);
const heroCsp = consoleErrors.filter((t) => t.includes('Content Security Policy'));
assert(heroCsp.length === 0, `Hero embed still trips CSP: ${heroCsp.slice(0, 2).join('; ')}`);

// Public catalogue: no duplicate admit schools, no "Free".
await command('Page.navigate', { url: 'about:blank' });
await command('Page.navigate', { url: `${appUrl}#browse` });
await waitFor("document.querySelectorAll('.public-grid .catalog-card').length > 0", 'catalogue');
const cards = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('.public-grid .catalog-card')];
  const dupes = [];
  for (const card of rows) {
    const line = card.querySelector('.admit-names.multi')?.textContent.trim() ?? '';
    const names = line.split(',').map(s => s.trim()).filter(s => s && !/^\\+\\d+ more$/.test(s));
    const seen = new Set();
    for (const name of names) {
      if (seen.has(name)) { dupes.push({ line, name }); break; }
      seen.add(name);
    }
  }
  return {
    cards: rows.length,
    dupes,
    free: document.body.innerText.includes('Free'),
    priceUnavailable: document.body.innerText.includes('Price unavailable'),
  };
})()`);
assert(cards.cards > 0, 'No catalogue cards');
assert(cards.dupes.length === 0, `Duplicate schools still render: ${JSON.stringify(cards.dupes.slice(0, 3))}`);
assert(!cards.free, 'The word "Free" is still rendered somewhere in the catalogue');

// Detail sheet: chips must not repeat a school either.
await evaluate("document.querySelector('.public-grid .catalog-card').click()");
await waitFor("Boolean(document.querySelector('.sheet'))", 'detail sheet');
await waitFor("document.querySelectorAll('.sheet .d-school').length > 0", 'admit chips');
// Scope to the "Admitted to" row. The "Now attends" row reuses .d-school for
// the seller's current university, which is legitimately also one of their
// admits, so an unscoped selector reports a duplicate that is not one.
const chipLabels = await evaluate(`(() => {
  const row = [...document.querySelectorAll('.sheet .d-overview-row')]
    .find(r => r.querySelector('.d-overview-label')?.textContent.trim() === 'Admitted to');
  if (!row) return [];
  return [...row.querySelectorAll('.d-school')].map(chip => {
    let label = chip.textContent;
    for (const part of chip.querySelectorAll('.badge, .d-verified')) label = label.replace(part.textContent, '');
    return label.trim();
  });
})()`);
assert(new Set(chipLabels).size === chipLabels.length, `Detail sheet repeats a school chip: ${JSON.stringify(chipLabels)}`);

const otherErrors = consoleErrors.filter((t) => !t.includes('Content Security Policy'));
assert(otherErrors.length === 0, `Browser errors: ${otherErrors.slice(0, 3).join('; ')}`);

// Behind the seller login, so asserted against the source.
const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
assert(/totalStripeFee: sellerAccounting[\s\S]{0,120}?: null,/.test(page), 'An unknown Stripe fee must be null, never 0');
assert(!/round2\(totalGross \* SELLER_SHARE\)/.test(page), 'Net earnings must not fall back to a share of gross, which omits the Stripe fee');
assert(/n == null \? 'Not available'/.test(page), 'A figure the API never sent must render as "Not available"');
assert(/accountingPending && n === 0 \? 'Pending'/.test(page), 'A zero total with sales still settling must render as "Pending"');
assert(!/: 'Free'/.test(page), 'An unpriced listing must never render as "Free"');
// The wizard keeps its two inputs; the dashboard's two moved into the inline
// price panel when that stopped rendering after the whole workspace. Still four
// in total, still whole-dollar stepped and still capped.
const pricePanel = fs.readFileSync(new URL('../components/seller/ListingPricePanel.tsx', import.meta.url), 'utf8');
const stepped = (page.match(/step=\{1\}/g) || []).length + (pricePanel.match(/step=\{1\}/g) || []).length;
assert(stepped === 4, `All four price inputs must be whole-dollar stepped, found ${stepped}`);
assert((page.match(/max=\{MAX_PACKAGE_PRICE\}/g) || []).length === 1, 'the wizard package input must be capped');
assert((page.match(/max=\{MAX_ESSAY_PRICE\}/g) || []).length === 1, 'the wizard essay input must be capped');
assert((pricePanel.match(/max=\{max\}/g) || []).length === 2, 'both dashboard price inputs must be capped');
assert(/MAX_PACKAGE_PRICE = 399/.test(pricePanel) && /MAX_ESSAY_PRICE = 99/.test(pricePanel), 'the panel must use the same caps as the wizard');
assert(/Number\.isInteger/.test(page) && /Number\.isInteger/.test(pricePanel), 'A price with cents must be rejected before submit');

const view = fs.readFileSync(new URL('../lib/sellerDashboardView.ts', import.meta.url), 'utf8');
assert(/rows\.some\(isAdminApprovedListing\)/.test(view), 'Seller-wide verification must read the unmapped rows');

console.log(JSON.stringify({ hero, cards, chipLabels, blockedRequests, otherErrors }, null, 2));
console.log('wrong data shown checks passed');
socket.close();
