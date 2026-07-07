import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminEmail, MAX_ATTEMPTS, SESSION_COOKIE, SESSION_TTL_MS } from '@/lib/config';
import { makeSession } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: { email?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
  const email = String(body?.email || '').trim().toLowerCase();
  const code = String(body?.code || '').trim();

  const entry = await prisma.loginCode.findUnique({ where: { email } });
  if (!entry) return NextResponse.json({ error: 'Request a new code first.' }, { status: 400 });

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

  await prisma.loginCode.delete({ where: { email } }).catch(() => {});
  const admin = isAdminEmail(email);
  const res = NextResponse.json({ ok: true, admin });
  if (admin) {
    res.cookies.set(SESSION_COOKIE, makeSession(email), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
  }
  return res;
}
