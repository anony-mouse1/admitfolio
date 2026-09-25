// Seller-set prices: the $10 minimum, the caps and whole dollars only.
//
// The three routes that save a price are run for real here, with the form
// bypassed: each handler is transpiled and called directly with a raw request
// body. Only the database, the session, email and the review runner are
// replaced, by in-memory stubs. The database stub records every call, so a
// refused price is also proven to have touched nothing. No network, no
// production database.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'admitfolio-seller-pricing-'));

// ---- A tiny module linker: real TypeScript for our code, stubs for the rest.

const db = { calls: [], handlers: {} };
globalThis.__sellerPricingTest = { db, seller: null };

const STUBS = {
  'next/server': `export const NextResponse = { json: (body, init) => ({ status: init?.status ?? 200, body }) };`,
  '@vercel/functions': `export const waitUntil = () => {};`,
  '@/lib/prisma': `
    const { db } = globalThis.__sellerPricingTest;
    const model = (name) => new Proxy({}, { get: (_, method) => async (args) => {
      db.calls.push({ call: name + '.' + String(method), args });
      const handler = db.handlers[name + '.' + String(method)];
      if (!handler) throw new Error('Unexpected database call: ' + name + '.' + String(method));
      return handler(args);
    } });
    export const prisma = new Proxy({}, { get: (_, name) => name === '$transaction'
      ? async (ops) => { db.calls.push({ call: '$transaction', args: ops.length }); return Promise.all(ops); }
      : model(String(name)) });`,
  '@/lib/sellerAuth': `export const currentSeller = async () => globalThis.__sellerPricingTest.seller;`,
  '@/lib/authenticatedSeller': `export const authenticatedSeller = async () => globalThis.__sellerPricingTest.seller;`,
  '@/lib/email': `export const sendAdminSubmissionNotification = async () => {}; export const sendSubmissionConfirmation = async () => {};`,
  '@/lib/uploadToken': `export const makeUploadToken = () => 'token';`,
  '@/lib/reviewRunner': `export const reviewListing = async () => {};`,
};

const linked = new Map();
function link(file) {
  if (linked.has(file)) return linked.get(file);
  const out = path.join(outDir, `m${linked.size}.mjs`);
  linked.set(file, out);
  let code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  }).outputText;
  code = code.replace(/(from\s+|import\s+)(['"])([^'"]+)\2/g, (_, lead, quote, spec) => `${lead}${quote}${pathToFileURL(resolve(spec, file)).href}${quote}`);
  fs.writeFileSync(out, code);
  return out;
}
function resolve(spec, from) {
  if (spec in STUBS) {
    const out = path.join(outDir, `stub-${spec.replace(/[^a-z0-9]+/gi, '-')}.mjs`);
    if (!fs.existsSync(out)) fs.writeFileSync(out, STUBS[spec]);
    return out;
  }
  if (spec === 'server-only') {
    const out = path.join(outDir, 'server-only.mjs');
    fs.writeFileSync(out, '');
    return out;
  }
  const base = spec.startsWith('@/') ? path.join(root, spec.slice(2))
    : spec.startsWith('.') ? path.resolve(path.dirname(from), spec)
    : null;
  if (!base) throw new Error(`No stub for "${spec}" imported by ${path.relative(root, from)}`);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate)) return link(candidate);
  }
  throw new Error(`Cannot resolve "${spec}" from ${path.relative(root, from)}`);
}
const load = async (relative) => import(pathToFileURL(link(path.join(root, relative))).href);

