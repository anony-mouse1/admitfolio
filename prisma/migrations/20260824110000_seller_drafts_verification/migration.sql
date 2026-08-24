-- Additive seller profile defaults. No legacy values are inferred here because
-- a seller can have inconsistent historical listing metadata.
ALTER TABLE "Seller"
  ADD COLUMN "currentUniversity" TEXT,
  ADD COLUMN "currentMajor" TEXT,
  ADD COLUMN "graduationYear" TEXT;

ALTER TABLE "AdmitProof" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "SellerApplicationDraft" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "step" INTEGER NOT NULL DEFAULT 1,
  "state" JSONB NOT NULL DEFAULT '{}',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "finalizedListingId" TEXT,
  "sourceListingId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "submittedAt" TIMESTAMP(3),
  CONSTRAINT "SellerApplicationDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DraftAsset" (
  "id" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "clientKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storagePath" TEXT NOT NULL,
  "contentHash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ready',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DraftAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VerificationRun" (
  "id" TEXT NOT NULL,
  "proofId" TEXT NOT NULL,
  "proofVersion" INTEGER NOT NULL,
  "model" TEXT NOT NULL,
  "rulesetVersion" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "confidence" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerificationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VerificationDecision" (
  "id" TEXT NOT NULL,
  "proofId" TEXT NOT NULL,
  "proofVersion" INTEGER NOT NULL,
  "runId" TEXT,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT,
  "status" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerificationDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SellerApplicationDraft_finalizedListingId_key"
  ON "SellerApplicationDraft"("finalizedListingId");
CREATE INDEX "SellerApplicationDraft_sellerId_status_updatedAt_idx"
  ON "SellerApplicationDraft"("sellerId", "status", "updatedAt");
CREATE INDEX "SellerApplicationDraft_sourceListingId_idx"
  ON "SellerApplicationDraft"("sourceListingId");

CREATE UNIQUE INDEX "DraftAsset_storagePath_key" ON "DraftAsset"("storagePath");
CREATE UNIQUE INDEX "DraftAsset_draftId_kind_clientKey_key"
  ON "DraftAsset"("draftId", "kind", "clientKey");
CREATE INDEX "DraftAsset_draftId_status_idx" ON "DraftAsset"("draftId", "status");
CREATE INDEX "DraftAsset_contentHash_idx" ON "DraftAsset"("contentHash");

CREATE INDEX "VerificationRun_proofId_proofVersion_createdAt_idx"
  ON "VerificationRun"("proofId", "proofVersion", "createdAt");
CREATE INDEX "VerificationDecision_proofId_proofVersion_createdAt_idx"
  ON "VerificationDecision"("proofId", "proofVersion", "createdAt");

ALTER TABLE "SellerApplicationDraft"
  ADD CONSTRAINT "SellerApplicationDraft_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SellerApplicationDraft"
  ADD CONSTRAINT "SellerApplicationDraft_finalizedListingId_fkey"
  FOREIGN KEY ("finalizedListingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SellerApplicationDraft"
  ADD CONSTRAINT "SellerApplicationDraft_sourceListingId_fkey"
  FOREIGN KEY ("sourceListingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DraftAsset"
  ADD CONSTRAINT "DraftAsset_draftId_fkey"
  FOREIGN KEY ("draftId") REFERENCES "SellerApplicationDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationRun"
  ADD CONSTRAINT "VerificationRun_proofId_fkey"
  FOREIGN KEY ("proofId") REFERENCES "AdmitProof"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationDecision"
  ADD CONSTRAINT "VerificationDecision_proofId_fkey"
  FOREIGN KEY ("proofId") REFERENCES "AdmitProof"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationDecision"
  ADD CONSTRAINT "VerificationDecision_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "VerificationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
