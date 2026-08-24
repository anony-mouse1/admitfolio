import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emailAllowed, SELLER_COOKIE, SESSION_TTL_MS } from '@/lib/config';
import { verifyEmailToken } from '@/lib/emailToken';
import { hashPassword } from '@/lib/password';
import { makeSession } from '@/lib/session';
import { normalizeSellerEmail, passwordProblem } from '@/lib/sellerAccount';

export const runtime = 'nodejs';

function accountExists() {
  return NextResponse.json(
    {
      error: 'An account already exists for that email. Log in or reset your password.',
      code: 'ACCOUNT_EXISTS',
      next: 'login',
    },
    { status: 409 },
  );
}

export async function POST(req: Request) {
  let body: { email?: string; emailToken?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const email = normalizeSellerEmail(body?.email);
  if (!emailAllowed(email)) {
    return NextResponse.json({ error: 'A verified .edu email is required.' }, { status: 400 });
  }

  const verified = verifyEmailToken(body?.emailToken, 'signup');
  if (!verified || verified.email !== email) {
    return NextResponse.json(
      { error: 'Your verification expired. Please request a new signup code.' },
      { status: 401 },
    );
  }

  const password = String(body?.password || '');
  const passwordError = passwordProblem(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  const existing = await prisma.seller.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) return accountExists();

  try {
    await prisma.$transaction(async (tx) => {
      const consumed = await tx.emailActionToken.updateMany({
        where: {
          id: verified.id,
          email,
          purpose: 'signup',
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) throw new Error('EMAIL_TOKEN_USED');
      await tx.seller.create({
        data: { email, passwordHash: hashPassword(password) },
        select: { id: true },
      });
    });
  } catch (error) {
    // The case-insensitive database index is the final guard if two signup
    // requests race after the lookup above. Never turn that race into a 500.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return accountExists();
    }
    if (error instanceof Error && error.message === 'EMAIL_TOKEN_USED') {
      return NextResponse.json(
        { error: 'That verification was already used. Please request a new signup code.' },
        { status: 401 },
      );
    }
    throw error;
  }

  const res = NextResponse.json({ ok: true, email });
  res.cookies.set(SELLER_COOKIE, makeSession(email, 'seller'), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
