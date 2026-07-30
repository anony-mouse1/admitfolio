-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "aiConfidence" TEXT,
ADD COLUMN     "aiDecision" TEXT,
ADD COLUMN     "aiReasons" TEXT,
ADD COLUMN     "aiReviewedAt" TIMESTAMP(3),
ADD COLUMN     "aiSuggestion" TEXT;
