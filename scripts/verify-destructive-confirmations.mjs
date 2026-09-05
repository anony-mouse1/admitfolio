#!/usr/bin/env node

// Checks that every outward-facing action asks before it runs.
//
// The admin console is verified live through /admin?preview=1, which renders
// against inline mock data with no session and no database and where every
// decision is a no-op. Nothing here touches a real listing or emails anyone.
// The app URL must be localhost: Next serves /_next/static only to the origin
// it was started on.

import fs from 'node:fs';

const chromePort = process.env.CHROME_DEBUG_PORT || '9223';
const appUrl = process.env.APP_URL || 'http://localhost:3000/';
const target = await fetch(`http://127.0.0.1:${chromePort}/json/new?${encodeURIComponent(appUrl)}`, { method: 'PUT' }).then((r) => r.json());
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
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') consoleErrors.push(message.params.entry.text);
});
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
function command(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(expression) {
  const r = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(expression, label, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(expression)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
function assert(condition, message) { if (!condition) throw new Error(message); }

await command('Page.enable');
await command('Runtime.enable');
await command('Log.enable');
await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const results = {};
for (const [label, buttonText] of [['approve', 'Approve & notify'], ['reject', 'Reject & notify'], ['verifyProof', 'Verify']]) {
  await command('Page.navigate', { url: 'about:blank' });
  await command('Page.navigate', { url: `${appUrl}admin?preview=1` });
  await waitFor("Boolean([...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Approve & notify'))", 'admin preview console');

  const before = await evaluate("document.querySelectorAll('[role=\"dialog\"]').length");
  assert(before === 0, `${label}: a dialog was already open before clicking`);

  const clicked = await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(n => n.textContent.trim() === ${JSON.stringify(buttonText)});
    if (!b) return false;
    b.click();
    return true;
  })()`);
  assert(clicked, `${label}: could not find its button in the preview console`);
  await waitFor("Boolean(document.querySelector('[role=\"dialog\"][aria-modal=\"true\"]'))", `${label} confirmation`);

  const dialog = await evaluate(`(() => {
    const d = document.querySelector('[role="dialog"][aria-modal="true"]');
    const buttons = [...d.querySelectorAll('button')].map(b => b.textContent.trim());
    return { title: d.querySelector('h2, h3')?.textContent.trim(), body: d.innerText, buttons };
  })()`);
  assert(dialog.title, `${label}: the confirmation has no title`);
  assert(dialog.buttons.length >= 2, `${label}: needs both a way forward and a way out`);
  assert(!/are you sure/i.test(dialog.body), `${label}: must state the consequence, not ask "are you sure"`);

  // Cancelling must leave the state untouched.
  const cancelled = await evaluate(`(() => {
    const d = document.querySelector('[role="dialog"][aria-modal="true"]');
    const b = [...d.querySelectorAll('button')].find(n => n.textContent.trim() === 'Not yet');
    if (!b) return false;
    b.click();
    return true;
  })()`);
  assert(cancelled, `${label}: no "Not yet" button to back out with`);
  await waitFor("document.querySelectorAll('[role=\"dialog\"][aria-modal=\"true\"]').length === 0", `${label} dismissal`);
  results[label] = dialog.title;
}

assert(consoleErrors.length === 0, `Browser errors: ${consoleErrors.slice(0, 2).join('; ')}`);

// Submit for review is inside the authenticated wizard, so it is checked here.
const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
assert(/onClick=\{\(\) => setConfirmSubmit\(true\)\}/.test(page), 'Submit for review must open a confirmation, not submit');
assert(/Send this listing for review\?/.test(page), 'and the confirmation must say what it does');
assert(/You cannot edit it once it has been reviewed/.test(page), 'and name the consequence that matters since #78');
const escBody = page.slice(page.indexOf('Escape closes the top-most overlay'), page.indexOf('Scroll-reveal animations'));
assert(escBody.indexOf('if (confirmSubmit)') < escBody.indexOf('else if (confirmTakedown)'), 'both confirmations sit above every other layer');
assert(/confirmTakedown !== null \|\| confirmSubmit;/.test(page), 'both must join the body scroll lock');

// Take down already shipped in #78 and must not be confirmed twice.
assert((page.match(/const \[confirmTakedown/g) || []).length === 1, 'take down keeps its single confirmation from #78');

console.log(JSON.stringify(results, null, 2));
console.log('destructive confirmation checks passed');
socket.close();
