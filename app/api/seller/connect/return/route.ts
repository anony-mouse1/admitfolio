import { NextResponse } from 'next/server';
import { currentSeller } from '@/lib/sellerAuth';
import { prisma } from '@/lib/prisma';
import { releaseSellerEarnings, retrieveConnectedAccount, syncConnectedAccount } from '@/lib/sellerPayouts';
import { connectedAccountReady } from '@/lib/sellerPayoutsCore';
import { stripeConnectErrorDetails } from '@/lib/stripeConnectCore';
import { stripe, SITE_URL } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function GET() {
  const session = await currentSeller();
  if (!session) return NextResponse.redirect(`${SITE_URL}/?login=1&payouts=return`);
  if (!stripe) return NextResponse.redirect(`${SITE_URL}/?payouts=unavailable`);

  const seller = await prisma.seller.findUnique({
    where: { email: session.email },
    select: { id: true, stripeAccountId: true },
  });
  if (!seller?.stripeAccountId) return NextResponse.redirect(`${SITE_URL}/?payouts=setup`);

  try {
    const account = await retrieveConnectedAccount(seller.stripeAccountId);
    if (account.closed) return NextResponse.redirect(`${SITE_URL}/?payouts=setup`);
    await syncConnectedAccount(account);
    if (connectedAccountReady(account)) {
      const release = await releaseSellerEarnings(seller.id);
      return NextResponse.redirect(
        `${SITE_URL}/?payouts=${release.failed > 0 ? 'transfer-retry' : 'ready'}`,
      );
    }
    return NextResponse.redirect(`${SITE_URL}/?payouts=pending`);
  } catch (error) {
    console.error('seller Connect return failed', {
      sellerId: seller.id,
      stripeAccountId: seller.stripeAccountId,
      ...stripeConnectErrorDetails(error),
    });
    return NextResponse.redirect(`${SITE_URL}/?payouts=retry`);
  }
}
