// Delete a seller and everything personal we hold for them, for GDPR/CCPA style
// "delete my account" requests. There is no in-product deletion path, so this is
// the tool.
//
//   node --env-file=.env scripts/delete-seller.mjs someone@school.edu
//   node --env-file=.env scripts/delete-seller.mjs someone@school.edu --confirm
//
// Without --confirm it only reports what it WOULD do. Nothing is written.
//
// What it removes:
//   - every essay PDF and acceptance-letter PDF in Supabase Storage
//   - the profile photo, if there is one
//   - the Seller row, which cascades to Listing -> Essay and to AdmitProof
//     (see prisma/schema.prisma: onDelete: Cascade on both relations)
//
// What it deliberately KEEPS:
//   - Purchase rows. The relation to Listing is optional, so deleting a listing
//     nulls purchase.listingId rather than removing the payment. Your privacy
//     policy reserves the right to keep "limited records for legal, tax, or
//     fraud-prevention purposes", and a payment you took is exactly that.
//
// It refuses outright if anyone has bought the seller's essays, because those
// buyers paid for access. Deal with that case by hand.

import { PrismaClient } from '@prisma/client';

const EMAIL = process.argv[2];
const CONFIRM = process.argv.includes('--confirm');
const ALLOW_SOLD = process.argv.includes('--i-know-there-are-purchases');

if (!EMAIL || EMAIL.startsWith('--')) {
  console.error('usage: node --env-file=.env scripts/delete-seller.mjs <email> [--confirm]');
  process.exit(2);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'essays';
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from the environment');
  process.exit(2);
}

// The supabase-js SDK builds a RealtimeClient that needs a WebSocket Node 20
// does not have, so talk to the storage REST API directly.
async function storageRemove(paths) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!res.ok) throw new Error(`storage delete failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function storageList(prefix) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix, limit: 200, offset: 0 }),
  });
  if (!res.ok) throw new Error(`storage list failed: ${res.status}`);
  return res.json();
}

const prisma = new PrismaClient();

const seller = await prisma.seller.findFirst({
  where: { email: { equals: EMAIL, mode: 'insensitive' } },
  select: {
    id: true, email: true, name: true, createdAt: true, photoPath: true,
    listings: {
      select: {
        id: true, school: true, status: true, packagePrice: true,
        essays: { select: { id: true, pdfPath: true } },
      },
    },
    admitProofs: { select: { id: true, schoolLabel: true, pdfPath: true } },
  },
});

if (!seller) {
  console.log(`No seller found for ${EMAIL}. Nothing to do.`);
  await prisma.$disconnect();
  process.exit(0);
}

const listingIds = seller.listings.map((l) => l.id);
const purchases = listingIds.length
  ? await prisma.purchase.findMany({
      where: { listingId: { in: listingIds } },
      select: { id: true, buyerEmail: true, amount: true, createdAt: true },
    })
  : [];

const essayPaths = seller.listings.flatMap((l) => l.essays.map((e) => e.pdfPath).filter(Boolean));
const proofPaths = seller.admitProofs.map((p) => p.pdfPath).filter(Boolean);
const photoPaths = seller.photoPath ? [seller.photoPath] : [];
const allPaths = [...essayPaths, ...proofPaths, ...photoPaths];

console.log(`seller        ${seller.email}  (${seller.id})`);
console.log(`name on file  ${seller.name === null ? 'none' : JSON.stringify(seller.name)}`);
console.log(`joined        ${seller.createdAt.toISOString().slice(0, 10)}`);
console.log(`\nlistings      ${seller.listings.length}`);
for (const l of seller.listings) {
  console.log(`  ${l.status.padEnd(9)} $${l.packagePrice ?? '-'}  essays=${l.essays.length}  ${l.school}  (${l.id})`);
}
console.log(`admit proofs  ${seller.admitProofs.length}`);
console.log(`storage files ${allPaths.length}`);
allPaths.forEach((p) => console.log(`  ${p}`));
console.log(`\npurchases of their essays: ${purchases.length}`);
purchases.forEach((p) =>
  console.log(`  ${p.createdAt.toISOString().slice(0, 10)}  $${p.amount}  ${p.buyerEmail}`)
);

if (purchases.length && !ALLOW_SOLD) {
  console.error(
    `\nREFUSING: ${purchases.length} purchase(s) exist. Buyers paid to read these essays and\n` +
      `deleting the listing removes their access. Decide what to do about those buyers first,\n` +
      `then re-run with --i-know-there-are-purchases if you still want to proceed.`
  );
  await prisma.$disconnect();
  process.exit(1);
}

if (!CONFIRM) {
  console.log('\nDRY RUN. Nothing was changed. Re-run with --confirm to actually delete.');
  await prisma.$disconnect();
  process.exit(0);
}

console.log('\n--- deleting ---');

if (allPaths.length) {
  await storageRemove(allPaths);
  console.log(`removed ${allPaths.length} file(s) from storage`);
} else {
  console.log('no storage files to remove');
}

// Cascades to Listing -> Essay and to AdmitProof.
await prisma.seller.delete({ where: { id: seller.id } });
console.log('deleted seller row (listings, essays and admit proofs cascade)');

// Prove it, rather than trusting that it worked.
const stillThere = await prisma.seller.findFirst({
  where: { email: { equals: EMAIL, mode: 'insensitive' } },
  select: { id: true },
});
const listingsLeft = listingIds.length
  ? await prisma.listing.count({ where: { id: { in: listingIds } } })
  : 0;
let filesLeft = 0;
for (const id of listingIds) {
  const files = await storageList(`listings/${id}`).catch(() => []);
  filesLeft += Array.isArray(files) ? files.length : 0;
}
const purchasesKept = await prisma.purchase.count({
  where: { id: { in: purchases.map((p) => p.id) } },
});

console.log('\n--- verification ---');
console.log(`seller row remaining : ${stillThere ? 'STILL PRESENT (problem)' : 'gone'}`);
console.log(`listings remaining   : ${listingsLeft}`);
console.log(`storage files left   : ${filesLeft}`);
console.log(`purchase records kept: ${purchasesKept} (intentional)`);
console.log(
  stillThere || listingsLeft || filesLeft
    ? '\nSomething survived. Investigate before telling the requester it is done.'
    : `\nDone. ${EMAIL} is deleted. Safe to send the confirmation email.`
);

await prisma.$disconnect();
