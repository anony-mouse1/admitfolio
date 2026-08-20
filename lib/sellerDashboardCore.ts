export type SellerPayoutState = 'not_eligible' | 'setup_required' | 'in_review' | 'ready';

export type AdminPayoutSummary = {
  accountState: 'no_sales' | 'setup_needed' | 'stripe_review' | 'ready';
  connectedAccount: string | null;
  pendingCents: number;
  transferredCents: number;
  latestSafeError: string | null;
};

export function payoutAccountState(status: SellerPayoutState): AdminPayoutSummary['accountState'] {
  if (status === 'not_eligible') return 'no_sales';
  if (status === 'setup_required') return 'setup_needed';
  if (status === 'in_review') return 'stripe_review';
  return 'ready';
}

// Stripe errors can contain request details that do not belong in an admin UI.
// Keep the useful diagnosis while leaving the full error in server logs.
export function safePayoutErrorMessage(error: string | null | undefined): string | null {
  if (!error) return null;
  const message = error.toLowerCase();
  if (message.includes('insufficient') || message.includes('available balance')) {
    return 'The Stripe balance is not available yet. The transfer can be retried when the funds become available.';
  }
  if (
    message.includes('requirement') ||
    message.includes('payouts_enabled') ||
    message.includes('transfers') ||
    message.includes('connected account')
  ) {
    return 'Stripe is still reviewing the seller account or needs more payout details.';
  }
  if (message.includes('source') && message.includes('charge')) {
    return 'The original Stripe charge is not ready for a seller transfer.';
  }
  return 'The latest payout transfer attempt failed. Check the server logs for the private Stripe details.';
}

export function maskedConnectedAccount(accountId: string | null): string | null {
  if (!accountId) return null;
  if (accountId.length <= 8) return accountId;
  return `${accountId.slice(0, 5)}...${accountId.slice(-4)}`;
}

export function buildAdminPayoutSummary(input: {
  status: SellerPayoutState;
  stripeAccountId: string | null;
  pendingCents: number;
  paidCents: number;
  latestTransferError?: string | null;
}): AdminPayoutSummary {
  return {
    accountState: payoutAccountState(input.status),
    connectedAccount: maskedConnectedAccount(input.stripeAccountId),
    pendingCents: input.pendingCents,
    transferredCents: input.paidCents,
    latestSafeError: safePayoutErrorMessage(input.latestTransferError),
  };
}
