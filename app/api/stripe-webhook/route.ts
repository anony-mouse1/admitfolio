import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { stripe, STRIPE_WEBHOOK_SECRET, SITE_URL } from '@/lib/stripe';
import { makeAccessToken } from '@/lib/accessToken';
import { sendPurchaseReceipt, sendSaleNotification } from '@/lib/email';
import { SELLER_SHARE } from '@/lib/pricing';

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

  // Deliver only once money has actually settled: completed sessions must be
  // paid; async payment methods deliver via async_payment_succeeded instead.
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (event.type === 'checkout.session.completed' && session.payment_status !== 'paid') {
    return NextResponse.json({ ok: true, deferred: 'awaiting payment' });
  }
  const listingId = session.metadata?.listingId || null;
  const buyerEmail = (session.customer_details?.email || '').toLowerCase();
  const amount = Math.round((session.amount_total ?? 0) / 100);
  if (!buyerEmail) {
    // Nothing to deliver to; acknowledge so Stripe stops retrying.
    console.error('stripe webhook: session without buyer email', session.id);
    return NextResponse.json({ ok: true });
  }

  const listing = listingId
    ? await prisma.listing.findUnique({
        where: { id: listingId },
        include: { seller: { select: { id: true, email: true } }, essays: { select: { id: true } } },
      })
    : null;
  const label = listing
    ? `${listing.school} · ${listing.essays.length} essay${listing.essays.length === 1 ? '' : 's'}`
    : 'Admitfolio purchase';

  // Idempotent on the Stripe session id - webhook retries must not create
  // duplicate purchases or resend emails.
  let purchase;
  try {
    purchase = await prisma.purchase.create({
      data: {
        buyerEmail,
        listingId: listing?.id ?? null,
        itemLabel: label,
        amount,
        stripeSessionId: session.id,
      },
    });
  } catch (e) {
    const dup = e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002';
    if (dup) return NextResponse.json({ ok: true, duplicate: true });
    throw e;
  }

  // Delivery + notifications are best-effort: the purchase is recorded either
  // way, and failures are visible in logs.
  try {
    const accessUrl = `${SITE_URL}/purchase/${makeAccessToken(purchase.id)}`;
    const receipt = await sendPurchaseReceipt(buyerEmail, { itemLabel: label, amount, accessUrl });
    if (!receipt.ok) console.error('purchase receipt failed:', receipt.status, receipt.detail);

    if (listing) {
      const sellerSales = await prisma.purchase.count({ where: { listing: { sellerId: listing.seller.id } } });
      const note = await sendSaleNotification(listing.seller.email, {
        itemLabel: label,
        amount,
        net: Math.round(amount * SELLER_SHARE * 100) / 100,
        firstSale: sellerSales === 1,
      });
      if (!note.ok) console.error('sale notification failed:', note.status, note.detail);
    }
  } catch (e) {
    console.error('post-purchase notification error:', e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true });
}
