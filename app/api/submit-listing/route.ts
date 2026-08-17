import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emailAllowed, isAdminEmail, TEST_EMAILS } from '@/lib/config';
import { sendAdminSubmissionNotification, sendSubmissionConfirmation } from '@/lib/email';
import { makeUploadToken } from '@/lib/uploadToken';
import { verifyEmailToken } from '@/lib/emailToken';
import { currentSeller } from '@/lib/sellerAuth';
import { hashPassword } from '@/lib/password';
import { makeSession } from '@/lib/session';
import { SELLER_COOKIE, SESSION_TTL_MS } from '@/lib/config';
import { packageFloor, perEssayFloor, schoolTier, TIER } from '@/lib/pricing';
import { schoolKey } from '@/lib/admitProof';
import { normalizeAnonymity } from '@/lib/anonymity';
import { sameSchool } from '@/lib/schools';
import { catalogSchool, parseAdmitTags } from '@/lib/listingSchool';

export const runtime = 'nodejs';

type EssayIn = { prompt?: string; question?: string; price?: number; wordCount?: number; contentHash?: string };

export async function POST(req: Request) {
  let body: {
    email?: string;
    emailToken?: string;
    password?: string;
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

  const email = String(body?.email || '').trim().toLowerCase();
  if (!emailAllowed(email)) {
    return NextResponse.json({ error: 'A verified .edu email is required.' }, { status: 400 });
  }
  // Require server-issued proof of identity: either a fresh OTP email token
  // (signup flow) or a logged-in seller session for the same email (dashboard
  // "add essay" flow) - otherwise anyone could impersonate any .edu address.
  const verified = verifyEmailToken(body?.emailToken);
  const tokenOk = !!verified && verified.email === email;
  const sessionOk = !tokenOk && currentSeller()?.email?.toLowerCase() === email;
  if (!tokenOk && !sessionOk) {
    return NextResponse.json(
      { error: 'Your verification expired. Please verify your email again.' },
      { status: 401 },
    );
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

  // The tier is fixed by the seller's admits and its floor is enforced here,
  // not just in the wizard UI - a direct request can't undercut it. Admits are
  // required server-side too: with none, no tier (and no floor) would apply.
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
  const tier = schoolTier(targetSchool);

  // Prices must be real finite numbers - NaN slips past `<` comparisons.
  const asPrice = (v: unknown): number | null => {
    if (v == null) return null;
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? n : null;
  };
  const packagePrice = asPrice(body?.packagePrice);
  const essayPrices = essays.map((e) => asPrice(e?.price));
  if (pricingMode === 'package') {
    const floor = packageFloor(tier, essays.length);
    if (packagePrice == null || packagePrice < floor) {
      return NextResponse.json(
        { error: `Your ${TIER[tier].label} package floor is $${floor}. You can charge that or more.` },
        { status: 400 },
      );
    }
  } else {
    const floor = perEssayFloor(tier);
    if (essayPrices.some((p) => p == null || p < floor)) {
      return NextResponse.json(
        { error: `Each essay's floor at ${TIER[tier].label} is $${floor}. You can charge that or more.` },
        { status: 400 },
      );
    }
  }

  const seller = await prisma.seller.upsert({
    where: { email },
    update: body?.password ? { passwordHash: hashPassword(String(body.password)) } : {},
    create: { email, passwordHash: body?.password ? hashPassword(String(body.password)) : null },
  });

  const reusedEssay = await prisma.essay.findFirst({
    where: {
      contentHash: { in: contentHashes },
      listing: {
        sellerId: seller.id,
        status: { in: ['pending', 'approved'] },
        essays: { every: { pdfPath: { not: null } }, some: {} },
      },
    },
    select: { id: true },
  });
  if (reusedEssay) {
    return NextResponse.json(
      { error: 'One of these exact essay files is already in another active listing. Keep each essay in one package so buyers are never charged twice.' },
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

  const res = NextResponse.json({
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
  // The OTP signup flow just proved this email, so start a seller session -
  // the success screen can open the dashboard (photo, bio) without a login.
  if (tokenOk) {
    res.cookies.set(SELLER_COOKIE, makeSession(email, 'seller'), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
  }
  return res;
}
