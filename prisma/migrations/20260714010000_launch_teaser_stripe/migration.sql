-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "teaser" TEXT;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "stripeSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_stripeSessionId_key" ON "Purchase"("stripeSessionId");

