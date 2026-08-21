export const BANK_PAYOUT_EVENT_TYPES = [
  'payout.created',
  'payout.updated',
  'payout.paid',
  'payout.failed',
] as const;

export type BankPayoutEventType = (typeof BANK_PAYOUT_EVENT_TYPES)[number];
export type BankPayoutStatus = 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled';

export type BankPayoutRow = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  arrivalDate: Date | null;
  failureCode: string | null;
  stripeCreatedAt: Date;
};

export function isBankPayoutEvent(type: string): type is BankPayoutEventType {
  return BANK_PAYOUT_EVENT_TYPES.includes(type as BankPayoutEventType);
}

export function normalizeBankPayoutStatus(status: string): BankPayoutStatus | null {
  if (
    status === 'pending' ||
    status === 'in_transit' ||
    status === 'paid' ||
    status === 'failed' ||
    status === 'canceled'
  ) return status;
  return null;
}

const TERMINAL_STATUSES = new Set<BankPayoutStatus>(['paid', 'failed', 'canceled']);
const STATUS_RANK: Record<BankPayoutStatus, number> = {
  pending: 0,
  in_transit: 1,
  paid: 2,
  failed: 2,
  canceled: 2,
};

export function shouldApplyBankPayoutEvent(input: {
  currentStatus: BankPayoutStatus;
  currentEventCreatedAt: Date;
  currentEventId: string;
  incomingStatus: BankPayoutStatus;
  incomingEventCreatedAt: Date;
  incomingEventId: string;
}) {
  if (input.currentEventId === input.incomingEventId) return false;
  if (
    TERMINAL_STATUSES.has(input.currentStatus) &&
    !TERMINAL_STATUSES.has(input.incomingStatus)
  ) return false;
  const currentTime = input.currentEventCreatedAt.getTime();
  const incomingTime = input.incomingEventCreatedAt.getTime();
  if (incomingTime !== currentTime) return incomingTime > currentTime;
  return STATUS_RANK[input.incomingStatus] >= STATUS_RANK[input.currentStatus];
}

export function safeBankPayoutFailureMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  if (['account_closed', 'invalid_account_number', 'no_account'].includes(code)) {
    return 'Stripe could not deposit this payout because the bank account details are no longer valid. The seller needs to update their payout account in Stripe.';
  }
  if (['account_frozen', 'bank_account_restricted'].includes(code)) {
    return 'The seller bank account cannot receive this payout. The seller needs to contact their bank or choose another payout account in Stripe.';
  }
  if (['could_not_process', 'declined'].includes(code)) {
    return 'The bank could not complete this payout. The seller should review their payout account in Stripe and try again.';
  }
  return 'Stripe could not deposit the latest payout. The seller needs to review their payout account in Stripe.';
}

export function summarizeBankPayouts(rows: BankPayoutRow[]) {
  const paidCents = rows.reduce(
    (total, row) => total + (row.status === 'paid' ? row.amountCents : 0),
    0,
  );
  const inTransitCents = rows.reduce(
    (total, row) => total + (row.status === 'pending' || row.status === 'in_transit' ? row.amountCents : 0),
    0,
  );
  const failedCents = rows.reduce(
    (total, row) => total + (row.status === 'failed' ? row.amountCents : 0),
    0,
  );
  const latest = rows[0] || null;
  return {
    paidCents,
    inTransitCents,
    failedCents,
    latest: latest ? {
      id: latest.id,
      amountCents: latest.amountCents,
      currency: latest.currency,
      status: normalizeBankPayoutStatus(latest.status) || 'pending',
      arrivalDate: latest.arrivalDate,
      failureMessage: safeBankPayoutFailureMessage(latest.failureCode),
    } : null,
  };
}
