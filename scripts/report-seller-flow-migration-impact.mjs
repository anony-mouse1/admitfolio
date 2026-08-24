import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const [sellerCount, emailCollisions, proofStatus, proofFileState, legacyListings] = await Promise.all([
    prisma.seller.count(),
    prisma.$queryRaw`
      SELECT LOWER(TRIM("email")) AS normalized_email, COUNT(*)::int AS account_count
      FROM "Seller"
      GROUP BY LOWER(TRIM("email"))
      HAVING COUNT(*) > 1
      ORDER BY account_count DESC
    `,
    prisma.$queryRaw`
      SELECT "status", COUNT(*)::int AS proof_count
      FROM "AdmitProof"
      GROUP BY "status"
      ORDER BY "status"
    `,
    prisma.$queryRaw`
      SELECT
        COUNT(*) FILTER (WHERE "pdfPath" IS NULL)::int AS missing_file,
        COUNT(*) FILTER (WHERE "pdfPath" IS NOT NULL)::int AS has_file,
        COUNT(*) FILTER (WHERE "aiCheckedAt" IS NOT NULL)::int AS has_ai_advice,
        COUNT(*) FILTER (WHERE "reviewedAt" IS NOT NULL)::int AS has_human_decision
      FROM "AdmitProof"
    `,
    prisma.$queryRaw`
      SELECT
        COUNT(*) FILTER (WHERE "targetSchool" IS NULL OR TRIM("targetSchool") = '')::int AS missing_target_school,
        COUNT(*) FILTER (WHERE "gradYear" IS NULL OR TRIM("gradYear") = '')::int AS missing_class_year,
        COUNT(*)::int AS listing_count
      FROM "Listing"
    `,
  ]);

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    sellerCount,
    normalizedEmailCollisionCount: emailCollisions.length,
    normalizedEmailCollisions: emailCollisions,
    proofStatus,
    proofFileState: proofFileState[0] || null,
    legacyListings: legacyListings[0] || null,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
