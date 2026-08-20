import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { releaseSellerEarnings, retrieveConnectedAccount, syncConnectedAccount } from '@/lib/sellerPayouts';
import { connectedAccountReady } from '@/lib/sellerPayoutsCore';
import { stripe, STRIPE_CONNECT_WEBHOOK_SECRET } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!stripe || !STRIPE_CONNECT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Connect webhook not configured.' }, { status: 503 });
  }

  const raw = await req.text();
  const signature = req.headers.get('stripe-signature') || '';
  let accountId: string | null = null;
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
      accountId = 'related_object' in notification
        ? notification.related_object?.id || null
        : null;
    } else {
      const event = stripe.webhooks.constructEvent(raw, signature, STRIPE_CONNECT_WEBHOOK_SECRET);
      if (event.type !== 'account.updated') {
        return NextResponse.json({ ok: true, ignored: event.type });
      }
      accountId = event.account || (event.data.object as { id?: string }).id || null;
    }
  } catch {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }
  if (!accountId) return NextResponse.json({ ok: true, ignored: 'missing account' });
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
