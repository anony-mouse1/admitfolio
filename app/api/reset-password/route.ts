import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { verifyEmailToken } from '@/lib/emailToken';
import { makeSession } from '@/lib/session';
import { SELLER_COOKIE, SESSION_TTL_MS } from '@/lib/config';
import { normalizeSellerEmail, passwordProblem } from '@/lib/sellerAccount';

export const runtime = 'nodejs';

// Sets a new password after OTP verification. The emailToken (issued by
// /api/verify-code) is the proof the caller owns the inbox.

export async function POST(req: Request) {
  let body: { email?: string; emailToken?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const email = normalizeSellerEmail(body?.email);
  const newPassword = String(body?.newPassword || '');
  const passwordError = passwordProblem(newPassword);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  const verified = verifyEmailToken(body?.emailToken, 'reset');
  if (!verified || verified.email !== email) {
    return NextResponse.json(
      { error: 'Your verification expired. Please request a new code.' },
      { status: 401 },
    );
  }

  const seller = await prisma.seller.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
  if (!seller) {
    return NextResponse.json({ error: 'No seller account found for that email.' }, { status: 404 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const consumed = await tx.emailActionToken.updateMany({
        where: {
          id: verified.id,
          email,
          purpose: 'reset',
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) throw new Error('EMAIL_TOKEN_USED');
      await tx.seller.update({
        where: { id: seller.id },
        data: { passwordHash: hashPassword(newPassword), failedLogins: 0, lockedUntil: null },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'EMAIL_TOKEN_USED') {
      return NextResponse.json(
        { error: 'That verification was already used. Please request a new reset code.' },
        { status: 401 },
      );
    }
    throw error;
  }

  // Resetting proves inbox ownership, so log them straight in.
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SELLER_COOKIE, makeSession(normalizeSellerEmail(seller.email), 'seller'), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
