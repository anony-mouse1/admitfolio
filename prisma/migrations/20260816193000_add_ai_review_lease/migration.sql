-- The final PDF upload starts review immediately, while the cron remains a
-- fallback. This lease makes those two paths idempotent and lets a later cron
-- recover a review whose function was terminated mid-run.
ALTER TABLE "Listing" ADD COLUMN "aiReviewStartedAt" TIMESTAMP(3);

CREATE INDEX "Listing_aiReviewStartedAt_idx" ON "Listing"("aiReviewStartedAt");
