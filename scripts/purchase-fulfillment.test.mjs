import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'admitfolio-fulfillment-test-'));

function compile(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const destination = path.join(outDir, path.basename(file, '.ts') + '.js');
  fs.writeFileSync(destination, output);
  return destination;
}

function loadTypeScriptInMemory(file, transform = (source) => source) {
  const filename = path.join(root, file);
  const source = transform(fs.readFileSync(filename, 'utf8'));
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = createRequire(filename);
  const evaluate = new Function('require', 'module', 'exports', '__filename', '__dirname', output);
  evaluate(localRequire, loaded, loaded.exports, filename, path.dirname(filename));
  return loaded.exports;
}

try {
  const fingerprintModule = require(compile('lib/purchaseFingerprint.ts'));
  const ipModule = require(compile('lib/requestIp.ts'));
  const coreModule = require(compile('lib/purchaseFulfillmentCore.ts'));
  const watermarkModule = loadTypeScriptInMemory(
    'lib/watermark.ts',
    (source) => source.replace("import 'server-only';", ''),
  );

  const secret = 'test-secret-at-least-sixteen-characters';
  const fingerprint = fingerprintModule.makePurchaseFingerprint('purchase-1', 'Buyer@Example.com ', secret);
  assert.match(fingerprint, /^AF-(?:[A-F0-9]{4}-){4}[A-F0-9]{4}$/);
  assert.equal(
    fingerprint,
    fingerprintModule.makePurchaseFingerprint('purchase-1', 'buyer@example.com', secret),
    'email normalization must keep the purchase fingerprint stable',
  );
  assert.notEqual(fingerprint, fingerprintModule.makePurchaseFingerprint('purchase-2', 'buyer@example.com', secret));
  assert.ok(!fingerprint.includes('buyer'), 'fingerprint must not expose buyer identity');

  const { PDFDocument } = require('pdf-lib');
  const sample = await PDFDocument.create();
  sample.addPage([612, 792]);
  const stamped = await watermarkModule.watermarkPdf(
    Buffer.from(await sample.save()),
    { fingerprint, viewedAt: new Date('2026-08-17T00:00:00.000Z') },
  );
  const stampedPdf = await PDFDocument.load(stamped);
  const metadata = [stampedPdf.getTitle(), stampedPdf.getSubject(), stampedPdf.getKeywords()].join(' ');
  assert.ok(metadata.includes(fingerprint), 'watermarked PDF metadata must carry the lookup fingerprint');
  assert.ok(!metadata.includes('buyer@example.com'), 'watermarked PDF must not expose the buyer email');
  assert.ok(!metadata.includes('purchase-1'), 'watermarked PDF must not expose the internal purchase id');
  const footer = watermarkModule.watermarkFooterText({ fingerprint, viewedAt: new Date('2026-08-17T00:00:00.000Z') });
  assert.ok(footer.includes(fingerprint));
  assert.ok(!footer.includes('buyer@example.com'));

  const readerSource = fs.readFileSync(path.join(root, 'components/EssayReader.tsx'), 'utf8');
  assert.match(
    readerSource,
    /webpackIgnore:\s*true/,
    'the browser must load pdf.js without passing its ESM build through Next 14 webpack',
  );
  assert.match(
    readerSource,
    /\}, \[open, essayId, token\]\);/,
    'loading state changes must not cancel the active PDF render effect',
  );
  for (const asset of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
    assert.deepEqual(
      fs.readFileSync(path.join(root, 'public/vendor/pdfjs', asset)),
      fs.readFileSync(path.join(root, 'node_modules/pdfjs-dist/build', asset)),
      `${asset} must match the installed pdf.js version`,
    );
  }

  const headers = (values) => ({ get: (name) => values[name] || null });
  assert.equal(
    ipModule.clientIpFromHeaders(headers({
      'x-vercel-forwarded-for': '203.0.113.19',
      'x-forwarded-for': '198.51.100.5, 10.0.0.1',
    })),
    '203.0.113.19',
    'trusted edge header should win over the generic forwarding chain',
  );
  assert.equal(ipModule.clientIpFromHeaders(headers({ 'x-real-ip': '[2001:db8::8]:443' })), '2001:db8::8');
  assert.equal(ipModule.clientIpFromHeaders(headers({ 'x-forwarded-for': 'not-an-ip' })), null);

  const input = {
    purchaseId: 'purchase-1',
    listingId: 'listing-1',
    buyerEmail: 'buyer@example.com',
    buyerIp: '203.0.113.19',
    itemLabel: 'Harvard · 2 essays',
    amountCents: 4500,
  };

  let state = 'pending';
  let emails = 0;
  let failed = null;
  const deps = {
    production: true,
    fingerprint: () => fingerprint,
    accessUrl: () => 'https://admitfolio.test/purchase/signed-token',
    claim: async () => {
      if (state === 'sent') return 'sent';
      if (state === 'inflight') return 'busy';
      state = 'inflight';
      return 'claimed';
    },
    sendEmail: async () => { emails += 1; return { ok: true }; },
    markSent: async () => { state = 'sent'; },
    markFailed: async (_purchaseId, _fingerprint, error) => { state = 'pending'; failed = error; },
  };

  const first = await coreModule.fulfillPurchaseCore(input, deps);
  assert.equal(first.status, 'fulfilled');
  assert.equal(first.ok, true);
  assert.equal(emails, 1);

  const retry = await coreModule.fulfillPurchaseCore(input, deps);
  assert.equal(retry.status, 'already_fulfilled');
  assert.equal(retry.ok, true);
  assert.equal(emails, 1, 'a webhook retry must not resend the buyer email');

  state = 'inflight';
  const busy = await coreModule.fulfillPurchaseCore(input, deps);
  assert.equal(busy.status, 'in_progress');
  assert.equal(busy.ok, false, 'a live lease must keep Stripe retrying in case the owner crashes');

  state = 'pending';
  const failedResult = await coreModule.fulfillPurchaseCore(input, {
    ...deps,
    sendEmail: async () => ({ ok: false, status: 503, detail: 'provider unavailable' }),
  });
  assert.equal(failedResult.status, 'email_failed');
  assert.equal(failedResult.ok, false);
  assert.equal(state, 'pending', 'a failed send must release the delivery lease for retry');
  assert.equal(failed, 'provider unavailable');

  state = 'pending';
  const simulatedProduction = await coreModule.fulfillPurchaseCore(input, {
    ...deps,
    sendEmail: async () => ({ ok: true, simulated: true }),
  });
  assert.equal(simulatedProduction.ok, false, 'simulation must not mark a production purchase delivered');
  assert.equal(simulatedProduction.status, 'email_failed');

  const invalid = await coreModule.fulfillPurchaseCore({ ...input, buyerEmail: 'invalid' }, deps);
  assert.equal(invalid.status, 'invalid');
  assert.equal(invalid.ok, false);

  const mismatch = await coreModule.fulfillPurchaseCore(input, {
    ...deps,
    claim: async () => 'purchase_mismatch',
  });
  assert.equal(mismatch.status, 'invalid');
  assert.match(mismatch.error, /stored purchase/);

  console.log('purchase fulfillment tests passed');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
