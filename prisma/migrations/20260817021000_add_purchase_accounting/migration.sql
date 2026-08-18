-- Store the exact 60/40 split at the time of purchase. Fields are nullable so
-- this additive migration does not rewrite prototype rows. There were no live
-- purchases before the 60/40 split.
ALTER TABLE "Purchase"
ADD COLUMN "grossAmountCents" INTEGER,
ADD COLUMN "sellerEarningsCents" INTEGER,
ADD COLUMN "platformFeeCents" INTEGER,
ADD COLUMN "sellerShareBps" INTEGER,
ADD COLUMN "currency" TEXT,
ADD COLUMN "stripePaymentIntentId" TEXT,
ADD COLUMN "sellerNotifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Purchase_stripePaymentIntentId_key" ON "Purchase"("stripePaymentIntentId");
CREATE INDEX "Purchase_sellerNotifiedAt_idx" ON "Purchase"("sellerNotifiedAt");

ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_accounting_complete_and_balanced" CHECK (
  (
    "grossAmountCents" IS NULL AND
    "sellerEarningsCents" IS NULL AND
    "platformFeeCents" IS NULL AND
    "sellerShareBps" IS NULL AND
    "currency" IS NULL
  ) OR (
    "grossAmountCents" > 0 AND
    "sellerEarningsCents" >= 0 AND
    "platformFeeCents" >= 0 AND
    "sellerEarningsCents" + "platformFeeCents" = "grossAmountCents" AND
    "sellerShareBps" BETWEEN 0 AND 10000 AND
    "currency" IS NOT NULL
  )
);
