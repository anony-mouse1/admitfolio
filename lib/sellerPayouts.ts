import 'server-only';
import type Stripe from 'stripe';
import { prisma } from './prisma';
import { stripe } from './stripe';
import { purchaseAccounting } from './commerce';
import {
  connectedAccountReady,
  sellerReversalTargetCents,
  transferGroup,
  transferIdempotencyKey,
  transferReversalIdempotencyKey,
} from './sellerPayoutsCore';

const TRANSFER_LEASE_MS = 10 * 60 * 1000;

function chargeIdFromPaymentIntent(intent: Stripe.PaymentIntent): string | null {
  const charge = intent.latest_charge;
  if (typeof charge === 'string') return charge;
  return charge?.id || null;
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : 'Stripe transfer failed.').slice(0, 500);
}

export async function retrieveConnectedAccount(accountId: string): Promise<Stripe.V2.Core.Account> {
  if (!stripe) throw new Error('Stripe is not configured.');
  return stripe.v2.core.accounts.retrieve(accountId, {
    include: ['configuration.recipient', 'requirements', 'future_requirements'],
  });
}

export async function syncConnectedAccount(account: Stripe.V2.Core.Account) {
  const ready = connectedAccountReady(account);
  return prisma.seller.updateMany({
    where: { stripeAccountId: account.id },
    data: {
      stripePayoutsEnabled: ready,
      stripeOnboardingCompleteAt: ready ? new Date() : null,
    },
  });
}

