// Backfill Listing.targetSchool only when an older listing has exactly one
// claimed accepted school. Multi-admit listings are deliberately left for the
// admin confirmation UI because the old array order did not identify which
// college the essays were written for.
//
//   node --env-file=.env scripts/backfill-listing-target-schools.mjs
//   node --env-file=.env scripts/backfill-listing-target-schools.mjs --confirm

import { PrismaClient } from '@prisma/client';

const CONFIRM = process.argv.includes('--confirm');
const prisma = new PrismaClient();

function parseAdmits(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).map((v) => v.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

let listings;
try {
  listings = await prisma.listing.findMany({
    where: { targetSchool: null },
    select: { id: true, status: true, admitTags: true },
    orderBy: { createdAt: 'asc' },
  });
} catch (error) {
  if (error?.code === 'P2022') {
    console.error('Listing.targetSchool is not live yet. Deploy the migration, then rerun.');
    await prisma.$disconnect();
    process.exit(1);
  }
  throw error;
}

const candidates = [];
const ambiguous = [];
for (const listing of listings) {
  const admits = parseAdmits(listing.admitTags);
  if (admits.length === 1) candidates.push({ id: listing.id, targetSchool: admits[0] });
  else ambiguous.push({ id: listing.id, status: listing.status, admitCount: admits.length });
}

const ambiguousApproved = ambiguous.filter((listing) => listing.status === 'approved').length;
console.log(`${listings.length} legacy listings have no saved target school`);
console.log(`${candidates.length} have one possible school and can be backfilled`);
console.log(`${ambiguous.length} need admin confirmation (${ambiguousApproved} currently approved)`);

if (!CONFIRM) {
  console.log('DRY RUN. Nothing written. Re-run with --confirm after reviewing these counts.');
  await prisma.$disconnect();
  process.exit(0);
}

const results = await prisma.$transaction(
  candidates.map((listing) => prisma.listing.updateMany({
    where: { id: listing.id, targetSchool: null },
    data: { targetSchool: listing.targetSchool },
  })),
);
const written = results.reduce((sum, result) => sum + result.count, 0);
console.log(`wrote ${written} target schools; ${ambiguous.length} remain for admin review`);
await prisma.$disconnect();
