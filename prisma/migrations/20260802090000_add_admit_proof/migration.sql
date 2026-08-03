-- Proof of admission: an acceptance letter per school a seller claims in
-- Listing.admitTags. Before this, "Admitted to Harvard, MIT, Stanford" was free
-- text nobody checked, while the site told buyers "100% verified admits".
--
-- Keyed on the SELLER rather than the listing, so one letter covers every
-- listing that seller has. schoolKey is a normalised form of the typed name
-- (see lib/admitProof.ts) so "Tufts" and "Tufts University" are one row.
CREATE TABLE "AdmitProof" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "schoolKey" TEXT NOT NULL,
    "schoolLabel" TEXT NOT NULL,
    "pdfPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "AdmitProof_pkey" PRIMARY KEY ("id")
);

-- One proof per seller per school; the submit path upserts on this.
CREATE UNIQUE INDEX "AdmitProof_sellerId_schoolKey_key" ON "AdmitProof"("sellerId", "schoolKey");

CREATE INDEX "AdmitProof_status_idx" ON "AdmitProof"("status");

ALTER TABLE "AdmitProof" ADD CONSTRAINT "AdmitProof_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