export async function releaseSellerEarnings(sellerId: string): Promise<{
  ready: boolean;
  transferred: number;
  failed: number;
}> {
  if (!stripe) return { ready: false, transferred: 0, failed: 0 };

  const seller = await prisma.seller.findUnique({
    where: { id: sellerId },
    select: { stripeAccountId: true },
  });
  if (!seller?.stripeAccountId) return { ready: false, transferred: 0, failed: 0 };

  const account = await retrieveConnectedAccount(seller.stripeAccountId);
  const ready = connectedAccountReady(account);
  await syncConnectedAccount(account);
  if (!ready) return { ready: false, transferred: 0, failed: 0 };

  const staleBefore = new Date(Date.now() - TRANSFER_LEASE_MS);
  const pending = await prisma.purchase.findMany({
    where: {
      listing: { sellerId },
      stripeSessionId: { startsWith: 'cs_live_' },
      // Never pay out a sale before the buyer's protected copy has actually
      // been delivered. A failed email stays retryable in the checkout webhook.
      deliveryEmailSentAt: { not: null },
      // Checkout v3 purchases stay here with null seller earnings until the
      // actual Stripe fee is snapshotted. They must never transfer early.
      sellerEarningsCents: { not: null },
      stripeTransferId: null,
      sellerTransferredAt: null,
      OR: [
        { sellerTransferStartedAt: null },
        { sellerTransferStartedAt: { lt: staleBefore } },
      ],
    },
    select: {
      id: true,
      listingId: true,
      amount: true,
      grossAmountCents: true,
      sellerEarningsCents: true,
      platformFeeCents: true,
      stripeProcessingFeeCents: true,
      sellerShareBps: true,
      checkoutVersion: true,
      currency: true,
      stripePaymentIntentId: true,
      stripeChargeId: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  let transferred = 0;
  let failed = 0;
  for (const purchase of pending) {
    const claimed = await prisma.purchase.updateMany({
      where: {
        id: purchase.id,
        stripeTransferId: null,
        sellerTransferredAt: null,
        OR: [
          { sellerTransferStartedAt: null },
          { sellerTransferStartedAt: { lt: staleBefore } },
        ],
      },
      data: {
        sellerTransferStartedAt: new Date(),
        sellerTransferAttempts: { increment: 1 },
        sellerTransferLastError: null,
      },
    });
    if (claimed.count !== 1) continue;

    try {
      const accounting = purchaseAccounting(purchase);
      if (accounting.sellerEarningsCents < 1) {
        throw new Error('Seller entitlement must be at least one cent.');
      }

      let chargeId = purchase.stripeChargeId;
      if (!chargeId) {
        if (!purchase.stripePaymentIntentId) {
          throw new Error('Paid purchase is missing its Stripe PaymentIntent.');
        }
        const intent = await stripe.paymentIntents.retrieve(purchase.stripePaymentIntentId, {
          expand: ['latest_charge'],
        });
        chargeId = chargeIdFromPaymentIntent(intent);
        if (!chargeId) throw new Error('Paid purchase is missing its Stripe charge.');
        await prisma.purchase.update({
          where: { id: purchase.id },
          data: { stripeChargeId: chargeId },
        });
      }

      // A seller who finishes onboarding after a refund must never receive the
      // original entitlement. Reconcile the charge immediately before moving
      // money instead of trusting an old purchase snapshot alone.
      const charge = await stripe.charges.retrieve(chargeId);
      if (
        !charge.paid ||
        charge.refunded ||
        charge.disputed ||
        charge.amount_refunded > 0 ||
        charge.amount !== accounting.grossAmountCents ||
        charge.currency !== (purchase.currency || 'usd')
      ) {
        throw new Error('Stripe charge is not eligible for seller payout.');
      }

      const transfer = await stripe.transfers.create(
        {
          amount: accounting.sellerEarningsCents,
          currency: purchase.currency || 'usd',
          destination: seller.stripeAccountId,
          source_transaction: chargeId,
          transfer_group: transferGroup(purchase.id),
          metadata: {
            purchaseId: purchase.id,
            listingId: purchase.listingId || '',
            sellerId,
          },
        },
        { idempotencyKey: transferIdempotencyKey(purchase.id) },
      );

      await prisma.purchase.update({
        where: { id: purchase.id },
        data: {
          stripeChargeId: chargeId,
          stripeTransferId: transfer.id,
          sellerTransferredAt: new Date(),
          sellerTransferLastError: null,
        },
      });
      transferred += 1;
    } catch (error) {
      failed += 1;
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: { sellerTransferLastError: errorText(error) },
      }).catch(() => {});
      console.error('seller payout transfer failed', {
        purchaseId: purchase.id,
        sellerId,
        error: errorText(error),
      });
    }
  }

  return { ready: true, transferred, failed };
}

export async function reverseSellerTransfer(input: {
  chargeId: string;
  affectedGrossCents: number;
  reason: 'refund' | 'lost_dispute';
}): Promise<{ reversed: boolean; amountCents: number }> {
  if (!stripe || !Number.isSafeInteger(input.affectedGrossCents) || input.affectedGrossCents < 1) {
    return { reversed: false, amountCents: 0 };
  }

  const purchase = await prisma.purchase.findUnique({
    where: { stripeChargeId: input.chargeId },
    select: {
      id: true,
      amount: true,
      grossAmountCents: true,
      sellerEarningsCents: true,
      platformFeeCents: true,
      stripeProcessingFeeCents: true,
      sellerShareBps: true,
      checkoutVersion: true,
      stripeTransferId: true,
      sellerTransferReversedCents: true,
      sellerTransferReversalStartedAt: true,
    },
  });
  if (!purchase?.stripeTransferId) return { reversed: false, amountCents: 0 };

  const accounting = purchaseAccounting(purchase);
  const targetReversedCents = sellerReversalTargetCents({
    affectedGrossCents: input.affectedGrossCents,
    grossAmountCents: accounting.grossAmountCents,
    sellerEarningsCents: accounting.sellerEarningsCents,
    sellerShareBps: accounting.sellerShareBps,
  });
  const delta = targetReversedCents - purchase.sellerTransferReversedCents;
  if (delta <= 0) return { reversed: false, amountCents: 0 };

  const staleBefore = new Date(Date.now() - TRANSFER_LEASE_MS);
  const claimed = await prisma.purchase.updateMany({
    where: {
      id: purchase.id,
      sellerTransferReversedCents: purchase.sellerTransferReversedCents,
      OR: [
        { sellerTransferReversalStartedAt: null },
        { sellerTransferReversalStartedAt: { lt: staleBefore } },
      ],
    },
    data: {
      sellerTransferReversalStartedAt: new Date(),
      sellerTransferReversalLastError: null,
    },
  });
  if (claimed.count !== 1) {
    throw new Error('Seller transfer reversal is already in progress.');
  }

  try {
    const reversal = await stripe.transfers.createReversal(
      purchase.stripeTransferId,
      {
        amount: delta,
        metadata: { purchaseId: purchase.id, reason: input.reason },
      },
      { idempotencyKey: transferReversalIdempotencyKey(purchase.id, targetReversedCents) },
    );
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        sellerTransferReversedCents: targetReversedCents,
        sellerTransferLastReversalId: reversal.id,
        sellerTransferReversedAt:
          targetReversedCents === accounting.sellerEarningsCents ? new Date() : null,
        sellerTransferReversalStartedAt: null,
        sellerTransferReversalLastError: null,
      },
    });
    return { reversed: true, amountCents: delta };
  } catch (error) {
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { sellerTransferReversalLastError: errorText(error) },
    }).catch(() => {});
    throw error;
  }
}
