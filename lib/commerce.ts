import { catalogSchool, listingHeadline, parseAdmitTags } from './listingSchool';
import { SELLER_SHARE_BPS, UNSNAPSHOTTED_SELLER_SHARE_BPS } from './pricing';
import { sameSchool, schoolShortName } from './schools';

export const MONEY_BASIS_POINTS = 10_000;
export const CHECKOUT_VERSION = '2';
export const PURCHASE_UNIT = 'listing';

export type RevenueSplit = {
  grossAmountCents: number;
  sellerEarningsCents: number;
  platformFeeCents: number;
  sellerShareBps: number;
};

// Stripe amounts are integer cents. Calculate the split with integer arithmetic
// too, then give the unavoidable rounding cent to the closest side. The two
// shares always add back to the exact charge.
export function splitRevenueCents(
  grossAmountCents: number,
  sellerShareBps = SELLER_SHARE_BPS,
): RevenueSplit {
  if (!Number.isSafeInteger(grossAmountCents) || grossAmountCents < 1) {
    throw new Error('Gross amount must be a positive integer number of cents.');
  }
  if (!Number.isSafeInteger(sellerShareBps) || sellerShareBps < 0 || sellerShareBps > MONEY_BASIS_POINTS) {
    throw new Error('Seller share must be valid integer basis points.');
  }

  const sellerEarningsCents = Number(
    (BigInt(grossAmountCents) * BigInt(sellerShareBps) + BigInt(MONEY_BASIS_POINTS / 2)) /
      BigInt(MONEY_BASIS_POINTS),
  );

  return {
    grossAmountCents,
    sellerEarningsCents,
    platformFeeCents: grossAmountCents - sellerEarningsCents,
    sellerShareBps,
  };
}

export function splitForCheckoutVersion(
  grossAmountCents: number,
  checkoutVersion: string | null,
): RevenueSplit {
  if (checkoutVersion && checkoutVersion !== CHECKOUT_VERSION) {
    throw new Error('Unsupported checkout version.');
  }
  return splitRevenueCents(
    grossAmountCents,
    checkoutVersion === CHECKOUT_VERSION ? SELLER_SHARE_BPS : UNSNAPSHOTTED_SELLER_SHARE_BPS,
  );
}

export type StoredPurchaseAccounting = {
  amount: number;
  grossAmountCents: number | null;
  sellerEarningsCents: number | null;
  platformFeeCents: number | null;
  sellerShareBps: number | null;
};

// Prototype rows only have a whole-dollar `amount`. There were no live sales
// before 60/40, so those rows use the same split. New rows must carry a complete immutable cents snapshot.
// Never silently blend a partial/corrupt snapshot with today's rate.
export function purchaseAccounting(
  purchase: StoredPurchaseAccounting,
): RevenueSplit {
  const values = [
    purchase.grossAmountCents,
    purchase.sellerEarningsCents,
    purchase.platformFeeCents,
    purchase.sellerShareBps,
  ];
  if (values.every((value) => value == null)) {
    const legacyGrossCents = Math.max(0, purchase.amount * 100);
    return legacyGrossCents > 0
      ? splitRevenueCents(legacyGrossCents, UNSNAPSHOTTED_SELLER_SHARE_BPS)
      : {
          grossAmountCents: 0,
          sellerEarningsCents: 0,
          platformFeeCents: 0,
          sellerShareBps: UNSNAPSHOTTED_SELLER_SHARE_BPS,
        };
  }
  if (!values.every((value) => value != null)) {
    throw new Error('Purchase has a partial accounting snapshot.');
  }

  const grossAmountCents = purchase.grossAmountCents as number;
  const sellerEarningsCents = purchase.sellerEarningsCents as number;
  const platformFeeCents = purchase.platformFeeCents as number;
  const sellerShareBps = purchase.sellerShareBps as number;
  if (
    ![grossAmountCents, sellerEarningsCents, platformFeeCents, sellerShareBps].every(Number.isSafeInteger) ||
    grossAmountCents < 1 ||
    sellerEarningsCents < 0 ||
    platformFeeCents < 0 ||
    sellerEarningsCents + platformFeeCents !== grossAmountCents ||
    sellerShareBps < 0 ||
    sellerShareBps > MONEY_BASIS_POINTS
  ) {
    throw new Error('Purchase has an invalid accounting snapshot.');
  }
  return { grossAmountCents, sellerEarningsCents, platformFeeCents, sellerShareBps };
}

