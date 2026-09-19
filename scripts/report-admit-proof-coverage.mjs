#!/usr/bin/env node

// READ ONLY. How many approved listings claim an admission with no AdmitProof
// row behind it.
//
// Why this exists: app/legit/page.tsx tells a buyer "A seller who claims an
// admission uploads the acceptance letter for that school, and it is read
// before the listing can be approved." lib/admitProof.ts does not enforce that.
// verifiedAdmissionTags returns every admit tag once the seller has an admin
// approval, letter or not, and its own comment says so: "every claim is
// verified even when a legacy seller was never asked to upload a letter."
//
// So the page makes a promise the data may not keep, and the size of the gap
// decides whether that sentence is a rewording or a retraction. This counts it.
//
// Reads only, by construction: findMany with an explicit select, and nothing
// else. No create, update, delete, upsert, or $executeRaw anywhere in this
// file. Run it with `node --env-file=.env.local`, which is what supplies
// DATABASE_URL without creating a .env the Prisma CLI would pick up.
//
// No seller name, email, essay text or listing id is printed. Counts only, so
// the output is safe to paste into a PR or a message.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseTags(json) {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

const listings = await prisma.listing.findMany({
  where: { status: 'approved', packagePrice: { not: null } },
  select: { sellerId: true, admitTags: true, humanReviewedAt: true, aiDecision: true },
});

const sellerIds = [...new Set(listings.map((l) => l.sellerId))];

const proofs = await prisma.admitProof.findMany({
  where: { sellerId: { in: sellerIds } },
  select: { sellerId: true, status: true },
});

const proofsBySeller = new Map();
for (const proof of proofs) {
  if (!proofsBySeller.has(proof.sellerId)) proofsBySeller.set(proof.sellerId, []);
  proofsBySeller.get(proof.sellerId).push(proof.status);
}

const claiming = listings.filter((l) => parseTags(l.admitTags).length > 0);
const noProofRow = claiming.filter((l) => !proofsBySeller.has(l.sellerId));
const someProof = claiming.filter((l) => proofsBySeller.has(l.sellerId));
const verifiedProof = claiming.filter((l) =>
  (proofsBySeller.get(l.sellerId) || []).includes('verified'));

const sellersClaiming = [...new Set(claiming.map((l) => l.sellerId))];
const sellersNoProof = sellersClaiming.filter((id) => !proofsBySeller.has(id));

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : 'n/a');

console.log('approved, purchasable listings        :', listings.length);
console.log('  ...claiming at least one admission  :', claiming.length);
console.log('');
console.log('LISTINGS whose seller has NO AdmitProof row at all');
console.log('  count                               :', noProofRow.length, `(${pct(noProofRow.length, claiming.length)} of claiming listings)`);
console.log('  ...with at least one proof row      :', someProof.length);
console.log('  ...with a proof marked verified     :', verifiedProof.length);
console.log('');
console.log('SELLERS behind those listings');
console.log('  distinct sellers claiming an admit  :', sellersClaiming.length);
console.log('  ...with no AdmitProof row at all    :', sellersNoProof.length, `(${pct(sellersNoProof.length, sellersClaiming.length)})`);
console.log('');
console.log('proof rows by status                  :', proofs.reduce((acc, p) => {
  acc[p.status] = (acc[p.status] || 0) + 1;
  return acc;
}, {}));
console.log('approved listings stamped humanReviewedAt:', listings.filter((l) => l.humanReviewedAt != null).length, 'of', listings.length);

await prisma.$disconnect();
