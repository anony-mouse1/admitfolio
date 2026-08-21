-- Future Checkout v3 purchases subtract Stripe's actual processing fee from
-- the seller's 60% share. Existing Purchase rows keep their original immutable
-- 60/40 snapshots because this migration is additive and performs no backfill.
ALTER TABLE "Purchase"
ADD COLUMN "stripeProcessingFeeCents" INTEGER,
ADD COLUMN "checkoutVersion" TEXT;

ALTER TABLE "Purchase"
DROP CONSTRAINT "Purchase_accounting_complete_and_balanced";

ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_accounting_complete_and_balanced" CHECK (
  -- Prototype rows with no cents snapshot.
  (
    "grossAmountCents" IS NULL AND
    "sellerEarningsCents" IS NULL AND
    "platformFeeCents" IS NULL AND
    "stripeProcessingFeeCents" IS NULL AND
    "sellerShareBps" IS NULL AND
    "currency" IS NULL AND
    "checkoutVersion" IS NULL
  ) OR
  -- Existing snapshots and v2 sessions preserve the seller's original 60%.
  (
    "grossAmountCents" > 0 AND
    "sellerEarningsCents" >= 0 AND
    "platformFeeCents" >= 0 AND
    "stripeProcessingFeeCents" IS NULL AND
    "sellerEarningsCents" + "platformFeeCents" = "grossAmountCents" AND
    "sellerShareBps" BETWEEN 0 AND 10000 AND
    "currency" IS NOT NULL AND
    ("checkoutVersion" IS NULL OR "checkoutVersion" = '2')
  ) OR
  -- A v3 purchase may exist briefly after buyer delivery while Stripe creates
  -- the balance transaction that contains the real processing fee.
  (
    "grossAmountCents" > 0 AND
    "sellerEarningsCents" IS NULL AND
    "platformFeeCents" >= 0 AND
    "stripeProcessingFeeCents" IS NULL AND
    "sellerShareBps" BETWEEN 0 AND 10000 AND
    "currency" IS NOT NULL AND
    "checkoutVersion" = '3'
  ) OR
  -- Final v3 accounting. This is the only state eligible for seller transfer.
  (
    "grossAmountCents" > 0 AND
    "sellerEarningsCents" >= 0 AND
    "platformFeeCents" >= 0 AND
    "stripeProcessingFeeCents" >= 0 AND
    "sellerEarningsCents" + "platformFeeCents" + "stripeProcessingFeeCents" = "grossAmountCents" AND
    "sellerShareBps" BETWEEN 0 AND 10000 AND
    "currency" IS NOT NULL AND
    "checkoutVersion" = '3'
  )
);
