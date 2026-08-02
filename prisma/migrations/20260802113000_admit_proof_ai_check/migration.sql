-- The review panel now reads the uploaded acceptance letters and records what it
-- made of each one. Advisory only: the panel never sets `status`, so a letter
-- still becomes `verified` solely through the admin console. These columns just
-- put the reading beside the Verify button.
ALTER TABLE "AdmitProof" ADD COLUMN     "aiCheckedAt" TIMESTAMP(3);
ALTER TABLE "AdmitProof" ADD COLUMN     "aiGenuine" BOOLEAN;
ALTER TABLE "AdmitProof" ADD COLUMN     "aiNote" TEXT;
