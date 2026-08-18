-- A seller's current university is profile context, not the college an essay
-- package was written for. Keep the two facts separately so catalogue cards do
-- not collapse to the same title for every listing from one seller.
ALTER TABLE "Listing" ADD COLUMN "targetSchool" TEXT;
ALTER TABLE "Listing" ADD COLUMN "applicationSystem" TEXT;

-- Exact-file duplicate protection for future uploads. Existing rows are left
-- null until the read-only-by-default backfill script has downloaded and hashed
-- their private PDFs.
ALTER TABLE "Essay" ADD COLUMN "contentHash" TEXT;

CREATE INDEX "Listing_targetSchool_idx" ON "Listing"("targetSchool");
CREATE INDEX "Essay_contentHash_idx" ON "Essay"("contentHash");