try {
  const pricing = await load('lib/pricing.ts');
  const { sanitizeSellerDraftState } = await load('lib/sellerDraft.ts');
  const listingPrice = await load('app/api/seller/listing-price/route.ts');
  const submitListing = await load('app/api/submit-listing/route.ts');
  const finalize = await load('app/api/seller/drafts/[id]/finalize/route.ts');

  const MIN = 'The lowest price you can set is $10.';
  const CENTS = 'Whole dollars only, no cents. Round to the nearest dollar.';
  const PACKAGE_CAP = 'The most you can charge for one listing is $399.';
  const ESSAY_CAP = 'The most you can charge for one essay is $99.';

  // ---- The rule itself ----------------------------------------------------
  const { checkPrice } = pricing;
  assert.equal(pricing.MIN_PRICE, 10);
  assert.equal(pricing.MAX_PACKAGE_PRICE, 399);
  assert.equal(pricing.MAX_ESSAY_PRICE, 99);
  for (const [value, kind, expected] of [
    [10, 'package', { ok: true, price: 10 }],
    ['10', 'package', { ok: true, price: 10 }],
    [399, 'package', { ok: true, price: 399 }],
    [99, 'essay', { ok: true, price: 99 }],
    [9, 'package', { ok: false, error: MIN }],
    [9, 'essay', { ok: false, error: MIN }],
    [0, 'package', { ok: false, error: MIN }],
    [-20, 'package', { ok: false, error: MIN }],
    [12.5, 'package', { ok: false, error: CENTS }],
    ['12.50', 'package', { ok: false, error: CENTS }],
    [9.99, 'package', { ok: false, error: CENTS }],
    [400, 'package', { ok: false, error: PACKAGE_CAP }],
    [100, 'essay', { ok: false, error: ESSAY_CAP }],
    [null, 'package', { ok: false, error: 'Set a package price.' }],
    ['', 'package', { ok: false, error: 'Set a package price.' }],
    ['abc', 'package', { ok: false, error: 'Set a package price.' }],
    [true, 'package', { ok: false, error: 'Set a package price.' }],
    [Infinity, 'package', { ok: false, error: 'Set a package price.' }],
    [undefined, 'essay', { ok: false, error: 'Set a price for every essay.' }],
  ]) {
    assert.deepEqual(checkPrice(value, kind), expected, `checkPrice(${JSON.stringify(value)}, ${kind})`);
  }

  // The recommendation is the old floor, unchanged, and is not a minimum.
  assert.equal(pricing.recommendedPackagePrice(1, 3), 76);
  assert.equal(pricing.recommendedPackagePrice(3, 1), 20);
  assert.equal(pricing.recommendedEssayPrice(2), 22);
  assert.equal(checkPrice(pricing.recommendedPackagePrice(1, 3) - 50, 'package').ok, true, 'a price under the recommendation is allowed');

  // ---- Drafts keep the price as typed, so finalize can refuse cents --------
  assert.equal(sanitizeSellerDraftState({ packagePrice: '12.50' }).packagePrice, 12.5);
  assert.equal(sanitizeSellerDraftState({ packagePrice: 40 }).packagePrice, 40);

  // ---- Route 1: dashboard price edit, /api/seller/listing-price -------------
  const OWNER = { id: 'seller-1', email: 'seller@example.edu' };
  const reset = (handlers = {}) => { db.calls = []; db.handlers = handlers; };
  const writes = () => db.calls.filter((c) => !/\.(find|count)/.test(c.call));
  const request = (body) => ({ json: async () => body });

  const packageListing = {
    id: 'listing-1', seller: OWNER, pricingMode: 'package', packagePrice: 76,
    essays: [{ id: 'e1', price: null }, { id: 'e2', price: null }, { id: 'e3', price: null }],
  };
  const separateListing = { ...packageListing, id: 'listing-2', pricingMode: 'separate', packagePrice: null, essays: [{ id: 'e1', price: 30 }] };
  const routeResults = [];

  globalThis.__sellerPricingTest.seller = OWNER;
  for (const [price, status, error] of [[9, 400, MIN], [12.5, 400, CENTS], ['12.50', 400, CENTS], [400, 400, PACKAGE_CAP], [0, 400, MIN], [null, 400, 'Set a package price.']]) {
    reset({ 'listing.findUnique': async () => packageListing, 'listing.update': async () => ({}) });
    const res = await listingPrice.POST(request({ listingId: 'listing-1', packagePrice: price }));
    assert.equal(res.status, status, `listing-price $${price}`);
    assert.equal(res.body.error, error, `listing-price $${price} message`);
    assert.equal(writes().length, 0, `listing-price $${price} must not write`);
    routeResults.push(['listing-price', 'package', JSON.stringify(price), res.status, res.body.error]);
  }
  for (const price of [10, 399]) {
    reset({ 'listing.findUnique': async () => packageListing, 'listing.update': async (args) => args });
    const res = await listingPrice.POST(request({ listingId: 'listing-1', packagePrice: price }));
    assert.equal(res.status, 200, `listing-price $${price} is allowed`);
    assert.deepEqual(writes().map((c) => c.args.data), [{ packagePrice: price }], `listing-price $${price} saves exactly that price`);
    routeResults.push(['listing-price', 'package', String(price), res.status, 'saved (stub)']);
  }
  for (const [price, error] of [[9, MIN], [12.5, CENTS], [100, ESSAY_CAP]]) {
    reset({ 'listing.findUnique': async () => separateListing, 'essay.update': async () => ({}) });
    const res = await listingPrice.POST(request({ listingId: 'listing-2', essayPrices: { e1: price } }));
    assert.equal(res.status, 400);
    assert.equal(res.body.error, error);
    assert.equal(writes().length, 0, `per-essay $${price} must not write`);
    routeResults.push(['listing-price', 'per essay', String(price), res.status, res.body.error]);
  }
  reset({ 'listing.findUnique': async () => separateListing, 'essay.update': async (args) => args });
  assert.equal((await listingPrice.POST(request({ listingId: 'listing-2', essayPrices: { e1: 10 } }))).status, 200, 'per-essay $10 is allowed');

  // ---- Route 2: direct submit, /api/submit-listing ----------------------------
  const submitBody = (pricing) => ({
    school: 'Stanford University',
    targetSchool: 'Harvard University',
    admitTags: ['Harvard University'],
    applicationSystem: 'Common App',
    essays: [{ prompt: 'Personal statement', contentHash: 'a'.repeat(64), price: pricing.essayPrice }],
    pricingMode: pricing.mode,
    packagePrice: pricing.packagePrice,
  });
  for (const [mode, price, error] of [
    ['package', 9, MIN], ['package', 12.5, CENTS], ['package', 400, PACKAGE_CAP],
    ['separate', 9, MIN], ['separate', 12.5, CENTS], ['separate', 100, ESSAY_CAP],
  ]) {
    reset();
    const body = submitBody(mode === 'package' ? { mode, packagePrice: price } : { mode, essayPrice: price });
    const res = await submitListing.POST(request(body));
    assert.equal(res.status, 400, `submit-listing ${mode} $${price}`);
    assert.equal(res.body.error, error, `submit-listing ${mode} $${price} message`);
    assert.equal(db.calls.length, 0, `submit-listing ${mode} $${price} must not reach the database at all`);
    routeResults.push(['submit-listing', mode, String(price), res.status, res.body.error]);
  }
  for (const [mode, price] of [['package', 10], ['separate', 10]]) {
    // A valid price gets past the price check to the seller lookup, which the
    // stub answers with "no seller", so nothing is ever created.
    reset({ 'seller.findFirst': async () => null });
    const body = submitBody(mode === 'package' ? { mode, packagePrice: price } : { mode, essayPrice: price });
    const res = await submitListing.POST(request(body));
    assert.equal(res.body.error, 'Seller account not found.', `submit-listing ${mode} $${price} passes the price check`);
    assert.equal(writes().length, 0);
    routeResults.push(['submit-listing', mode, String(price), res.status, 'passed price check']);
  }

  // ---- Route 3: saved-draft submit, /api/seller/drafts/[id]/finalize ----------
  const draftWith = (packagePrice) => ({
    id: 'draft-1', status: 'draft', finalizedListingId: null, sourceListing: null, assets: [],
    state: {
      currentUniversity: 'Stanford University', applicationSystem: 'Common App',
      targetSchool: 'Harvard University', admits: ['Harvard University'],
      essays: [{ clientKey: 'essay-1', prompt: 'Personal statement' }], packagePrice,
    },
  });
  const params = { params: Promise.resolve({ id: 'draft-1' }) };
  for (const [price, error] of [[9, MIN], [12.5, CENTS], ['12.50', CENTS], [400, PACKAGE_CAP], [null, 'Set a package price.']]) {
    reset({ 'sellerApplicationDraft.findFirst': async () => draftWith(price) });
    const res = await finalize.POST(request({}), params);
    assert.equal(res.status, 400, `finalize $${price}`);
    assert.equal(res.body.error, error, `finalize $${price} message`);
    assert.equal(writes().length, 0, `finalize $${price} must not write`);
    routeResults.push(['finalize', 'package', JSON.stringify(price), res.status, res.body.error]);
  }
  reset({ 'sellerApplicationDraft.findFirst': async () => draftWith(10) });
  const passed = await finalize.POST(request({}), params);
  // The draft has no uploaded files, so the next check stops it. Reaching that
  // check is the proof that $10 was accepted.
  assert.equal(passed.body.error, 'Upload a PDF for every essay before submitting.', 'finalize $10 passes the price check');
  assert.equal(writes().length, 0);
  routeResults.push(['finalize', 'package', '10', passed.status, 'passed price check']);

  console.table(routeResults.map(([route, mode, price, status, result]) => ({ route, mode, price, status, result })));
  console.log('seller pricing tests passed');
} finally {
  delete globalThis.__sellerPricingTest;
  fs.rmSync(outDir, { recursive: true, force: true });
}
