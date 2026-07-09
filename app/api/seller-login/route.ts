import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/password';
import { makeSession } from '@/lib/session';
import { SELLER_COOKIE, SESSION_TTL_MS } from '@/lib/config';

function withSellerCookie(res: NextResponse, email: string): NextResponse {
  res.cookies.set(SELLER_COOKIE, makeSession(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}

export const runtime = 'nodejs';

const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  if (!email || !password) {
    return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 });
  }

  const seller = await prisma.seller.findUnique({ where: { email } });
  if (!seller) {
    return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
  }
  if (!seller.passwordHash) {
    // Account predates passwords — the reset flow doubles as "set a password".
    return NextResponse.json(
      { error: 'No password is set for this account yet — use "Forgot password?" below to create one.' },
      { status: 401 },
    );
  }
  if (seller.lockedUntil && seller.lockedUntil.getTime() > Date.now()) {
    return NextResponse.json(
      { error: 'Too many attempts — try again in 15 minutes, or reset your password.' },
      { status: 429 },
    );
  }

  if (!verifyPassword(password, seller.passwordHash)) {
    const failed = seller.failedLogins + 1;
    await prisma.seller.update({
      where: { id: seller.id },
      data:
        failed >= MAX_FAILED_LOGINS
          ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MS) }
          : { failedLogins: failed },
    });
    return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
  }

  if (seller.failedLogins > 0 || seller.lockedUntil) {
    await prisma.seller.update({
      where: { id: seller.id },
      data: { failedLogins: 0, lockedUntil: null },
    });
  }

  return withSellerCookie(NextResponse.json({ ok: true }), email);
}
