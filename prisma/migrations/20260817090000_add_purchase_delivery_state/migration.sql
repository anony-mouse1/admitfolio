-- Every paid buyer receives a uniquely fingerprinted copy. The printed code is
-- a keyed, non-reversible identifier; buyer email and IP remain server-side on
-- Purchase/EssayView and are never embedded in the document.
ALTER TABLE "Purchase" ADD COLUMN "deliveryFingerprint" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "deliveryStartedAt" TIMESTAMP(3);
ALTER TABLE "Purchase" ADD COLUMN "deliveryEmailSentAt" TIMESTAMP(3);
ALTER TABLE "Purchase" ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Purchase" ADD COLUMN "deliveryLastError" TEXT;

CREATE UNIQUE INDEX "Purchase_deliveryFingerprint_key" ON "Purchase"("deliveryFingerprint");
