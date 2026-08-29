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
    LEGACY_CHECKOUT_VERSION,
    PURCHASE_UNIT,
    checkoutSessionParams,
    finalizeRevenueWithStripeFeeCents,
    paidListingSession,
    purchaseAccounting,
    purchaseAccountingPending,
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
  assert.deepEqual(finalizeRevenueWithStripeFeeCents(18_400, 840), {
    grossAmountCents: 18_400,
    sellerEarningsCents: 10_200,
    platformFeeCents: 7_360,
    sellerShareBps: 6_000,
    stripeProcessingFeeCents: 840,
  });
  assert.deepEqual(finalizeRevenueWithStripeFeeCents(1_000, 50, 7_000), {
    grossAmountCents: 1_000,
    sellerEarningsCents: 650,
    platformFeeCents: 300,
    sellerShareBps: 7_000,
    stripeProcessingFeeCents: 50,
  });
  assert.throws(() => finalizeRevenueWithStripeFeeCents(100, 61), /cannot exceed/i);
  assert.equal(splitForCheckoutVersion(4_500, CHECKOUT_VERSION).sellerEarningsCents, 2_700);
  assert.equal(splitForCheckoutVersion(4_500, LEGACY_CHECKOUT_VERSION).sellerEarningsCents, 2_700);
  assert.equal(splitForCheckoutVersion(4_500, null).sellerEarningsCents, 2_700);
  assert.throws(() => splitForCheckoutVersion(4_500, '4'), /Unsupported checkout version/);
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
      stripeProcessingFeeCents: 0,
    },
  );
  // Existing live snapshots are contractual. Do not deduct a fee when the new
  // field is null, including Ritvik's and Joyce's already-recorded sales.
  assert.equal(purchaseAccounting({
    amount: 184,
    grossAmountCents: 18_400,
    sellerEarningsCents: 11_040,
    platformFeeCents: 7_360,
    sellerShareBps: 6_000,
    stripeProcessingFeeCents: null,
    checkoutVersion: null,
  }).sellerEarningsCents, 11_040);
  assert.equal(purchaseAccounting({
    amount: 85,
    grossAmountCents: 8_500,
    sellerEarningsCents: 5_100,
    platformFeeCents: 3_400,
    sellerShareBps: 6_000,
    stripeProcessingFeeCents: null,
    checkoutVersion: null,
  }).sellerEarningsCents, 5_100);
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
      stripeProcessingFeeCents: 0,
    },
  );
  assert.deepEqual(
    purchaseAccounting({
      amount: 184,
      grossAmountCents: 18_400,
      sellerEarningsCents: 10_200,
      platformFeeCents: 7_360,
      stripeProcessingFeeCents: 840,
      sellerShareBps: 6_000,
      checkoutVersion: CHECKOUT_VERSION,
    }),
    {
      grossAmountCents: 18_400,
      sellerEarningsCents: 10_200,
      platformFeeCents: 7_360,
      sellerShareBps: 6_000,
      stripeProcessingFeeCents: 840,
    },
  );
  assert.equal(purchaseAccountingPending({
    amount: 184,
    grossAmountCents: 18_400,
    sellerEarningsCents: null,
    platformFeeCents: 7_360,
    stripeProcessingFeeCents: null,
    sellerShareBps: 6_000,
    checkoutVersion: CHECKOUT_VERSION,
  }), true);
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
    checkoutSessionParams(quotedListing.quote, '203.0.113.8', 'buyer@example.edu', 'https://admitfolio.com/'),
    {
      mode: 'payment',
      ui_mode: 'embedded_page',
      redirect_on_completion: 'always',
      integration_identifier: 'admitfolio_nqvzkjhf',
      managed_payments: { enabled: false },
      excluded_payment_method_types: ['amazon_pay'],
      customer_email: 'buyer@example.edu',
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
      return_url: 'https://admitfolio.com/purchase/success?session_id={CHECKOUT_SESSION_ID}',
    },
  );
  const recoveryParams = checkoutSessionParams(
    quotedListing.quote,
    '203.0.113.8',
    'buyer@example.edu',
    'https://admitfolio.com/',
    true,
  );
  assert.deepEqual(recoveryParams.consent_collection, { promotions: 'auto' });
  assert.deepEqual(recoveryParams.after_expiration, {
    recovery: {
      enabled: true,
      allow_promotion_codes: false,
    },
  });
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
        itemLabel: 'University of Washington · 2 essays',
        stripeProductName: 'University of Washington · 2 essays (Admitfolio)',
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
  const confirmedDeliveryEmail = paidListingSession({
    ...validSession,
    customer_email: 'Delivery@Berkeley.edu ',
    customer_details: { email: 'saved-card@example.com' },
  });
  assert.equal(confirmedDeliveryEmail.ok, true);
  if (confirmedDeliveryEmail.ok) {
    assert.equal(
      confirmedDeliveryEmail.session.buyerEmail,
      'delivery@berkeley.edu',
      'the buyer-confirmed delivery email must win over a saved card or Link email',
    );
  }
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
      metadata: { ...validSession.metadata, checkoutVersion: '4' },
    }).ok,
    false,
  );
  assert.equal(
    paidListingSession({
      ...validSession,
      metadata: { ...validSession.metadata, checkoutVersion: LEGACY_CHECKOUT_VERSION },
    }).ok,
    true,
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
