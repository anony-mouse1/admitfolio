export const LIVE_CHECKOUT_PREFIX = 'cs_live_';

export type ConnectedAccountSnapshot = {
  id: string;
  details_submitted?: boolean;
  payouts_enabled?: boolean;
  capabilities?: { transfers?: string | null } | null;
};

export function isLivePurchase(sessionId: string | null | undefined): boolean {
  return Boolean(sessionId?.startsWith(LIVE_CHECKOUT_PREFIX));
}

export function connectedAccountReady(account: ConnectedAccountSnapshot): boolean {
  return Boolean(
    account.details_submitted &&
      account.payouts_enabled &&
      account.capabilities?.transfers === 'active',
  );
}

export function connectedAccountStatus(input: {
  liveSaleCount: number;
  stripeAccountId: string | null;
  onboardingComplete: boolean;
  payoutsEnabled: boolean;
}): 'not_eligible' | 'setup_required' | 'in_review' | 'ready' {
  if (input.liveSaleCount < 1) return 'not_eligible';
  if (!input.stripeAccountId) return 'setup_required';
  if (input.onboardingComplete && input.payoutsEnabled) return 'ready';
  return 'in_review';
}

export function transferIdempotencyKey(purchaseId: string): string {
  return `admitfolio-seller-transfer-${purchaseId}`;
}

export function transferGroup(purchaseId: string): string {
  return `admitfolio_purchase_${purchaseId}`;
}

export function transferReversalIdempotencyKey(
  purchaseId: string,
  reversedCents: number,
): string {
  return `admitfolio-seller-reversal-${purchaseId}-${reversedCents}`;
}

export function sellerReversalTargetCents(input: {
  affectedGrossCents: number;
  grossAmountCents: number;
  sellerEarningsCents: number;
  sellerShareBps: number;
}): number {
  const values = Object.values(input);
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error('Seller reversal amounts must be non-negative integers.');
  }
  const affected = Math.min(input.affectedGrossCents, input.grossAmountCents);
  return Math.min(
    input.sellerEarningsCents,
    Math.round((affected * input.sellerShareBps) / 10_000),
  );
}
