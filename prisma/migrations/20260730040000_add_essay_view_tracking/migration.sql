-- Buyer IP at checkout, captured in /api/checkout and passed through Stripe
-- session metadata (the webhook is called by Stripe, so its x-forwarded-for is
-- Stripe's address, not the buyer's).
ALTER TABLE "Purchase" ADD COLUMN     "buyerIp" TEXT;

-- One row per essay read, attributed through the purchase since buyers have no
-- account of their own.
CREATE TABLE "EssayView" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "essayId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EssayView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EssayView_purchaseId_idx" ON "EssayView"("purchaseId");

CREATE INDEX "EssayView_essayId_idx" ON "EssayView"("essayId");

ALTER TABLE "EssayView" ADD CONSTRAINT "EssayView_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
