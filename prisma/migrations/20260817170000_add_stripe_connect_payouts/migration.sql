-- Create Stripe connected accounts only after a seller's first settled live
-- sale. These nullable fields are additive so deploying the code does not
-- enroll an existing seller or move any money by itself.
ALTER TABLE "Seller"
ADD COLUMN "stripeAccountId" TEXT,
ADD COLUMN "stripeOnboardingStartedAt" TIMESTAMP(3),
ADD COLUMN "stripeOnboardingCompleteAt" TIMESTAMP(3),
ADD COLUMN "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Purchase"
ADD COLUMN "stripeChargeId" TEXT,
ADD COLUMN "stripeTransferId" TEXT,
ADD COLUMN "sellerTransferStartedAt" TIMESTAMP(3),
ADD COLUMN "sellerTransferredAt" TIMESTAMP(3),
ADD COLUMN "sellerTransferAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "sellerTransferLastError" TEXT,
ADD COLUMN "sellerTransferReversedCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "sellerTransferLastReversalId" TEXT,
ADD COLUMN "sellerTransferReversedAt" TIMESTAMP(3),
ADD COLUMN "sellerTransferReversalStartedAt" TIMESTAMP(3),
ADD COLUMN "sellerTransferReversalLastError" TEXT;

CREATE UNIQUE INDEX "Seller_stripeAccountId_key" ON "Seller"("stripeAccountId");
CREATE UNIQUE INDEX "Purchase_stripeChargeId_key" ON "Purchase"("stripeChargeId");
CREATE UNIQUE INDEX "Purchase_stripeTransferId_key" ON "Purchase"("stripeTransferId");
CREATE INDEX "Purchase_sellerTransferredAt_idx" ON "Purchase"("sellerTransferredAt");

ALTER TABLE "Purchase"
ADD CONSTRAINT "Purchase_seller_transfer_state_check"
CHECK (
  ("stripeTransferId" IS NULL AND "sellerTransferredAt" IS NULL)
  OR
  ("stripeTransferId" IS NOT NULL AND "sellerTransferredAt" IS NOT NULL)
);

ALTER TABLE "Purchase"
ADD CONSTRAINT "Purchase_seller_reversal_amount_check"
CHECK (
  "sellerTransferReversedCents" >= 0
  AND (
    "sellerEarningsCents" IS NULL
    OR "sellerTransferReversedCents" <= "sellerEarningsCents"
  )
  AND (
    "stripeTransferId" IS NOT NULL
    OR "sellerTransferReversedCents" = 0
  )
);
