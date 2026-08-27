// Create, briefly publish, and safely unpublish one synthetic $1 listing for a
// real production checkout test. No real seller or essay is reused.
//
//   node --env-file=.env scripts/live-purchase-test.mjs
//   node --env-file=.env scripts/live-purchase-test.mjs --create <pdf> --confirm-create
//   node --env-file=.env scripts/live-purchase-test.mjs --publish --confirm-publish
//   node --env-file=.env scripts/live-purchase-test.mjs --unpublish --confirm-unpublish
//
// The default action is read-only. Unpublishing keeps the listing, PDF, and
// purchase record so the buyer's paid access link continues to work.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

const SELLER_EMAIL = 'live-purchase-test@admitfolio.invalid';
const LISTING_NOTE = 'Synthetic live purchase test. Unpublish after checkout.';
const BUCKET = 'essays';
const prisma = new PrismaClient();

const args = process.argv.slice(2);
const mode = args.includes('--create')
  ? 'create'
  : args.includes('--publish')
    ? 'publish'
    : args.includes('--unpublish')
      ? 'unpublish'
      : 'status';

function has(flag) {
  return args.includes(flag);
}

function pdfArgument() {
  const index = args.indexOf('--create');
  return index >= 0 ? args[index + 1] : null;
}

async function findTestListing() {
  return prisma.listing.findFirst({
    where: { seller: { email: SELLER_EMAIL }, sellerNote: LISTING_NOTE },
    select: {
      id: true,
      status: true,
      packagePrice: true,
      school: true,
      targetSchool: true,
      essays: { select: { id: true, pdfPath: true, contentHash: true } },
      purchases: {
        select: {
          id: true,
          amount: true,
          buyerEmail: true,
          stripeSessionId: true,
          deliveryEmailSentAt: true,
        },
      },
    },
  });
}

async function uploadPdf(path, storagePath) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error('Supabase storage is not configured.');
  const bytes = await fs.readFile(path);
  const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${encodedPath}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/pdf',
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!response.ok) throw new Error(`Synthetic PDF upload failed with status ${response.status}.`);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function report() {
  const listing = await findTestListing();
  if (!listing) {
    console.log('Synthetic live purchase listing: not created');
    return;
  }
  console.log(JSON.stringify({
    listingId: listing.id,
    status: listing.status,
    price: listing.packagePrice,
    school: listing.school,
    targetSchool: listing.targetSchool,
    essayCount: listing.essays.length,
    pdfReady: listing.essays.every((essay) => Boolean(essay.pdfPath)),
    purchases: listing.purchases.map((purchase) => ({
      id: purchase.id,
      amount: purchase.amount,
      buyerEmail: purchase.buyerEmail,
      liveStripeSession: purchase.stripeSessionId?.startsWith('cs_live_') || false,
      delivered: Boolean(purchase.deliveryEmailSentAt),
    })),
  }, null, 2));
}

if (mode === 'create') {
  if (!has('--confirm-create')) throw new Error('Creation requires --confirm-create.');
  const pdfPath = pdfArgument();
  if (!pdfPath || pdfPath.startsWith('--')) throw new Error('Pass the synthetic PDF path after --create.');
  const existing = await findTestListing();
  if (existing) {
    console.log(`Synthetic listing already exists: ${existing.id}`);
  } else {
    const seller = await prisma.seller.upsert({
      where: { email: SELLER_EMAIL },
      update: {},
      create: {
        email: SELLER_EMAIL,
        name: 'Admitfolio Test',
        backgroundTags: JSON.stringify(['Synthetic checkout test']),
        currentUniversity: 'UC Berkeley',
        currentMajor: 'Computer Science',
        graduationYear: '2027',
      },
      select: { id: true },
    });
    const listing = await prisma.listing.create({
      data: {
        sellerId: seller.id,
        school: 'UC Berkeley',
        targetSchool: 'UC Berkeley',
        applicationSystem: 'Common Application',
        gradYear: '2027',
        major: 'Computer Science',
        appliedMajors: 'Computer Science',
        admitTags: JSON.stringify(['UC Berkeley']),
        anonymity: 'anonymous',
        pricingMode: 'package',
        packagePrice: 1,
        teaser: 'Synthetic $1 listing for a live checkout verification.',
        openingLine: 'My first study planner failed by Wednesday.',
        sellerNote: LISTING_NOTE,
        status: 'pending',
      },
      select: { id: true },
    });
    const storagePath = `listings/${listing.id}/synthetic-live-purchase-test.pdf`;
    const contentHash = await uploadPdf(pdfPath, storagePath);
    await prisma.essay.create({
      data: {
        listingId: listing.id,
        prompt: 'Common App',
        question: 'Describe a problem you solved and what the experience taught you.',
        wordCount: 247,
        pdfPath: storagePath,
        contentHash,
        sortOrder: 0,
      },
    });
    console.log(`Created pending synthetic listing ${listing.id}.`);
  }
} else if (mode === 'publish') {
  if (!has('--confirm-publish')) throw new Error('Publishing requires --confirm-publish.');
  const listing = await findTestListing();
  if (!listing || listing.essays.length !== 1 || !listing.essays[0].pdfPath) {
    throw new Error('Synthetic listing is missing or its PDF is not ready.');
  }
  await prisma.listing.update({
    where: { id: listing.id },
    data: { status: 'approved', reviewedAt: new Date(), humanReviewedAt: new Date() },
  });
  console.log(`Published synthetic listing ${listing.id}.`);
} else if (mode === 'unpublish') {
  if (!has('--confirm-unpublish')) throw new Error('Unpublishing requires --confirm-unpublish.');
  const listing = await findTestListing();
  if (!listing) throw new Error('Synthetic listing does not exist.');
  await prisma.listing.update({
    where: { id: listing.id },
    data: { status: 'removed' },
  });
  console.log(`Unpublished synthetic listing ${listing.id}. Purchase access remains intact.`);
}

await report();
await prisma.$disconnect();
