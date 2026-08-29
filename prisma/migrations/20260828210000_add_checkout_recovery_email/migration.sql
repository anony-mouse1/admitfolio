CREATE TABLE "CheckoutRecoveryEmail" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "itemLabel" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "sessionCreatedAt" TIMESTAMP(3) NOT NULL,
    "recoveryExpiresAt" TIMESTAMP(3) NOT NULL,
    "sendStartedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "sendAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutRecoveryEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CheckoutRecoveryEmail_email_key" ON "CheckoutRecoveryEmail"("email");
CREATE UNIQUE INDEX "CheckoutRecoveryEmail_stripeSessionId_key" ON "CheckoutRecoveryEmail"("stripeSessionId");
CREATE INDEX "CheckoutRecoveryEmail_sentAt_idx" ON "CheckoutRecoveryEmail"("sentAt");
