-- Track Stripe payouts from connected balances to seller bank accounts.
-- This is additive and intentionally does not backfill historical transfers.
CREATE TABLE "SellerBankPayout" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "stripeAccountId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "automatic" BOOLEAN NOT NULL,
  "arrivalDate" TIMESTAMP(3),
  "failureCode" TEXT,
  "stripeCreatedAt" TIMESTAMP(3) NOT NULL,
  "stripeEventCreatedAt" TIMESTAMP(3) NOT NULL,
  "stripeEventId" TEXT NOT NULL,
  "paidAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SellerBankPayout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SellerBankPayout_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "Seller"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SellerBankPayout_status_check"
    CHECK ("status" IN ('pending', 'in_transit', 'paid', 'failed', 'canceled')),
  CONSTRAINT "SellerBankPayout_amountCents_check" CHECK ("amountCents" >= 0)
);

CREATE INDEX "SellerBankPayout_sellerId_status_idx"
  ON "SellerBankPayout"("sellerId", "status");
CREATE INDEX "SellerBankPayout_stripeAccountId_idx"
  ON "SellerBankPayout"("stripeAccountId");
CREATE INDEX "SellerBankPayout_stripeCreatedAt_idx"
  ON "SellerBankPayout"("stripeCreatedAt");
