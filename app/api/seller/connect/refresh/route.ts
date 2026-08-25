import { NextResponse } from 'next/server';
import { currentSeller } from '@/lib/sellerAuth';
import { prisma } from '@/lib/prisma';
import { stripeConnectErrorDetails } from '@/lib/stripeConnectCore';
import { stripe, SITE_URL } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function GET() {
  const session = await currentSeller();
  if (!session) return NextResponse.redirect(`${SITE_URL}/?login=1`);
  if (!stripe) return NextResponse.redirect(`${SITE_URL}/?payouts=unavailable`);

  const seller = await prisma.seller.findUnique({
    where: { email: session.email },
    select: { stripeAccountId: true },
  });
  if (!seller?.stripeAccountId) return NextResponse.redirect(`${SITE_URL}/?payouts=setup`);

  try {
    const link = await stripe.v2.core.accountLinks.create({
      account: seller.stripeAccountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['recipient'],
          refresh_url: `${SITE_URL}/api/seller/connect/refresh`,
          return_url: `${SITE_URL}/api/seller/connect/return`,
          collection_options: {
            fields: 'eventually_due',
            future_requirements: 'include',
          },
        },
      },
    });
    return NextResponse.redirect(link.url);
  } catch (error) {
    console.error('seller Connect refresh failed', {
      stripeAccountId: seller.stripeAccountId,
      ...stripeConnectErrorDetails(error),
    });
    return NextResponse.redirect(`${SITE_URL}/?payouts=retry`);
  }
}
