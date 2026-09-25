import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminEmail, TEST_EMAILS } from '@/lib/config';
import { sendAdminSubmissionNotification, sendSubmissionConfirmation } from '@/lib/email';
import { makeUploadToken } from '@/lib/uploadToken';
import { currentSeller } from '@/lib/sellerAuth';
import { checkPrice } from '@/lib/pricing';
import { schoolKey } from '@/lib/admitProof';
import { normalizeAnonymity } from '@/lib/anonymity';
import { sameSchool } from '@/lib/schools';
import { catalogSchool, parseAdmitTags } from '@/lib/listingSchool';
import { findSameSchoolConflict } from '@/lib/essayDuplication';
import { normalizeSellerEmail } from '@/lib/sellerAccount';

export const runtime = 'nodejs';

type EssayIn = { prompt?: string; question?: string; price?: number; wordCount?: number; contentHash?: string };

export async function POST(req: Request) {
  let body: {
    email?: string;
    school?: string;
    targetSchool?: string;
    applicationSystem?: string;
    gradYear?: string;
    major?: string;
    admitTags?: string[];
    anonymity?: string;
    pricingMode?: string;
    packagePrice?: number;
    teaser?: string;
    appliedMajors?: string;
    sellerNote?: string;
    essays?: EssayIn[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  // Account creation is a separate, completed step. Listing submission may
  // only use the authenticated seller and can never create an account or alter
  // its password.
  const session = await currentSeller();
  if (!session) {
    return NextResponse.json(
      { error: 'Log in before submitting a listing.' },
      { status: 401 },
    );
  }
  const email = normalizeSellerEmail(session.email);
  const requestedEmail = normalizeSellerEmail(body?.email || email);
  if (requestedEmail !== email) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }
  const school = String(body?.school || '').replace(/[\r\n]/g, ' ').trim().slice(0, 120);
  if (!school) return NextResponse.json({ error: 'A school is required.' }, { status: 400 });

  const essays = Array.isArray(body?.essays) ? body.essays : [];
  if (essays.length === 0) {
    return NextResponse.json({ error: 'Add at least one essay.' }, { status: 400 });
  }
  const contentHashes = essays.map((essay) => String(essay?.contentHash || '').toLowerCase());
  if (contentHashes.some((hash) => !/^[a-f0-9]{64}$/.test(hash))) {
    return NextResponse.json({ error: 'Could not verify the essay files. Please choose them again.' }, { status: 400 });
  }
  if (new Set(contentHashes).size !== contentHashes.length) {
    return NextResponse.json({ error: 'The same essay file was added more than once to this package.' }, { status: 400 });
  }

  // Normalised rather than taken verbatim: an unrecognised value stores as
  // `anonymous`, and the legacy 'firstName' collapses onto 'revealOnPurchase'
  // so an old client can never re-create a listing that names its seller before
  // a sale. See lib/anonymity.ts.
  const anonymity = normalizeAnonymity(body?.anonymity);
  const pricingMode = body?.pricingMode === 'separate' ? 'separate' : 'package';
  const sellerNote = String(body?.sellerNote || '').trim().slice(0, 500) || null;
  const teaser = String(body?.teaser || '').trim().slice(0, 90) || null;
  const appliedMajors = String(body?.appliedMajors || '').trim().slice(0, 120) || null;

  // Admits are required server-side too: the listing's college must be one of
  // them.
  const admitTags = (Array.isArray(body?.admitTags) ? body.admitTags : [])
    .slice(0, 20)
    .map((t) => String(t).trim().slice(0, 80))
    .filter(Boolean);
  if (admitTags.length === 0) {
    return NextResponse.json({ error: 'Add at least one school you got into.' }, { status: 400 });
  }
  const targetSchool = String(body?.targetSchool || '').replace(/[\r\n]/g, ' ').trim().slice(0, 80);
  if (!targetSchool || !admitTags.some((label) => sameSchool(label, targetSchool))) {
    return NextResponse.json({ error: 'Choose which admitted college this listing is for.' }, { status: 400 });
  }
  const applicationSystem = String(body?.applicationSystem || '').replace(/[\r\n]/g, ' ').trim().slice(0, 80) || null;
  if (!applicationSystem) {
    return NextResponse.json({ error: 'Choose the application system for these essays.' }, { status: 400 });
  }

  // The same limits the form shows (lib/pricing checkPrice), enforced here so a
  // direct request cannot get round them. A non-whole amount is refused, never
  // rounded. Only the prices this pricing mode stores are checked.
  let packagePrice: number | null = null;
  const essayPrices: (number | null)[] = essays.map(() => null);
  if (pricingMode === 'package') {
    const check = checkPrice(body?.packagePrice, 'package');
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    packagePrice = check.price;
  } else {
    for (const [index, essay] of essays.entries()) {
      const check = checkPrice(essay?.price, 'essay');
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
      essayPrices[index] = check.price;
    }
  }

  const seller = await prisma.seller.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
  if (!seller) return NextResponse.json({ error: 'Seller account not found.' }, { status: 401 });

  // Same rule as the draft finalize route: reuse across colleges is legitimate,
  // a repeat within one college is not. See lib/essayDuplication.
  const reusedEssays = await prisma.essay.findMany({
    where: {
      contentHash: { in: contentHashes },
      listing: {
        sellerId: seller.id,
        status: { in: ['pending', 'approved'] },
        essays: { every: { pdfPath: { not: null } }, some: {} },
      },
    },
    select: { listing: { select: { targetSchool: true, admitTags: true } } },
  });
  if (findSameSchoolConflict(reusedEssays, targetSchool)) {
    return NextResponse.json(
      { error: `One of these essay files is already in another of your ${targetSchool} listings. Keep one package per college so a buyer is never charged twice for the same file.` },
      { status: 409 },
    );
  }

  // One complete package per seller and target college. A one-admit legacy
  // listing is unambiguous. A multi-admit legacy listing is not relabelled, but
  // it still blocks a potentially duplicate package until an admin confirms it.
  const activeListings = await prisma.listing.findMany({
    where: {
      sellerId: seller.id,
      status: { in: ['pending', 'approved'] },
      essays: { every: { pdfPath: { not: null } }, some: {} },
    },
    select: { targetSchool: true, admitTags: true },
  });
  const alreadyListed = activeListings.some((existing) => {
    const existingAdmits = parseAdmitTags(existing.admitTags);
    const existingTarget = catalogSchool({
      school: '',
      targetSchool: existing.targetSchool,
      admitTags: existingAdmits,
    });
    if (existingTarget) return sameSchool(existingTarget, targetSchool);
    return existingAdmits.some((admit) => sameSchool(admit, targetSchool));
  });
  if (alreadyListed) {
    return NextResponse.json(
      { error: `You already have an active listing for ${targetSchool}. Add the missing essays to that package instead.` },
      { status: 409 },
    );
  }

  const listing = await prisma.listing.create({
    data: {
      sellerId: seller.id,
      school,
      targetSchool,
      applicationSystem,
      gradYear: body?.gradYear ? String(body.gradYear).trim().slice(0, 20) : null,
      major: body?.major ? String(body.major).trim().slice(0, 80) : null,
      appliedMajors,
      admitTags: JSON.stringify(admitTags),
      anonymity,
      pricingMode,
      packagePrice: pricingMode === 'package' ? packagePrice : null,
      teaser,
      sellerNote,
      status: 'pending',
      essays: {
        create: essays.map((e, i) => {
          const wc = e?.wordCount != null ? Math.round(Number(e.wordCount)) : null;
          return {
            // Bounded and newline-stripped like `school` above: these two land
            // in the reviewer panel's prompt, so unbounded seller text here is
            // an injection surface as well as a display problem.
            prompt: String(e?.prompt || 'Essay').replace(/[\r\n]/g, ' ').trim().slice(0, 200) || 'Essay',
            question: e?.question
              ? String(e.question).replace(/[\r\n]/g, ' ').trim().slice(0, 500) || null
              : null,
            price: pricingMode === 'separate' ? essayPrices[i] : null,
            wordCount: wc != null && Number.isFinite(wc) ? wc : null,
            sortOrder: i,
          };
        }),
      },
    },
    include: { essays: { orderBy: { sortOrder: 'asc' }, select: { id: true } } },
  });

  // Listings sit in 'pending' until someone reviews them, so the admin has to
  // hear about each one. Awaited (fire-and-forget dies with the serverless
  // invocation) but never fatal - the submission already succeeded.
  const notify = await sendAdminSubmissionNotification({
    school: targetSchool,
    sellerEmail: email,
    essayCount: listing.essays.length,
    admitTags,
    isTest: isAdminEmail(email) || TEST_EMAILS.has(email),
  });
  if (!notify.ok) {
    console.error('admin submission notification failed:', notify.status, notify.detail);
  }

  // Confirm receipt to the seller and set the 2-3 business day expectation.
  // Replies route to the support inbox. Awaited but never fatal - the
  // submission already succeeded.
  const confirm = await sendSubmissionConfirmation(email, {
    school: targetSchool,
    essayCount: listing.essays.length,
  });
  if (!confirm.ok) {
    console.error('submission confirmation failed:', confirm.status, confirm.detail);
  }

  // Every school claimed here needs an acceptance letter. Create a pending proof
  // per distinct school, reusing any the seller already has so a returning
  // seller isn't asked to upload the same letter twice. `upsert` on the
  // (sellerId, schoolKey) unique index makes this idempotent, and the update
  // branch deliberately touches nothing: an already-verified proof must not be
  // reset to pending just because the seller listed that school again.
  const seenKeys = new Set<string>();
  for (const label of admitTags) {
    const key = schoolKey(label);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    await prisma.admitProof.upsert({
      where: { sellerId_schoolKey: { sellerId: seller.id, schoolKey: key } },
      update: {},
      create: { sellerId: seller.id, schoolKey: key, schoolLabel: label },
    });
  }
  // Return the proofs still needing a file so the wizard knows what to ask for.
  // A verified proof is skipped: that letter is already on file.
  const proofs = await prisma.admitProof.findMany({
    where: { sellerId: seller.id, schoolKey: { in: [...seenKeys] } },
    orderBy: { schoolLabel: 'asc' },
    select: { id: true, schoolLabel: true, status: true, pdfPath: true },
  });

  return NextResponse.json({
    ok: true,
    listingId: listing.id,
    essays: listing.essays,
    uploadToken: makeUploadToken(listing.id),
    admitProofs: proofs.map((p) => ({
      id: p.id,
      school: p.schoolLabel,
      status: p.status,
      needsUpload: p.status !== 'verified' && !p.pdfPath,
    })),
  });
}
