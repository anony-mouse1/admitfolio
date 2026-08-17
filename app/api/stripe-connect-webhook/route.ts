import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { releaseSellerEarnings, syncConnectedAccount } from '@/lib/sellerPayouts';
import { connectedAccountReady } from '@/lib/sellerPayoutsCore';
import { stripe, STRIPE_CONNECT_WEBHOOK_SECRET } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!stripe || !STRIPE_CONNECT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Connect webhook not configured.' }, { status: 503 });
  }

  const raw = await req.text();
  const signature = req.headers.get('stripe-signature') || '';
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, STRIPE_CONNECT_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }
  if (event.type !== 'account.updated') {
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  const account = event.data.object as Stripe.Account;
  const seller = await prisma.seller.findUnique({
    where: { stripeAccountId: account.id },
    select: { id: true },
  });
  if (!seller) return NextResponse.json({ ok: true, ignored: 'unknown account' });

  await syncConnectedAccount(account);
  if (connectedAccountReady(account)) await releaseSellerEarnings(seller.id);
  return NextResponse.json({ ok: true });
}