export type CheckoutListing = {
  id: string;
  school: string;
  targetSchool?: string | null;
  admitTags: string;
  status: string;
  pricingMode: string;
  packagePrice: number | null;
  applicationSystem?: string | null;
  essays: Array<{ id: string; pdfPath: string | null; prompt: string; question?: string | null }>;
};

export type ListingQuote = {
  listingId: string;
  headlineSchool: string;
  itemLabel: string;
  stripeProductName: string;
  amountCents: number;
  essayCount: number;
};

// Admitfolio is a marketplace that pays sellers through Stripe Connect.
// Managed Payments is Stripe's merchant-of-record product and does not support
// Connect marketplaces, so every Checkout Session must opt out explicitly.
export function checkoutSessionParams(
  quote: ListingQuote,
  buyerIp: string | null,
  siteUrl: string,
) {
  const origin = siteUrl.replace(/\/$/, '');
  return {
    mode: 'payment' as const,
    managed_payments: { enabled: false },
    client_reference_id: quote.listingId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: quote.amountCents,
          product_data: { name: quote.stripeProductName },
        },
      },
    ],
    // buyerIp rides through Stripe metadata because this request comes from
    // the buyer's browser. The webhook request itself comes from Stripe.
    metadata: {
      checkoutVersion: CHECKOUT_VERSION,
      purchaseUnit: PURCHASE_UNIT,
      listingId: quote.listingId,
      amountCents: String(quote.amountCents),
      itemLabel: quote.itemLabel,
      buyerIp: buyerIp || '',
    },
    payment_intent_data: {
      metadata: {
        checkoutVersion: CHECKOUT_VERSION,
        purchaseUnit: PURCHASE_UNIT,
        listingId: quote.listingId,
      },
    },
    success_url: `${origin}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?checkout=canceled`,
  };
}

export type QuoteResult =
  | { ok: true; quote: ListingQuote }
  | { ok: false; reason: 'unavailable' | 'school_unconfirmed'; message: string };

// A checkout buys one complete Listing, never an individual Essay. Keep every
// rule here so a future checkout surface cannot accidentally sell an unreviewed,
// empty or partially uploaded listing. Legacy listings without a one-school
// answer use an accurate application title instead of being hidden or guessed.
export function quoteListing(listing: CheckoutListing | null, isTestSeller: boolean): QuoteResult {
  if (
    !listing ||
    listing.status !== 'approved' ||
    isTestSeller ||
    listing.pricingMode !== 'package' ||
    !Number.isSafeInteger(listing.packagePrice) ||
    (listing.packagePrice ?? 0) < 1 ||
    listing.essays.length < 1 ||
    listing.essays.some((essay) => !essay.pdfPath?.trim())
  ) {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'This listing is not available for purchase.',
    };
  }

  const admitTags = parseAdmitTags(listing.admitTags);
  const exactSchool = catalogSchool({
    school: listing.school,
    targetSchool: listing.targetSchool,
    admitTags,
  });
  const explicitTarget = listing.targetSchool?.trim();
  if (explicitTarget && !admitTags.some((school) => sameSchool(school, explicitTarget))) {
    return {
      ok: false,
      reason: 'school_unconfirmed',
      message: 'This listing needs its college confirmed before purchase.',
    };
  }

  const essayCount = listing.essays.length;
  const headlineSchool = exactSchool || listingHeadline({
    school: listing.school,
    targetSchool: listing.targetSchool,
    admitTags,
    applicationSystem: listing.applicationSystem,
    essays: listing.essays,
  });
  const headlineLabel = exactSchool ? schoolShortName(headlineSchool) : headlineSchool;
  const itemLabel = `${headlineLabel} · ${essayCount} essay${essayCount === 1 ? '' : 's'}`;

  return {
    ok: true,
    quote: {
      listingId: listing.id,
      headlineSchool,
      itemLabel,
      stripeProductName: `${itemLabel} (Admitfolio)`,
      amountCents: (listing.packagePrice as number) * 100,
      essayCount,
    },
  };
}

