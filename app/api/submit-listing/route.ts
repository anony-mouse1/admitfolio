import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emailAllowed } from '@/lib/config';
import { makeUploadToken } from '@/lib/uploadToken';
import { verifyEmailToken } from '@/lib/emailToken';
import { currentSeller } from '@/lib/sellerAuth';
import { hashPassword } from '@/lib/password';
import { makeSession } from '@/lib/session';
import { SELLER_COOKIE, SESSION_TTL_MS } from '@/lib/config';
import { admitsTier, packageFloor, perEssayFloor, TIER } from '@/lib/pricing';

export const runtime = 'nodejs';

type EssayIn = { prompt?: string; question?: string; price?: number; wordCount?: number };

export async function POST(req: Request) {
  let body: {
    email?: string;
    emailToken?: string;
    password?: string;
    school?: string;
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
  const school = String(body?.school || '').trim().slice(0, 120);
  if (!school) return NextResponse.json({ error: 'A school is required.' }, { status: 400 });

  const essays = Array.isArray(body?.essays) ? body.essays : [];
  if (essays.length === 0) {
    return NextResponse.json({ error: 'Add at least one essay.' }, { status: 400 });
  }

  const anonymity = ['anonymous', 'firstName', 'full'].includes(String(body?.anonymity))
    ? String(body.anonymity)
    : 'anonymous';
  const pricingMode = body?.pricingMode === 'separate' ? 'separate' : 'package';
  const sellerNote = String(body?.sellerNote || '').trim().slice(0, 500) || null;
  const teaser = String(body?.teaser || '').trim().slice(0, 90) || null;
  const appliedMajors = String(body?.appliedMajors || '').trim().slice(0, 120) || null;

  // The tier is fixed by the seller's admits and its floor is enforced here,
  // not just in the wizard UI - a direct request can't undercut it. Admits are
  // required server-side too: with none, no tier (and no floor) would apply.
  const admitTags = Array.isArray(body?.admitTags) ? body.admitTags.map(String).filter(Boolean) : [];
  if (admitTags.length === 0) {
    return NextResponse.json({ error: 'Add at least one school you got into.' }, { status: 400 });
  }
  const tier = admitsTier(admitTags) ?? 3;

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

  const listing = await prisma.listing.create({
    data: {
      sellerId: seller.id,
      school,
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
            prompt: String(e?.prompt || 'Essay'),
            question: e?.question ? String(e.question) : null,
            price: pricingMode === 'separate' ? essayPrices[i] : null,
            wordCount: wc != null && Number.isFinite(wc) ? wc : null,
            sortOrder: i,
          };
        }),
      },
    },
    include: { essays: { orderBy: { sortOrder: 'asc' }, select: { id: true } } },
  });

  const res = NextResponse.json({
    ok: true,
    listingId: listing.id,
    essays: listing.essays,
    uploadToken: makeUploadToken(listing.id),
  });
  // The OTP signup flow just proved this email, so start a seller session -
  // the success screen can open the dashboard (photo, bio) without a login.
  if (tokenOk) {
    res.cookies.set(SELLER_COOKIE, makeSession(email), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
  }
  return res;
}
