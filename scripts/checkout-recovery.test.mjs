import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'admitfolio-checkout-recovery-test-'));

try {
  const source = fs.readFileSync(path.join(root, 'lib/checkoutRecoveryCore.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: 'lib/checkoutRecoveryCore.ts',
  }).outputText;
  const compiled = path.join(outDir, 'checkoutRecoveryCore.js');
  fs.writeFileSync(compiled, output);
  const { checkoutRecoveryCandidate, recoverExpiredCheckout } = require(compiled);

  const now = new Date('2026-08-28T20:00:00.000Z');
  const validSession = {
    id: 'cs_test_recovery_123',
    status: 'expired',
    created: Math.floor(new Date('2026-08-27T19:00:00.000Z').getTime() / 1000),
    amount_total: 15_000,
    currency: 'usd',
    customer_email: 'Buyer@Example.com ',
    customer_details: { email: 'buyer@example.com' },
    consent: { promotions: 'opt_in' },
    after_expiration: {
      recovery: {
        enabled: true,
        url: 'https://buy.stripe.com/r/live_recovery_123',
        expires_at: Math.floor(new Date('2026-09-27T20:00:00.000Z').getTime() / 1000),
      },
    },
    metadata: {
      purchaseUnit: 'listing',
      listingId: 'listing_123',
      itemLabel: 'Columbia · 7 essays',
    },
  };

  const parsed = checkoutRecoveryCandidate(validSession, now);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error('Expected a valid recovery candidate.');
  assert.deepEqual(parsed.candidate, {
    stripeSessionId: 'cs_test_recovery_123',
    email: 'buyer@example.com',
    listingId: 'listing_123',
    itemLabel: 'Columbia · 7 essays',
    amountCents: 15_000,
    recoveryUrl: 'https://buy.stripe.com/r/live_recovery_123',
    recoveryExpiresAt: new Date('2026-09-27T20:00:00.000Z'),
    sessionCreatedAt: new Date('2026-08-27T19:00:00.000Z'),
  });

  assert.deepEqual(
    checkoutRecoveryCandidate({ ...validSession, consent: { promotions: 'opt_out' } }, now),
    { ok: false, reason: 'promotions_not_opted_in' },
  );
  assert.equal(
    checkoutRecoveryCandidate({
      ...validSession,
      after_expiration: { recovery: { ...validSession.after_expiration.recovery, url: 'https://example.com/phish' } },
    }, now).ok,
    false,
    'only a Stripe-hosted recovery URL may enter an email',
  );
  assert.deepEqual(
    checkoutRecoveryCandidate({
      ...validSession,
      after_expiration: {
        recovery: {
          ...validSession.after_expiration.recovery,
          expires_at: Math.floor(now.getTime() / 1000),
        },
      },
    }, now),
    { ok: false, reason: 'missing_or_expired_recovery_url' },
  );
  assert.equal(
    checkoutRecoveryCandidate({ ...validSession, metadata: { ...validSession.metadata, purchaseUnit: 'essay' } }, now).ok,
    false,
  );

  let state = 'pending';
  let sends = 0;
  let failed = null;
  const deps = {
    production: true,
    listingAvailable: async () => true,
    alreadyPurchased: async () => false,
    claim: async () => {
      if (state === 'sent') return { status: 'sent' };
      if (state === 'inflight') return { status: 'busy' };
      state = 'inflight';
      return { status: 'claimed', recoveryId: 'recovery_123' };
    },
    sendEmail: async () => { sends += 1; return { ok: true }; },
    markSent: async () => { state = 'sent'; },
    markFailed: async (_id, error) => { state = 'pending'; failed = error; },
  };

  const first = await recoverExpiredCheckout(validSession, deps, now);
  assert.deepEqual(first, { ok: true, status: 'sent' });
  assert.equal(sends, 1);
  const retry = await recoverExpiredCheckout(validSession, deps, now);
  assert.deepEqual(retry, { ok: true, status: 'already_sent' });
  assert.equal(sends, 1, 'a webhook retry must not resend the reminder');

  state = 'pending';
  const purchased = await recoverExpiredCheckout(validSession, {
    ...deps,
    alreadyPurchased: async () => true,
  }, now);
  assert.deepEqual(purchased, { ok: true, status: 'already_purchased' });
  assert.equal(sends, 1, 'a completed purchase must suppress cart recovery');

  const unavailable = await recoverExpiredCheckout(validSession, {
    ...deps,
    listingAvailable: async () => false,
  }, now);
  assert.deepEqual(unavailable, { ok: true, status: 'listing_unavailable' });

  state = 'inflight';
  const busy = await recoverExpiredCheckout(validSession, deps, now);
  assert.equal(busy.ok, false);
  assert.equal(busy.status, 'in_progress');

  state = 'pending';
  const rejected = await recoverExpiredCheckout(validSession, {
    ...deps,
    sendEmail: async () => ({ ok: false, status: 503, detail: 'provider unavailable' }),
  }, now);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.status, 'email_failed');
  assert.equal(state, 'pending', 'a failed send must release the lease for Stripe retry');
  assert.equal(failed, 'provider unavailable');

  state = 'pending';
  const simulated = await recoverExpiredCheckout(validSession, {
    ...deps,
    sendEmail: async () => ({ ok: true, simulated: true }),
  }, now);
  assert.equal(simulated.ok, false, 'production cannot mark a simulated email as sent');

  const commerceSource = fs.readFileSync(path.join(root, 'lib/commerce.ts'), 'utf8');
  const webhookSource = fs.readFileSync(path.join(root, 'app/api/stripe-webhook/route.ts'), 'utf8');
  const emailSource = fs.readFileSync(path.join(root, 'lib/email.ts'), 'utf8');
  const schemaSource = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  assert.match(commerceSource, /consent_collection:\s*\{ promotions: 'auto'/);
  assert.match(commerceSource, /after_expiration:[\s\S]*recovery:[\s\S]*enabled: true/);
  assert.match(webhookSource, /event\.type === 'checkout\.session\.expired'/);
  assert.match(emailSource, /This is the only cart reminder we will send\./);
  assert.match(emailSource, /idempotencyKey: `checkout-recovery\/\$\{recoveryId\}`/);
  assert.match(schemaSource, /model CheckoutRecoveryEmail[\s\S]*email\s+String\s+@unique/);

  console.log('checkout recovery tests passed');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
