import { NextResponse } from 'next/server';
import { currentSeller } from '@/lib/sellerAuth';
import { prisma } from '@/lib/prisma';
import { stripe, SITE_URL } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function GET() {
  const session = currentSeller();
  if (!session) return NextResponse.redirect(`${SITE_URL}/?login=1`);
  if (!stripe) return NextResponse.redirect(`${SITE_URL}/?payouts=unavailable`);

  const seller = await prisma.seller.findUnique({
    where: { email: session.email },
    select: { stripeAccountId: true },
  });
  if (!seller?.stripeAccountId) return NextResponse.redirect(`${SITE_URL}/?payouts=setup`);

  const link = await stripe.accountLinks.create({
    account: seller.stripeAccountId,
    refresh_url: `${SITE_URL}/api/seller/connect/refresh`,
    return_url: `${SITE_URL}/api/seller/connect/return`,
    type: 'account_onboarding',
  });
  return NextResponse.redirect(link.url);
}
