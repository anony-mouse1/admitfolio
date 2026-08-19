import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { stripe, STRIPE_WEBHOOK_SECRET } from '@/lib/stripe';
import { sendSaleNotification } from '@/lib/email';
import { listingHeadline, parseAdmitTags } from '@/lib/listingSchool';
import { paidListingSession, splitForCheckoutVersion } from '@/lib/commerce';
import { fulfillPurchase } from '@/lib/purchaseFulfillment';
import { releaseSellerEarnings, reverseSellerTransfer } from '@/lib/sellerPayouts';

export const runtime = 'nodejs';

// Stripe calls this after checkout. The signature check (against the raw
// body) is the only authentication - never parse the JSON before verifying.

export async function POST(req: Request) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 503 });
  }

  const raw = await req.text();
  const sig = req.headers.get('stripe-signature') || '';
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  // Separate Connect transfers are not reversed automatically when a platform
  // charge is refunded or a dispute is lost. Reclaim the seller share so the
  // platform does not pay out money it returned to the buyer.
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    if (charge.amount_refunded > 0) {
      await reverseSellerTransfer({
        chargeId: charge.id,
        affectedGrossCents: charge.amount_refunded,
        reason: 'refund',
      });
    }
    return NextResponse.json({ ok: true });
  }
  if (event.type === 'charge.dispute.closed') {
    const dispute = event.data.object as Stripe.Dispute;
    if (dispute.status === 'lost') {
      const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id;
      await reverseSellerTransfer({
        chargeId,
        affectedGrossCents: dispute.amount,
        reason: 'lost_dispute',
      });
    }
    return NextResponse.json({ ok: true });
  }

  // Only listing Checkout sessions create purchases. Async methods first send
  // an unpaid completed event, then async_payment_succeeded after settlement.
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  const parsed = paidListingSession(event.data.object as Stripe.Checkout.Session);
  if (!parsed.ok) {
    if (parsed.deferred) {
      return NextResponse.json({ ok: true, deferred: 'awaiting payment' });
    }
    // A signed paid event that cannot be tied to a buyer and a listing needs
    // intervention. Do not acknowledge it and silently strand the customer;
    // Stripe will retry while the error is visible in logs.
    console.error('stripe webhook: invalid paid listing session', {
      eventId: event.id,
      sessionId: (event.data.object as Stripe.Checkout.Session).id,
      reason: parsed.message,
    });
    return NextResponse.json({ error: 'Paid session could not be fulfilled.' }, { status: 500 });
  }
  const paid = parsed.session;

  const listing = await prisma.listing.findUnique({
    where: { id: paid.listingId },
    include: {
      seller: { select: { id: true, email: true } },
      essays: { select: { id: true, pdfPath: true, prompt: true, question: true } },
    },
  });
  if (!listing || listing.essays.length < 1 || listing.essays.some((essay) => !essay.pdfPath)) {
    console.error('stripe webhook: paid listing is missing or incomplete', {
      eventId: event.id,
      sessionId: paid.stripeSessionId,
      listingId: paid.listingId,
    });
    return NextResponse.json({ error: 'Paid listing is not deliverable.' }, { status: 500 });
  }
  if (paid.amountCents % 100 !== 0) {
    // Listing prices are whole dollars today and Purchase.amount is the legacy
    // whole-dollar field. Never round a real charge to make it fit that column.
    console.error('stripe webhook: paid amount is not whole-dollar compatible', {
      sessionId: paid.stripeSessionId,
      amountCents: paid.amountCents,
    });
    return NextResponse.json({ error: 'Paid amount could not be recorded.' }, { status: 500 });
  }

  const listingTitle = listingHeadline({
    school: listing.school,
    targetSchool: listing.targetSchool,
    admitTags: parseAdmitTags(listing.admitTags),
    applicationSystem: listing.applicationSystem,
    essays: listing.essays,
  });
  const label = paid.itemLabel ||
    `${listingTitle} · ${listing.essays.length} essay${listing.essays.length === 1 ? '' : 's'}`;
  // The session version snapshots the commercial promise. All Admitfolio sales
  // use 60/40 because no live purchase predates this release.
  const split = splitForCheckoutVersion(paid.amountCents, paid.checkoutVersion);

  // Idempotent on the Checkout Session, not on the webhook Event. Stripe may
  // send both completed and async_payment_succeeded, and retries use new Event
  // deliveries for the same customer order.
  let purchase = await prisma.purchase.findUnique({ where: { stripeSessionId: paid.stripeSessionId } });
  try {
    if (!purchase) {
      purchase = await prisma.purchase.create({
        data: {
          buyerEmail: paid.buyerEmail,
          listingId: listing.id,
          essayId: null,
          itemLabel: label,
          amount: paid.amountCents / 100,
          grossAmountCents: split.grossAmountCents,
          sellerEarningsCents: split.sellerEarningsCents,
          platformFeeCents: split.platformFeeCents,
          sellerShareBps: split.sellerShareBps,
          currency: paid.currency,
          stripeSessionId: paid.stripeSessionId,
          stripePaymentIntentId: paid.stripePaymentIntentId,
          // Set by /api/checkout from the buyer request, never from Stripe's
          // webhook request headers.
          buyerIp: paid.buyerIp,
        },
      });
    }
  } catch (e) {
    const dup = e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002';
    if (dup) {
      // A concurrent delivery may have won the unique-session insert. Only
      // treat it as our duplicate if that exact session now exists.
      purchase = await prisma.purchase.findUnique({ where: { stripeSessionId: paid.stripeSessionId } });
      if (!purchase) throw e;
    } else {
      throw e;
    }
  }

  const storedGrossCents = purchase.grossAmountCents ?? purchase.amount * 100;
  if (
    purchase.listingId !== listing.id ||
    purchase.buyerEmail.trim().toLowerCase() !== paid.buyerEmail ||
    storedGrossCents !== paid.amountCents ||
    (purchase.stripePaymentIntentId && paid.stripePaymentIntentId &&
      purchase.stripePaymentIntentId !== paid.stripePaymentIntentId)
  ) {
    console.error('stripe webhook: immutable purchase data mismatch', {
      purchaseId: purchase.id,
      sessionId: paid.stripeSessionId,
    });
    return NextResponse.json({ error: 'Purchase reconciliation failed.' }, { status: 500 });
  }

  const accountingValues = [
    purchase.grossAmountCents,
    purchase.sellerEarningsCents,
    purchase.platformFeeCents,
    purchase.sellerShareBps,
    purchase.currency,
  ];
  const accountingIsMissing = accountingValues.every((value) => value == null);
  const accountingIsComplete = accountingValues.every((value) => value != null);
  if (!accountingIsMissing && !accountingIsComplete) {
    console.error('stripe webhook: partial accounting snapshot', { purchaseId: purchase.id });
    return NextResponse.json({ error: 'Purchase accounting needs review.' }, { status: 500 });
  }
  if (
    accountingIsComplete &&
    ((purchase.sellerEarningsCents as number) + (purchase.platformFeeCents as number) !==
      purchase.grossAmountCents ||
      purchase.grossAmountCents !== paid.amountCents)
  ) {
    console.error('stripe webhook: inconsistent accounting snapshot', { purchaseId: purchase.id });
    return NextResponse.json({ error: 'Purchase accounting needs review.' }, { status: 500 });
  }

  // A Purchase written by the old handler just before deployment may be seen
  // again on a Stripe retry. Fill only missing accounting snapshots; never
  // re-price an already snapshotted seller entitlement.
  if (
    accountingIsMissing ||
    (!purchase.stripePaymentIntentId && paid.stripePaymentIntentId)
  ) {
    purchase = await prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        grossAmountCents: accountingIsMissing ? split.grossAmountCents : purchase.grossAmountCents,
        sellerEarningsCents: accountingIsMissing ? split.sellerEarningsCents : purchase.sellerEarningsCents,
        platformFeeCents: accountingIsMissing ? split.platformFeeCents : purchase.platformFeeCents,
        sellerShareBps: accountingIsMissing ? split.sellerShareBps : purchase.sellerShareBps,
        currency: accountingIsMissing ? paid.currency : purchase.currency,
        stripePaymentIntentId: purchase.stripePaymentIntentId ?? paid.stripePaymentIntentId,
      },
    });
  }

  const deliveryLabel = purchase.itemLabel?.trim() || label;
  const deliveryBuyerIp = purchase.buyerIp || paid.buyerIp;

  let delivery;
  try {
    delivery = await fulfillPurchase({
      purchaseId: purchase.id,
      listingId: listing.id,
      buyerEmail: paid.buyerEmail,
      buyerIp: deliveryBuyerIp,
      itemLabel: deliveryLabel,
      amountCents: paid.amountCents,
    });
  } catch (e) {
    console.error('purchase fulfilment threw:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Purchase delivery failed.' }, { status: 500 });
  }
  if (!delivery.ok) {
    console.error('purchase fulfilment failed:', {
      purchaseId: purchase.id,
      sessionId: paid.stripeSessionId,
      email: delivery.email,
    });
    return NextResponse.json({ error: 'Purchase delivery failed.' }, { status: 500 });
  }
  // Buyer delivery above is retryable and idempotent. Seller notification is a
  // secondary alert; the cents snapshot remains the source of truth for payout.
  if (!purchase.sellerNotifiedAt) {
    try {
      const sellerEarningsCents = purchase.sellerEarningsCents ?? split.sellerEarningsCents;
      const grossAmountCents = purchase.grossAmountCents ?? split.grossAmountCents;
      const sellerSales = await prisma.purchase.count({
        where: {
          listing: { sellerId: listing.seller.id },
          stripeSessionId: { startsWith: 'cs_live_' },
        },
      });
      const note = await sendSaleNotification(listing.seller.email, {
        itemLabel: deliveryLabel,
        amount: grossAmountCents / 100,
        net: sellerEarningsCents / 100,
        firstSale: sellerSales === 1,
      });
      if (note.ok) {
        await prisma.purchase.update({
          where: { id: purchase.id },
          data: { sellerNotifiedAt: new Date() },
        });
      } else {
        console.error('sale notification failed:', note.status, note.detail);
      }
    } catch (e) {
      console.error('sale notification error:', e instanceof Error ? e.message : e);
    }
  }

  // First-sale earnings remain recorded until Stripe onboarding completes.
  // For later sales, an already-ready account can receive its separate
  // transfer immediately. This function is idempotent per Purchase.
  try {
    await releaseSellerEarnings(listing.seller.id);
  } catch (error) {
    // Buyer delivery has already succeeded, so a payout API interruption must
    // not make Stripe retry the whole order. The transfer remains pending and
    // is retried by account.updated or the seller's payout return flow.
    console.error('automatic seller payout release failed', {
      sellerId: listing.seller.id,
      purchaseId: purchase.id,
      error: error instanceof Error ? error.message : error,
    });
  }

  return NextResponse.json({
    ok: true,
    purchaseId: purchase.id,
    duplicate: Boolean(delivery.alreadyFulfilled),
  });
}
