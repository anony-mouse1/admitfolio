import 'server-only';
import { prisma } from './prisma';
import { SESSION_SECRET } from './config';
import { SITE_URL } from './stripe';
import { makeAccessToken } from './accessToken';
import { sendPurchaseReceipt } from './email';
import { makePurchaseFingerprint, normalizeBuyerEmail } from './purchaseFingerprint';
import {
  fulfillPurchaseCore,
  type FulfillmentInput,
  type FulfillmentResult,
} from './purchaseFulfillmentCore';

export type PurchaseFulfillmentInput = FulfillmentInput;
export type PurchaseFulfillmentResult = FulfillmentResult;

const LEASE_MS = 10 * 60 * 1000;

function shortError(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').slice(0, 500);
}

// Payment integration point. The Stripe webhook must first upsert the Purchase
// using stripeSessionId, then call this once with that purchase's canonical
// values. A false result should become a non-2xx webhook response so Stripe can
// retry. The claim below makes those retries safe and prevents duplicate mail.
export async function fulfillPurchase(input: PurchaseFulfillmentInput): Promise<PurchaseFulfillmentResult> {
  const canonicalInput = { ...input, buyerEmail: normalizeBuyerEmail(input.buyerEmail) };

  return fulfillPurchaseCore(canonicalInput, {
    production: process.env.NODE_ENV === 'production',
    fingerprint: (purchaseId, buyerEmail) =>
      makePurchaseFingerprint(purchaseId, buyerEmail, SESSION_SECRET),
    accessUrl: (purchaseId) => `${SITE_URL}/purchase/${makeAccessToken(purchaseId)}`,
    claim: async (purchaseId, fingerprint) => {
      const purchase = await prisma.purchase.findUnique({
        where: { id: purchaseId },
        select: {
          buyerEmail: true,
          listingId: true,
          itemLabel: true,
          amount: true,
          grossAmountCents: true,
          buyerIp: true,
          deliveryFingerprint: true,
          deliveryStartedAt: true,
          deliveryEmailSentAt: true,
        },
      });
      if (!purchase) return 'missing';
      const storedAmountCents = purchase.grossAmountCents ?? purchase.amount * 100;
      if (
        normalizeBuyerEmail(purchase.buyerEmail) !== canonicalInput.buyerEmail ||
        purchase.listingId !== canonicalInput.listingId ||
        (purchase.itemLabel != null && purchase.itemLabel !== canonicalInput.itemLabel) ||
        storedAmountCents !== canonicalInput.amountCents ||
        (purchase.buyerIp != null && canonicalInput.buyerIp != null && purchase.buyerIp !== canonicalInput.buyerIp)
      ) {
        return 'purchase_mismatch';
      }
      if (purchase.deliveryFingerprint && purchase.deliveryFingerprint !== fingerprint) {
        return 'fingerprint_mismatch';
      }
      if (purchase.deliveryEmailSentAt) return 'sent';

      const staleBefore = new Date(Date.now() - LEASE_MS);
      const claimed = await prisma.purchase.updateMany({
        where: {
          id: purchaseId,
          deliveryEmailSentAt: null,
          OR: [
            { deliveryStartedAt: null },
            { deliveryStartedAt: { lt: staleBefore } },
          ],
          AND: [
            {
              OR: [
                { deliveryFingerprint: null },
                { deliveryFingerprint: fingerprint },
              ],
            },
          ],
        },
        data: {
          deliveryFingerprint: fingerprint,
          deliveryStartedAt: new Date(),
          deliveryAttempts: { increment: 1 },
          deliveryLastError: null,
        },
      });
      if (claimed.count === 1) return 'claimed';

      const current = await prisma.purchase.findUnique({
        where: { id: purchaseId },
        select: { deliveryFingerprint: true, deliveryEmailSentAt: true },
      });
      if (!current) return 'missing';
      if (current.deliveryFingerprint && current.deliveryFingerprint !== fingerprint) {
        return 'fingerprint_mismatch';
      }
      return current.deliveryEmailSentAt ? 'sent' : 'busy';
    },
    sendEmail: (purchase, fingerprint, accessUrl) =>
      sendPurchaseReceipt(purchase.buyerEmail, {
        itemLabel: purchase.itemLabel,
        amountCents: purchase.amountCents,
        accessUrl,
        fingerprint,
      }),
    markSent: async (purchaseId, fingerprint) => {
      await prisma.purchase.updateMany({
        where: { id: purchaseId, deliveryFingerprint: fingerprint, deliveryEmailSentAt: null },
        data: {
          deliveryEmailSentAt: new Date(),
          deliveryStartedAt: null,
          deliveryLastError: null,
        },
      });
    },
    markFailed: async (purchaseId, fingerprint, error) => {
      await prisma.purchase.updateMany({
        where: { id: purchaseId, deliveryFingerprint: fingerprint, deliveryEmailSentAt: null },
        data: { deliveryStartedAt: null, deliveryLastError: shortError(error) },
      });
    },
  });
}
