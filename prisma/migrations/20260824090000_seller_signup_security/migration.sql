-- Email verification codes are scoped to the action the seller requested.
-- Existing in-flight codes become signup codes and expire within ten minutes.
ALTER TABLE "LoginCode" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'signup';

-- Application routes have always stored lowercase seller emails. This index is
-- the final race-safe guard against two concurrent signups using casing variants.
-- Deployment deliberately fails rather than merging accounts if an unexpected
-- historical casing collision exists, so the collision can be reviewed safely.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Seller"
    GROUP BY LOWER(TRIM("email"))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Seller email casing collision found. Review the duplicate accounts before retrying this migration.';
  END IF;
END $$;

UPDATE "Seller"
SET "email" = LOWER(TRIM("email"))
WHERE "email" <> LOWER(TRIM("email"));

CREATE UNIQUE INDEX "Seller_email_lower_key" ON "Seller" (LOWER("email"));

CREATE TABLE "EmailActionToken" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailActionToken_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailActionToken_email_purpose_consumedAt_idx"
  ON "EmailActionToken"("email", "purpose", "consumedAt");
CREATE INDEX "EmailActionToken_expiresAt_idx" ON "EmailActionToken"("expiresAt");
