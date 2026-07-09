import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emailAllowed } from '@/lib/config';
import { makeUploadToken } from '@/lib/uploadToken';
import { verifyEmailToken } from '@/lib/emailToken';
import { hashPassword } from '@/lib/password';

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
  // Require server-issued proof that this email passed OTP verification —
  // otherwise anyone can submit listings impersonating any .edu address.
  const verified = verifyEmailToken(body?.emailToken);
  if (!verified || verified.email !== email) {
    return NextResponse.json(
      { error: 'Your verification expired — please verify your email again.' },
      { status: 401 },
    );
  }
  const school = String(body?.school || '').trim();
  if (!school) return NextResponse.json({ error: 'A school is required.' }, { status: 400 });

  const essays = Array.isArray(body?.essays) ? body.essays : [];
  if (essays.length === 0) {
    return NextResponse.json({ error: 'Add at least one essay.' }, { status: 400 });
  }

  const anonymity = ['anonymous', 'firstName', 'full'].includes(String(body?.anonymity))
    ? String(body.anonymity)
    : 'anonymous';
  const pricingMode = body?.pricingMode === 'separate' ? 'separate' : 'package';

  const seller = await prisma.seller.upsert({
    where: { email },
    update: body?.password ? { passwordHash: hashPassword(String(body.password)) } : {},
    create: { email, passwordHash: body?.password ? hashPassword(String(body.password)) : null },
  });

  const listing = await prisma.listing.create({
    data: {
      sellerId: seller.id,
      school,
      gradYear: body?.gradYear ? String(body.gradYear) : null,
      major: body?.major ? String(body.major) : null,
      admitTags: JSON.stringify(Array.isArray(body?.admitTags) ? body.admitTags : []),
      anonymity,
      pricingMode,
      packagePrice: body?.packagePrice != null ? Math.round(Number(body.packagePrice)) : null,
      status: 'pending',
      essays: {
        create: essays.map((e, i) => ({
          prompt: String(e?.prompt || 'Essay'),
          question: e?.question ? String(e.question) : null,
          price: e?.price != null ? Math.round(Number(e.price)) : null,
          wordCount: e?.wordCount != null ? Math.round(Number(e.wordCount)) : null,
          sortOrder: i,
        })),
      },
    },
    include: { essays: { orderBy: { sortOrder: 'asc' }, select: { id: true } } },
  });

  return NextResponse.json({
    ok: true,
    listingId: listing.id,
    essays: listing.essays,
    uploadToken: makeUploadToken(listing.id),
  });
}
