// Backfill Essay.contentHash from private uploaded PDFs.
//
//   node --env-file=.env scripts/backfill-essay-content-hashes.mjs
//   node --env-file=.env scripts/backfill-essay-content-hashes.mjs --confirm
//
// Dry-run by default. The hashes let /api/upload-essay reject an exact file a
// seller already placed in another active listing. No essay text is printed.

import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const CONFIRM = process.argv.includes('--confirm');
const BUCKET = 'essays';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
}

async function download(path) {
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!response.ok) throw new Error(`download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const prisma = new PrismaClient();
let essays;
try {
  essays = await prisma.essay.findMany({
    where: { pdfPath: { not: null }, contentHash: null },
    select: {
      id: true,
      pdfPath: true,
      listing: { select: { sellerId: true, status: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
} catch (error) {
  if (error?.code === 'P2022') {
    console.error('Essay.contentHash is not live yet. Deploy the migration, then rerun.');
    await prisma.$disconnect();
    process.exit(1);
  }
  throw error;
}

const results = [];
let failed = 0;
for (const essay of essays) {
  try {
    const bytes = await download(essay.pdfPath);
    results.push({
      id: essay.id,
      sellerId: essay.listing.sellerId,
      status: essay.listing.status,
      hash: createHash('sha256').update(bytes).digest('hex'),
    });
  } catch {
    failed++;
  }
}

const active = results.filter((r) => r.status === 'pending' || r.status === 'approved');
const groups = new Map();
for (const row of active) {
  const key = `${row.sellerId}:${row.hash}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row.id);
}
const duplicates = [...groups.values()].filter((ids) => ids.length > 1);

console.log(`${essays.length} essay files need hashes`);
console.log(`${results.length} hashed, ${failed} failed`);
console.log(`${duplicates.length} exact duplicate group(s), ${duplicates.flat().length} active essay rows affected`);

if (!CONFIRM) {
  console.log('DRY RUN. Nothing written. Re-run with --confirm after reviewing these counts.');
  await prisma.$disconnect();
  process.exit(0);
}

for (const row of results) {
  await prisma.essay.update({ where: { id: row.id }, data: { contentHash: row.hash } });
}

console.log(`wrote ${results.length} hashes`);
await prisma.$disconnect();
