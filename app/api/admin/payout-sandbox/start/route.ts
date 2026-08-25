import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/adminAuth';
import { SITE_URL } from '@/lib/stripe';
import { sandboxIdempotencyKey } from '@/lib/payoutSandboxCore';
import {
  newPayoutSandboxState,
  payoutSandboxCookie,
  payoutSandboxStripe,
  readPayoutSandboxState,
  safeStripeError,
} from '@/lib/payoutSandbox';

export const runtime = 'nodejs';

export async function POST() {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const stripe = payoutSandboxStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: 'The Stripe payout sandbox has not been configured yet.' },
      { status: 503 },
    );
  }

  let state = await readPayoutSandboxState(admin.email) || newPayoutSandboxState(admin.email);
  try {
    if (!state.accountId) {
      const account = await stripe.v2.core.accounts.create(
        {
          contact_email: 'ritvik.payout-sandbox@admitfolio.com',
          display_name: 'Ritvik Payout Sandbox',
          dashboard: 'express',
          identity: { country: 'us', entity_type: 'individual' },
          configuration: {
            recipient: {
              capabilities: {
                stripe_balance: { stripe_transfers: { requested: true } },
              },
            },
          },
          defaults: {
            currency: 'usd',
            locales: ['en-US'],
            profile: {
              business_url: SITE_URL,
              doing_business_as: 'Admitfolio Seller Sandbox',
              product_description: 'Synthetic marketplace seller used to test payout onboarding.',
            },
            responsibilities: {
              fees_collector: 'application',
              losses_collector: 'application',
            },
          },
          metadata: {
            admitfolio_environment: 'payout_sandbox',
            sandbox_session_id: state.sessionId,
          },
        },
        { idempotencyKey: sandboxIdempotencyKey(state.sessionId, 'account') },
      );
      if (account.livemode) throw new Error('Stripe returned a live account for a sandbox request.');
      state = { ...state, accountId: account.id };
    }
    const accountId = state.accountId;
    if (!accountId) throw new Error('The test connected account was not created.');

    const link = await stripe.v2.core.accountLinks.create({
      account: accountId,
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
    if (link.livemode) throw new Error('Stripe returned a live onboarding link for a sandbox request.');

    const response = NextResponse.json({ ok: true, url: link.url });
    const cookie = payoutSandboxCookie(state);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    return NextResponse.json({ error: safeStripeError(error) }, { status: 502 });
  }
}
