import type Stripe from 'stripe';
import { prisma } from './prisma';
import { sendCheckoutRecoveryEmail } from './email';
import {
  recoverExpiredCheckout,
  type CheckoutRecoveryCandidate,
  type CheckoutRecoveryResult,
} from './checkoutRecoveryCore';

const RECOVERY_SEND_LEASE_MS = 10 * 60 * 1000;

async function listingAvailable(candidate: CheckoutRecoveryCandidate): Promise<boolean> {
  const listing = await prisma.listing.findUnique({
    where: { id: candidate.listingId },
    select: {
      status: true,
      pricingMode: true,
      packagePrice: true,
      essays: { select: { pdfPath: true } },
    },
  });
  return Boolean(
    listing &&
    listing.status === 'approved' &&
    listing.pricingMode === 'package' &&
    Number.isSafeInteger(listing.packagePrice) &&
    (listing.packagePrice ?? 0) * 100 === candidate.amountCents &&
    listing.essays.length > 0 &&
    listing.essays.every((essay) => essay.pdfPath?.trim()),
  );
}

async function alreadyPurchased(candidate: CheckoutRecoveryCandidate): Promise<boolean> {
  const purchase = await prisma.purchase.findFirst({
    where: {
      listingId: candidate.listingId,
      buyerEmail: candidate.email,
      createdAt: { gte: candidate.sessionCreatedAt },
    },
    select: { id: true },
  });
  return Boolean(purchase);
}

async function claim(candidate: CheckoutRecoveryCandidate) {
  let recovery = await prisma.checkoutRecoveryEmail.findFirst({
    where: {
      OR: [
        { email: candidate.email },
        { stripeSessionId: candidate.stripeSessionId },
      ],
    },
  });

  if (!recovery) {
    try {
      recovery = await prisma.checkoutRecoveryEmail.create({
        data: {
          email: candidate.email,
          stripeSessionId: candidate.stripeSessionId,
          listingId: candidate.listingId,
          itemLabel: candidate.itemLabel,
          amountCents: candidate.amountCents,
          sessionCreatedAt: candidate.sessionCreatedAt,
          recoveryExpiresAt: candidate.recoveryExpiresAt,
        },
      });
    } catch (error) {
      const duplicate = error && typeof error === 'object' && 'code' in error &&
        (error as { code?: string }).code === 'P2002';
      if (!duplicate) throw error;
      recovery = await prisma.checkoutRecoveryEmail.findFirst({
        where: {
          OR: [
            { email: candidate.email },
            { stripeSessionId: candidate.stripeSessionId },
          ],
        },
      });
      if (!recovery) throw error;
    }
  }

  // Email is globally unique. Once a shopper has any reminder row, a later
  // abandoned Session cannot create another message, even if the first row is
  // still waiting on a retry.
  if (
    recovery.email !== candidate.email ||
    recovery.stripeSessionId !== candidate.stripeSessionId ||
    recovery.sentAt
  ) {
    return { status: 'sent' as const };
  }

  const staleBefore = new Date(Date.now() - RECOVERY_SEND_LEASE_MS);
  const acquired = await prisma.checkoutRecoveryEmail.updateMany({
    where: {
      id: recovery.id,
      sentAt: null,
      OR: [
        { sendStartedAt: null },
        { sendStartedAt: { lt: staleBefore } },
      ],
    },
    data: {
      sendStartedAt: new Date(),
      sendAttempts: { increment: 1 },
      lastError: null,
    },
  });
  if (acquired.count !== 1) return { status: 'busy' as const };
  return { status: 'claimed' as const, recoveryId: recovery.id };
}

export async function handleExpiredCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<CheckoutRecoveryResult> {
  return recoverExpiredCheckout(session, {
    production: process.env.NODE_ENV === 'production',
    listingAvailable,
    alreadyPurchased,
    claim,
    sendEmail: (candidate, recoveryId) =>
      sendCheckoutRecoveryEmail(candidate.email, {
        itemLabel: candidate.itemLabel,
        amountCents: candidate.amountCents,
        recoveryUrl: candidate.recoveryUrl,
        recoveryId,
      }),
    markSent: async (recoveryId) => {
      await prisma.checkoutRecoveryEmail.update({
        where: { id: recoveryId },
        data: {
          sentAt: new Date(),
          sendStartedAt: null,
          lastError: null,
        },
      });
    },
    markFailed: async (recoveryId, error) => {
      await prisma.checkoutRecoveryEmail.update({
        where: { id: recoveryId },
        data: {
          sendStartedAt: null,
          lastError: error.slice(0, 1_000),
        },
      });
    },
  });
}
