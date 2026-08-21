import 'server-only';
import type Stripe from 'stripe';
import { prisma } from './prisma';
import {
  normalizeBankPayoutStatus,
  shouldApplyBankPayoutEvent,
  summarizeBankPayouts,
  type BankPayoutStatus,
} from './sellerBankPayoutCore';

function stripeDate(seconds: number | null | undefined): Date | null {
  return typeof seconds === 'number' && Number.isFinite(seconds)
    ? new Date(seconds * 1000)
    : null;
}

export async function recordSellerBankPayout(input: {
  stripeAccountId: string;
  eventId: string;
  eventCreated: number;
  payout: Stripe.Payout;
}) {
  const status = normalizeBankPayoutStatus(input.payout.status);
  if (!status) return { recorded: false, reason: 'unsupported_status' as const };
  if (!Number.isSafeInteger(input.payout.amount) || input.payout.amount < 0) {
    return { recorded: false, reason: 'invalid_amount' as const };
  }

  const seller = await prisma.seller.findUnique({
    where: { stripeAccountId: input.stripeAccountId },
    select: { id: true },
  });
  if (!seller) return { recorded: false, reason: 'unknown_account' as const };

  const eventCreatedAt = new Date(input.eventCreated * 1000);
  const existing = await prisma.sellerBankPayout.findUnique({
    where: { id: input.payout.id },
    select: {
      status: true,
      stripeEventCreatedAt: true,
      stripeEventId: true,
      paidAt: true,
      failedAt: true,
    },
  });

  if (existing) {
    const currentStatus = normalizeBankPayoutStatus(existing.status) || 'pending';
    if (!shouldApplyBankPayoutEvent({
      currentStatus,
      currentEventCreatedAt: existing.stripeEventCreatedAt,
      currentEventId: existing.stripeEventId,
      incomingStatus: status,
      incomingEventCreatedAt: eventCreatedAt,
      incomingEventId: input.eventId,
    })) return { recorded: false, reason: 'stale_or_duplicate' as const };
  }

  const paidAt = status === 'paid' ? eventCreatedAt : existing?.paidAt || null;
  const failedAt = status === 'failed' ? eventCreatedAt : existing?.failedAt || null;
  const data = {
    sellerId: seller.id,
    stripeAccountId: input.stripeAccountId,
    amountCents: input.payout.amount,
    currency: input.payout.currency.toLowerCase(),
    status,
    automatic: input.payout.automatic,
    arrivalDate: stripeDate(input.payout.arrival_date),
    failureCode: input.payout.failure_code || null,
    stripeCreatedAt: stripeDate(input.payout.created) || eventCreatedAt,
    stripeEventCreatedAt: eventCreatedAt,
    stripeEventId: input.eventId,
    paidAt,
    failedAt,
  };

  if (!existing) {
    // A unique-key race is intentionally allowed to fail. Stripe retries the
    // event, then the normal stale-event guard resolves the final state.
    await prisma.sellerBankPayout.create({ data: { id: input.payout.id, ...data } });
    return { recorded: true, reason: null };
  }

  const terminalStatuses: BankPayoutStatus[] = ['paid', 'failed', 'canceled'];
  const sameTimeAllowedStatuses: BankPayoutStatus[] = status === 'pending'
    ? []
    : status === 'in_transit'
      ? ['pending']
      : ['pending', 'in_transit'];
  const updated = await prisma.sellerBankPayout.updateMany({
    where: {
      id: input.payout.id,
      stripeEventId: { not: input.eventId },
      ...(terminalStatuses.includes(status) ? {} : { status: { notIn: terminalStatuses } }),
      OR: [
        { stripeEventCreatedAt: { lt: eventCreatedAt } },
        ...(sameTimeAllowedStatuses.length ? [{
          stripeEventCreatedAt: eventCreatedAt,
          status: { in: sameTimeAllowedStatuses },
        }] : []),
      ],
    },
    data,
  });
  if (updated.count !== 1) return { recorded: false, reason: 'stale_or_duplicate' as const };
  return { recorded: true, reason: null };
}

export async function sellerBankPayoutSummary(sellerId: string) {
  const rows = await prisma.sellerBankPayout.findMany({
    where: { sellerId },
    orderBy: [{ stripeCreatedAt: 'desc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      amountCents: true,
      currency: true,
      status: true,
      arrivalDate: true,
      failureCode: true,
      stripeCreatedAt: true,
    },
  });
  return summarizeBankPayouts(rows);
}

export type { BankPayoutStatus };
