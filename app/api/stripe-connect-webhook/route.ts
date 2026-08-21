import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { releaseSellerEarnings, retrieveConnectedAccount, syncConnectedAccount } from '@/lib/sellerPayouts';
import { connectedAccountReady } from '@/lib/sellerPayoutsCore';
import { isBankPayoutEvent } from '@/lib/sellerBankPayoutCore';
import { recordSellerBankPayout } from '@/lib/sellerBankPayouts';
import { stripe, STRIPE_CONNECT_WEBHOOK_SECRET } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!stripe || !STRIPE_CONNECT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Connect webhook not configured.' }, { status: 503 });
  }

  const raw = await req.text();
  const signature = req.headers.get('stripe-signature') || '';
  let accountId: string | null = null;
  let accountEvent = false;
  let payoutEvent: Stripe.Event | null = null;
  try {
    const object = (JSON.parse(raw) as { object?: unknown }).object;
    if (object === 'v2.core.event') {
      const notification = stripe.parseEventNotification(
        raw,
        signature,
        STRIPE_CONNECT_WEBHOOK_SECRET,
      );
      if (!notification.type.startsWith('v2.core.account')) {
        return NextResponse.json({ ok: true, ignored: notification.type });
      }
      accountEvent = true;
      accountId = 'related_object' in notification
        ? notification.related_object?.id || null
        : null;
    } else {
      const event = stripe.webhooks.constructEvent(raw, signature, STRIPE_CONNECT_WEBHOOK_SECRET);
      if (isBankPayoutEvent(event.type)) {
        accountId = event.account || null;
        payoutEvent = event;
      }
      if (!payoutEvent && event.type !== 'account.updated') {
        return NextResponse.json({ ok: true, ignored: event.type });
      }
      if (!payoutEvent) {
        accountEvent = true;
        accountId = event.account || (event.data.object as { id?: string }).id || null;
      }
    }
  } catch {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }
  if (payoutEvent) {
    if (!accountId) return NextResponse.json({ ok: true, ignored: 'missing connected account' });
    const result = await recordSellerBankPayout({
      stripeAccountId: accountId,
      eventId: payoutEvent.id,
      eventCreated: payoutEvent.created,
      payout: payoutEvent.data.object as Stripe.Payout,
    });
    return NextResponse.json({ ok: true, recorded: result.recorded, reason: result.reason });
  }
  if (!accountId) return NextResponse.json({ ok: true, ignored: 'missing account' });
  if (!accountEvent) return NextResponse.json({ ok: true, ignored: 'unsupported event' });
  const seller = await prisma.seller.findUnique({
    where: { stripeAccountId: accountId },
    select: { id: true },
  });
  if (!seller) return NextResponse.json({ ok: true, ignored: 'unknown account' });

  const account = await retrieveConnectedAccount(accountId);
  await syncConnectedAccount(account);
  if (connectedAccountReady(account)) await releaseSellerEarnings(seller.id);
  return NextResponse.json({ ok: true });
}
