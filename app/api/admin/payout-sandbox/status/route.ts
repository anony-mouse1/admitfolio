import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/adminAuth';
import {
  PAYOUT_SANDBOX_GROSS_CENTS,
  PAYOUT_SANDBOX_PLATFORM_CENTS,
  PAYOUT_SANDBOX_SELLER_CENTS,
  sandboxAccountStatus,
} from '@/lib/payoutSandboxCore';
import { payoutSandboxStripe, readPayoutSandboxState, safeStripeError } from '@/lib/payoutSandbox';

export const runtime = 'nodejs';

export async function GET() {
  const admin = currentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const stripe = payoutSandboxStripe();
  const state = readPayoutSandboxState(admin.email);
  if (!stripe) {
    return NextResponse.json({
      configured: false,
      state: 'setup_required',
      grossCents: PAYOUT_SANDBOX_GROSS_CENTS,
      platformCents: PAYOUT_SANDBOX_PLATFORM_CENTS,
      sellerCents: PAYOUT_SANDBOX_SELLER_CENTS,
    });
  }
  if (!state?.accountId) {
    return NextResponse.json({
      configured: true,
      state: 'setup_required',
      grossCents: PAYOUT_SANDBOX_GROSS_CENTS,
      platformCents: PAYOUT_SANDBOX_PLATFORM_CENTS,
      sellerCents: PAYOUT_SANDBOX_SELLER_CENTS,
      saleCreated: Boolean(state?.chargeId),
      transferCreated: false,
    });
  }

  try {
    const account = await stripe.v2.core.accounts.retrieve(state.accountId, {
      include: ['configuration.recipient', 'requirements'],
    });
    const accountState = sandboxAccountStatus(account);
    return NextResponse.json({
      configured: true,
      state: accountState.status,
      transfers: accountState.transfers,
      payouts: accountState.payouts,
      accountId: state.accountId,
      saleCreated: Boolean(state.chargeId),
      transferCreated: Boolean(state.transferId),
      paymentIntentId: state.paymentIntentId || null,
      transferId: state.transferId || null,
      grossCents: PAYOUT_SANDBOX_GROSS_CENTS,
      platformCents: PAYOUT_SANDBOX_PLATFORM_CENTS,
      sellerCents: PAYOUT_SANDBOX_SELLER_CENTS,
    });
  } catch (error) {
    return NextResponse.json({ error: safeStripeError(error) }, { status: 502 });
  }
}
