import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/adminAuth';
import { SITE_URL } from '@/lib/stripe';
import { payoutSandboxStripe, readPayoutSandboxState } from '@/lib/payoutSandbox';

export const runtime = 'nodejs';

export async function GET() {
  const admin = currentAdmin();
  if (!admin) return NextResponse.redirect(`${SITE_URL}/admin`);
  const stripe = payoutSandboxStripe();
  const state = readPayoutSandboxState(admin.email);
  if (!stripe || !state?.accountId) {
    return NextResponse.redirect(`${SITE_URL}/admin/payout-sandbox?error=not-ready`);
  }

  const link = await stripe.v2.core.accountLinks.create({
    account: state.accountId,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        configurations: ['recipient'],
        refresh_url: `${SITE_URL}/api/admin/payout-sandbox/refresh`,
        return_url: `${SITE_URL}/api/admin/payout-sandbox/return`,
        collection_options: { fields: 'eventually_due', future_requirements: 'include' },
      },
    },
  });
  return NextResponse.redirect(link.url);
}
