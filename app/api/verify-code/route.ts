import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MAX_ATTEMPTS } from '@/lib/config';
import { makeEmailToken } from '@/lib/emailToken';
import { normalizeSellerEmail, sellerCodePurpose } from '@/lib/sellerAccount';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: { email?: string; code?: string; purpose?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
  const email = normalizeSellerEmail(body?.email);
  const code = String(body?.code || '').trim();
  const purpose = sellerCodePurpose(body?.purpose);
  if (!purpose) {
    return NextResponse.json({ error: 'Request a new code first.' }, { status: 400 });
  }

  const entry = await prisma.loginCode.findUnique({ where: { email } });
  if (!entry) return NextResponse.json({ error: 'Request a new code first.' }, { status: 400 });
  if (entry.purpose !== purpose) {
    return NextResponse.json({ error: 'Request a new code for this action.' }, { status: 400 });
  }

  if (Date.now() > entry.expiresAt.getTime()) {
    await prisma.loginCode.delete({ where: { email } }).catch(() => {});
    return NextResponse.json({ error: 'That code expired, request a new one.' }, { status: 400 });
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    await prisma.loginCode.delete({ where: { email } }).catch(() => {});
    return NextResponse.json({ error: 'Too many attempts, request a new code.' }, { status: 429 });
  }
  if (code !== entry.code) {
    await prisma.loginCode.update({ where: { email }, data: { attempts: entry.attempts + 1 } });
    return NextResponse.json({ error: 'That code is incorrect.' }, { status: 400 });
  }

  // The signed purpose keeps signup and password reset as separate authorities.
  // Email codes never grant an admin session. The admin console signs in only
  // through /api/admin/login with the admin email and password.
  const issued = makeEmailToken(email, purpose);
  const consumed = await prisma.$transaction(async (tx) => {
    const deleted = await tx.loginCode.deleteMany({
      where: {
        email,
        code,
        purpose,
        attempts: { lt: MAX_ATTEMPTS },
        expiresAt: { gt: new Date() },
      },
    });
    if (deleted.count !== 1) return false;
    await tx.emailActionToken.create({
      data: {
        id: issued.tokenId,
        email,
        purpose,
        expiresAt: issued.expiresAt,
      },
    });
    return true;
  });
  if (!consumed) return NextResponse.json({ error: 'That code was already used. Request a new one.' }, { status: 409 });
  return NextResponse.json({ ok: true, emailToken: issued.token, purpose });
}
