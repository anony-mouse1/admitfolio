import { NextResponse } from 'next/server';
import { currentSeller } from '@/lib/sellerAuth';
import { prisma } from '@/lib/prisma';
import { releaseSellerEarnings, syncConnectedAccount } from '@/lib/sellerPayouts';
import { connectedAccountReady } from '@/lib/sellerPayoutsCore';
import { stripe, SITE_URL } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function GET() {
  const session = currentSeller();
  if (!session) return NextResponse.redirect(`${SITE_URL}/?login=1&payouts=return`);
  if (!stripe) return NextResponse.redirect(`${SITE_URL}/?payouts=unavailable`);

  const seller = await prisma.seller.findUnique({
    where: { email: session.email },
    select: { id: true, stripeAccountId: true },
  });
  if (!seller?.stripeAccountId) return NextResponse.redirect(`${SITE_URL}/?payouts=setup`);

  const account = await stripe.accounts.retrieve(seller.stripeAccountId);
  await syncConnectedAccount(account);
  if (connectedAccountReady(account)) {
    await releaseSellerEarnings(seller.id);
    return NextResponse.redirect(`${SITE_URL}/?payouts=ready`);
  }
  return NextResponse.redirect(`${SITE_URL}/?payouts=pending`);
}
