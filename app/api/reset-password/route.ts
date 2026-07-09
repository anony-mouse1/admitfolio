import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { verifyEmailToken } from '@/lib/emailToken';

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

  const email = String(body?.email || '').trim().toLowerCase();
  const newPassword = String(body?.newPassword || '');
  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  const verified = verifyEmailToken(body?.emailToken);
  if (!verified || verified.email !== email) {
    return NextResponse.json(
      { error: 'Your verification expired — please request a new code.' },
      { status: 401 },
    );
  }

  const seller = await prisma.seller.findUnique({ where: { email } });
  if (!seller) {
    return NextResponse.json({ error: 'No seller account found for that email.' }, { status: 404 });
  }

  await prisma.seller.update({
    where: { id: seller.id },
    data: { passwordHash: hashPassword(newPassword), failedLogins: 0, lockedUntil: null },
  });

  return NextResponse.json({ ok: true });
}
