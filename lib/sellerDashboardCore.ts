export type SellerPayoutState = 'not_eligible' | 'setup_required' | 'in_review' | 'ready';

export type SellerAccountingRow = {
  grossAmountCents: number;
  sellerEarningsCents: number;
  platformFeeCents: number;
  stripeProcessingFeeCents: number;
  createdAt: Date;
};

export function summarizeSellerAccounting(rows: SellerAccountingRow[], monthStart: Date) {
  const monthRows = rows.filter((row) => row.createdAt >= monthStart);
  const sum = (items: SellerAccountingRow[], key: keyof Omit<SellerAccountingRow, 'createdAt'>) =>
    items.reduce((total, item) => total + item[key], 0);
  return {
    allTimeGrossCents: sum(rows, 'grossAmountCents'),
    allTimeSellerEarningsCents: sum(rows, 'sellerEarningsCents'),
    allTimePlatformFeeCents: sum(rows, 'platformFeeCents'),
    allTimeStripeProcessingFeeCents: sum(rows, 'stripeProcessingFeeCents'),
    monthGrossCents: sum(monthRows, 'grossAmountCents'),
    monthSellerEarningsCents: sum(monthRows, 'sellerEarningsCents'),
    monthPlatformFeeCents: sum(monthRows, 'platformFeeCents'),
    monthStripeProcessingFeeCents: sum(monthRows, 'stripeProcessingFeeCents'),
  };
}

export type AdminPayoutSummary = {
  accountState: 'no_sales' | 'setup_needed' | 'stripe_review' | 'ready';
  connectedAccount: string | null;
  pendingCents: number;
  transferredCents: number;
  stripeBalanceCents: number;
  bankInTransitCents: number;
  bankPaidCents: number;
  latestBankPayoutStatus: string | null;
  latestBankPayoutArrivalDate: Date | null;
  latestSafeError: string | null;
  latestBankPayoutError: string | null;
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
  bankPayouts?: {
    stripeBalanceCents: number;
    inTransitCents: number;
    paidCents: number;
    latest: {
      status: string;
      arrivalDate: Date | null;
      failureMessage: string | null;
    } | null;
  };
  latestTransferError?: string | null;
}): AdminPayoutSummary {
  return {
    accountState: payoutAccountState(input.status),
    connectedAccount: maskedConnectedAccount(input.stripeAccountId),
    pendingCents: input.pendingCents,
    transferredCents: input.paidCents,
    stripeBalanceCents: input.bankPayouts?.stripeBalanceCents || 0,
    bankInTransitCents: input.bankPayouts?.inTransitCents || 0,
    bankPaidCents: input.bankPayouts?.paidCents || 0,
    latestBankPayoutStatus: input.bankPayouts?.latest?.status || null,
    latestBankPayoutArrivalDate: input.bankPayouts?.latest?.arrivalDate || null,
    latestSafeError: safePayoutErrorMessage(input.latestTransferError),
    latestBankPayoutError: input.bankPayouts?.latest?.failureMessage || null,
  };
}
