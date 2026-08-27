import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { releaseSellerEarnings, retrieveConnectedAccount, syncConnectedAccount } from '@/lib/sellerPayouts';
import { connectedAccountReady } from '@/lib/sellerPayoutsCore';
import { isBankPayoutEvent } from '@/lib/sellerBankPayoutCore';
import { recordSellerBankPayout } from '@/lib/sellerBankPayouts';
import {
  stripe,
  STRIPE_CONNECT_SNAPSHOT_WEBHOOK_SECRET,
  STRIPE_CONNECT_WEBHOOK_SECRET,
} from '@/lib/stripe';
import { parseConnectWebhook } from '@/lib/stripeConnectWebhookCore';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!stripe || (!STRIPE_CONNECT_WEBHOOK_SECRET && !STRIPE_CONNECT_SNAPSHOT_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Connect webhook not configured.' }, { status: 503 });
  }

  const raw = await req.text();
  const signature = req.headers.get('stripe-signature') || '';
  let parsed: ReturnType<typeof parseConnectWebhook>;
  try {
    parsed = parseConnectWebhook(
      stripe,
      raw,
      signature,
      {
        v2: STRIPE_CONNECT_WEBHOOK_SECRET,
        snapshot: STRIPE_CONNECT_SNAPSHOT_WEBHOOK_SECRET,
      },
      isBankPayoutEvent,
    );
  } catch {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }
  if (parsed.kind === 'ignored') {
    return NextResponse.json({ ok: true, ignored: parsed.eventType });
  }
  if (parsed.kind === 'payout') {
    if (!parsed.accountId) return NextResponse.json({ ok: true, ignored: 'missing connected account' });
    const result = await recordSellerBankPayout({
      stripeAccountId: parsed.accountId,
      eventId: parsed.event.id,
      eventCreated: parsed.event.created,
      payout: parsed.event.data.object as Stripe.Payout,
    });
    return NextResponse.json({ ok: true, recorded: result.recorded, reason: result.reason });
  }
  if (!parsed.accountId) return NextResponse.json({ ok: true, ignored: 'missing account' });
  const seller = await prisma.seller.findUnique({
    where: { stripeAccountId: parsed.accountId },
    select: { id: true },
  });
  if (!seller) return NextResponse.json({ ok: true, ignored: 'unknown account' });

  const account = await retrieveConnectedAccount(parsed.accountId);
  await syncConnectedAccount(account);
  if (connectedAccountReady(account)) await releaseSellerEarnings(seller.id);
  return NextResponse.json({ ok: true });
}