export type PaidListingSession = {
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  listingId: string;
  buyerEmail: string;
  buyerIp: string | null;
  amountCents: number;
  currency: 'usd';
  itemLabel: string | null;
  checkoutVersion: string | null;
};

type StripeSessionLike = {
  id?: unknown;
  payment_status?: unknown;
  amount_total?: unknown;
  currency?: unknown;
  customer_details?: { email?: unknown } | null;
  customer_email?: unknown;
  payment_intent?: unknown;
  metadata?: Record<string, string | undefined> | null;
};

export type PaidSessionResult =
  | { ok: true; session: PaidListingSession }
  | { ok: false; deferred?: boolean; message: string };

// The webhook receives a signed Stripe object, but a valid signature alone
// does not prove that it represents a paid Admitfolio listing checkout. Validate
// the money, currency, unit, listing reference and buyer delivery address before
// creating any Purchase row.
export function paidListingSession(session: StripeSessionLike): PaidSessionResult {
  if (session.payment_status !== 'paid') {
    return { ok: false, deferred: true, message: 'Payment has not settled.' };
  }

  const stripeSessionId = typeof session.id === 'string' ? session.id.trim() : '';
  const amountCents = session.amount_total;
  const currency = typeof session.currency === 'string' ? session.currency.toLowerCase() : '';
  const metadata = session.metadata ?? {};
  const listingId = metadata.listingId?.trim() ?? '';
  const buyerEmailValue = session.customer_details?.email ?? session.customer_email;
  const buyerEmail = typeof buyerEmailValue === 'string' ? buyerEmailValue.trim().toLowerCase() : '';
  const checkoutVersion = metadata.checkoutVersion?.trim() || null;

  if (!stripeSessionId || !/^cs_(?:test|live)_/.test(stripeSessionId)) {
    return { ok: false, message: 'Missing or invalid Stripe Checkout session id.' };
  }
  if (!Number.isSafeInteger(amountCents) || (amountCents as number) < 1) {
    return { ok: false, message: 'Missing or invalid paid amount.' };
  }
  if (currency !== 'usd') {
    return { ok: false, message: 'Unsupported checkout currency.' };
  }
  if (!listingId) {
    return { ok: false, message: 'Paid session is not linked to a listing.' };
  }
  if (!buyerEmail || !buyerEmail.includes('@') || /\s/.test(buyerEmail)) {
    return { ok: false, message: 'Paid session has no usable buyer email.' };
  }
  if (metadata.purchaseUnit && metadata.purchaseUnit !== PURCHASE_UNIT) {
    return { ok: false, message: 'Paid session has the wrong purchase unit.' };
  }
  if (checkoutVersion && checkoutVersion !== CHECKOUT_VERSION) {
    return { ok: false, message: 'Paid session has an unsupported checkout version.' };
  }

  const quotedAmount = metadata.amountCents ? Number(metadata.amountCents) : null;
  if (checkoutVersion === CHECKOUT_VERSION) {
    if (metadata.purchaseUnit !== PURCHASE_UNIT) {
      return { ok: false, message: 'Paid session is missing its listing purchase unit.' };
    }
    if (!Number.isSafeInteger(quotedAmount) || quotedAmount !== amountCents) {
      return { ok: false, message: 'Paid amount does not match the checkout quote.' };
    }
    if (!metadata.itemLabel?.trim()) {
      return { ok: false, message: 'Paid session is missing its listing label.' };
    }
  }

  const paymentIntent = session.payment_intent;
  const stripePaymentIntentId =
    typeof paymentIntent === 'string'
      ? paymentIntent
      : paymentIntent && typeof paymentIntent === 'object' && 'id' in paymentIntent &&
          typeof (paymentIntent as { id?: unknown }).id === 'string'
        ? (paymentIntent as { id: string }).id
        : null;

  return {
    ok: true,
    session: {
      stripeSessionId,
      stripePaymentIntentId,
      listingId,
      buyerEmail,
      buyerIp: metadata.buyerIp?.trim().slice(0, 100) || null,
      amountCents: amountCents as number,
      currency: 'usd',
      itemLabel: metadata.itemLabel?.trim() || null,
      checkoutVersion,
    },
  };
}
