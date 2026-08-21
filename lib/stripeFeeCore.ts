export type StripeFeeSnapshot =
  | { status: 'ready'; chargeId: string; feeCents: number }
  | { status: 'pending'; chargeId: string | null; reason: string };

type BalanceTransactionLike = {
  id?: unknown;
  fee?: unknown;
  amount?: unknown;
  currency?: unknown;
};

export type ChargeWithFeeLike = {
  id?: unknown;
  paid?: unknown;
  amount?: unknown;
  currency?: unknown;
  balance_transaction?: string | BalanceTransactionLike | null;
};

// Stripe may emit the paid Checkout event before the charge's balance
// transaction is expandable. Treat that as retryable, not as a zero fee.
export function stripeFeeSnapshotFromCharge(
  charge: ChargeWithFeeLike | null | undefined,
  expectedGrossCents: number,
  expectedCurrency: string,
): StripeFeeSnapshot {
  const chargeId = typeof charge?.id === 'string' ? charge.id : null;
  if (!chargeId) {
    return { status: 'pending', chargeId: null, reason: 'Stripe charge is not available yet.' };
  }
  if (
    charge?.paid !== true ||
    charge.amount !== expectedGrossCents ||
    typeof charge.currency !== 'string' ||
    charge.currency.toLowerCase() !== expectedCurrency.toLowerCase()
  ) {
    throw new Error('Stripe charge does not match the paid checkout.');
  }

  const balanceTransaction = charge.balance_transaction;
  if (!balanceTransaction || typeof balanceTransaction === 'string') {
    return {
      status: 'pending',
      chargeId,
      reason: 'Stripe balance transaction fee is not available yet.',
    };
  }
  if (
    !Number.isSafeInteger(balanceTransaction.fee) ||
    (balanceTransaction.fee as number) < 0 ||
    balanceTransaction.amount !== expectedGrossCents ||
    typeof balanceTransaction.currency !== 'string' ||
    balanceTransaction.currency.toLowerCase() !== expectedCurrency.toLowerCase()
  ) {
    throw new Error('Stripe balance transaction does not match the paid checkout.');
  }
  return {
    status: 'ready',
    chargeId,
    feeCents: balanceTransaction.fee as number,
  };
}
