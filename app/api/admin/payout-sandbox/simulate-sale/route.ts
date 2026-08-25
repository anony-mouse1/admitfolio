import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/adminAuth';
import {
  PAYOUT_SANDBOX_GROSS_CENTS,
  PAYOUT_SANDBOX_SELLER_CENTS,
  sandboxAccountStatus,
  sandboxIdempotencyKey,
} from '@/lib/payoutSandboxCore';
import {
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
  const current = await readPayoutSandboxState(admin.email);
  if (!stripe || !current?.accountId) {
    return NextResponse.json({ error: 'Start the payout setup first.' }, { status: 409 });
  }

  let state = current;
  const accountId = current.accountId;
  try {
    const account = await stripe.v2.core.accounts.retrieve(accountId, {
      include: ['configuration.recipient'],
    });
    const accountState = sandboxAccountStatus(account);

    if (!state.chargeId) {
      const intent = await stripe.paymentIntents.create(
        {
          amount: PAYOUT_SANDBOX_GROSS_CENTS,
          currency: 'usd',
          confirm: true,
          payment_method: 'pm_card_visa',
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
          description: 'Admitfolio payout sandbox sale',
          metadata: {
            admitfolio_environment: 'payout_sandbox',
            sandbox_session_id: state.sessionId,
          },
        },
        { idempotencyKey: sandboxIdempotencyKey(state.sessionId, 'sale') },
      );
      if (intent.livemode) throw new Error('Stripe returned a live payment for a sandbox request.');
      const chargeId = typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id;
      if (!chargeId) throw new Error('The test payment did not create a charge.');
      state = { ...state, paymentIntentId: intent.id, chargeId };
    }

    if (accountState.status === 'ready' && !state.transferId) {
      const chargeId = state.chargeId;
      if (!chargeId) throw new Error('Create the test charge before transferring seller earnings.');
      const transfer = await stripe.transfers.create(
        {
          amount: PAYOUT_SANDBOX_SELLER_CENTS,
          currency: 'usd',
          destination: accountId,
          source_transaction: chargeId,
          transfer_group: `admitfolio_sandbox_${state.sessionId}`,
          metadata: {
            admitfolio_environment: 'payout_sandbox',
            sandbox_session_id: state.sessionId,
          },
        },
        { idempotencyKey: sandboxIdempotencyKey(state.sessionId, 'transfer') },
      );
      if (transfer.livemode) throw new Error('Stripe returned a live transfer for a sandbox request.');
      state = { ...state, transferId: transfer.id };
    }

    const response = NextResponse.json({
      ok: true,
      saleCreated: Boolean(state.chargeId),
      transferCreated: Boolean(state.transferId),
      accountReady: accountState.status === 'ready',
    });
    const cookie = payoutSandboxCookie(state);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    return NextResponse.json({ error: safeStripeError(error) }, { status: 502 });
  }
}
