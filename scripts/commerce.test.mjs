import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'admitfolio-commerce-test-'));

try {
  for (const file of ['lib/schools.ts', 'lib/listingSchool.ts', 'lib/pricing.ts', 'lib/commerce.ts']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: file,
    }).outputText;
    fs.writeFileSync(path.join(outDir, path.basename(file, '.ts') + '.js'), output);
  }

  const {
    CHECKOUT_VERSION,
    PURCHASE_UNIT,
    checkoutSessionParams,
    paidListingSession,
    purchaseAccounting,
    quoteListing,
    splitForCheckoutVersion,
    splitRevenueCents,
  } = require(path.join(outDir, 'commerce.js'));

  assert.deepEqual(splitRevenueCents(4_500), {
    grossAmountCents: 4_500,
    sellerEarningsCents: 2_700,
    platformFeeCents: 1_800,
    sellerShareBps: 6_000,
  });
  assert.deepEqual(splitRevenueCents(101), {
    grossAmountCents: 101,
    sellerEarningsCents: 61,
    platformFeeCents: 40,
    sellerShareBps: 6_000,
  });
  assert.deepEqual(splitRevenueCents(4_500, 7_000), {
    grossAmountCents: 4_500,
    sellerEarningsCents: 3_150,
    platformFeeCents: 1_350,
    sellerShareBps: 7_000,
  });
  assert.equal(splitForCheckoutVersion(4_500, CHECKOUT_VERSION).sellerEarningsCents, 2_700);
  assert.equal(splitForCheckoutVersion(4_500, null).sellerEarningsCents, 2_700);
  assert.throws(() => splitForCheckoutVersion(4_500, '3'), /Unsupported checkout version/);
  assert.deepEqual(
    purchaseAccounting({
      amount: 45,
      grossAmountCents: null,
      sellerEarningsCents: null,
      platformFeeCents: null,
      sellerShareBps: null,
    }),
    {
      grossAmountCents: 4_500,
      sellerEarningsCents: 2_700,
      platformFeeCents: 1_800,
      sellerShareBps: 6_000,
    },
  );
  assert.deepEqual(
    purchaseAccounting({
      amount: 45,
      grossAmountCents: 4_500,
      sellerEarningsCents: 2_700,
      platformFeeCents: 1_800,
      sellerShareBps: 6_000,
    }),
    {
      grossAmountCents: 4_500,
      sellerEarningsCents: 2_700,
      platformFeeCents: 1_800,
      sellerShareBps: 6_000,
    },
  );
  assert.throws(
    () => purchaseAccounting({
      amount: 45,
      grossAmountCents: 4_500,
      sellerEarningsCents: null,
      platformFeeCents: null,
      sellerShareBps: null,
    }),
    /partial accounting snapshot/,
  );
  assert.throws(() => splitRevenueCents(0), /positive integer/);
  assert.throws(() => splitRevenueCents(10.5), /positive integer/);

  const baseListing = {
    id: 'listing_1',
    school: 'University of Washington',
    targetSchool: 'Stanford University',
    admitTags: JSON.stringify(['Stanford University', 'University of Washington']),
    status: 'approved',
    pricingMode: 'package',
    packagePrice: 45,
    essays: [
      { id: 'essay_1', pdfPath: 'listings/listing_1/essay_1.pdf', prompt: 'Why Stanford' },
      { id: 'essay_2', pdfPath: 'listings/listing_1/essay_2.pdf', prompt: 'Roommate essay' },
    ],
  };
  assert.deepEqual(quoteListing(baseListing, false), {
    ok: true,
    quote: {
      listingId: 'listing_1',
      headlineSchool: 'Stanford University',
      itemLabel: 'Stanford · 2 essays',
      stripeProductName: 'Stanford · 2 essays (Admitfolio)',
      amountCents: 4_500,
      essayCount: 2,
    },
  });
  const quotedListing = quoteListing(baseListing, false);
  assert.equal(quotedListing.ok, true);
  if (!quotedListing.ok) throw new Error('Expected listing quote.');
  assert.deepEqual(
    checkoutSessionParams(quotedListing.quote, '203.0.113.8', 'https://admitfolio.com/'),
    {
      mode: 'payment',
      integration_identifier: 'admitfolio_nqvzkjhf',
      managed_payments: { enabled: false },
      client_reference_id: 'listing_1',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: 4_500,
            product_data: { name: 'Stanford · 2 essays (Admitfolio)' },
          },
        },
      ],
      metadata: {
        checkoutVersion: CHECKOUT_VERSION,
        purchaseUnit: PURCHASE_UNIT,
        listingId: 'listing_1',
        amountCents: '4500',
        itemLabel: 'Stanford · 2 essays',
        buyerIp: '203.0.113.8',
      },
      payment_intent_data: {
        metadata: {
          checkoutVersion: CHECKOUT_VERSION,
          purchaseUnit: PURCHASE_UNIT,
          listingId: 'listing_1',
        },
      },
      success_url: 'https://admitfolio.com/purchase/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://admitfolio.com/?checkout=canceled',
    },
  );
  assert.equal(quoteListing({ ...baseListing, status: 'pending' }, false).ok, false);
  assert.equal(quoteListing({ ...baseListing, pricingMode: 'separate' }, false).ok, false);
  assert.equal(quoteListing({ ...baseListing, essays: [] }, false).ok, false);
  assert.equal(
    quoteListing({ ...baseListing, essays: [{ id: 'essay_1', pdfPath: null, prompt: 'Personal statement' }] }, false).ok,
    false,
  );
  assert.equal(quoteListing(baseListing, true).ok, false);
  assert.deepEqual(
    quoteListing(
      {
        ...baseListing,
        targetSchool: null,
        admitTags: JSON.stringify(['Stanford', 'University of Washington']),
        applicationSystem: 'commonapp',
      },
      false,
    ),
    {
      ok: true,
      quote: {
        listingId: 'listing_1',
        headlineSchool: 'University of Washington',
        itemLabel: 'UW · 2 essays',
        stripeProductName: 'UW · 2 essays (Admitfolio)',
        amountCents: 4_500,
        essayCount: 2,
      },
    },
  );
  assert.equal(
    quoteListing(
      { ...baseListing, targetSchool: 'Harvard', admitTags: JSON.stringify(['Stanford']) },
      false,
    ).ok,
    false,
  );

  const validSession = {
    id: 'cs_test_123',
    payment_status: 'paid',
    amount_total: 4_500,
    currency: 'USD',
    customer_details: { email: 'Buyer@Example.com ' },
    payment_intent: { id: 'pi_123' },
    metadata: {
      checkoutVersion: CHECKOUT_VERSION,
      purchaseUnit: PURCHASE_UNIT,
      listingId: 'listing_1',
      amountCents: '4500',
      itemLabel: 'Stanford · 2 essays',
      buyerIp: '203.0.113.8',
    },
  };
  assert.deepEqual(paidListingSession(validSession), {
    ok: true,
    session: {
      stripeSessionId: 'cs_test_123',
      stripePaymentIntentId: 'pi_123',
      listingId: 'listing_1',
      buyerEmail: 'buyer@example.com',
      buyerIp: '203.0.113.8',
      amountCents: 4_500,
      currency: 'usd',
      itemLabel: 'Stanford · 2 essays',
      checkoutVersion: CHECKOUT_VERSION,
    },
  });
  assert.deepEqual(paidListingSession({ ...validSession, payment_status: 'unpaid' }), {
    ok: false,
    deferred: true,
    message: 'Payment has not settled.',
  });
  assert.equal(
    paidListingSession({
      ...validSession,
      metadata: { ...validSession.metadata, amountCents: '4400' },
    }).ok,
    false,
  );
  assert.equal(paidListingSession({ ...validSession, currency: 'cad' }).ok, false);
  assert.equal(
    paidListingSession({
      ...validSession,
      metadata: { ...validSession.metadata, purchaseUnit: 'essay' },
    }).ok,
    false,
  );
  assert.equal(
    paidListingSession({
      ...validSession,
      metadata: { ...validSession.metadata, checkoutVersion: '3' },
    }).ok,
    false,
  );
  assert.equal(
    paidListingSession({ ...validSession, customer_details: { email: '' }, customer_email: null }).ok,
    false,
  );

  // Checkout sessions created immediately before v2 deployed did not carry a
  // version/quote snapshot. They remain deliverable after the deploy.
  const legacy = paidListingSession({
    ...validSession,
    metadata: { listingId: 'listing_1', buyerIp: '203.0.113.8' },
  });
  assert.equal(legacy.ok, true);
  if (legacy.ok) assert.equal(legacy.session.checkoutVersion, null);

  console.log('commerce tests passed');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
