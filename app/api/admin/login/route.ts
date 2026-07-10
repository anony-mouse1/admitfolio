import { NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/password';
import { makeSession } from '@/lib/session';
import {
  ADMIN_PASSWORD_HASH,
  isAdminEmail,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from '@/lib/config';

export const runtime = 'nodejs';

// Password sign-in for the admin console — an alternative to the email-code
// flow so admins aren't forced through OTP every session. Admins live in
// ADMIN_EMAILS (not the database), so the shared password hash comes from env.

const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;

// Best-effort brute-force throttle. In-memory, so per-instance on serverless —
// the scrypt hash is the real defense; this just slows online guessing.
const failures = new Map<string, { count: number; lockedUntil: number }>();

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
  if (!ADMIN_PASSWORD_HASH) {
    return NextResponse.json(
      { error: 'Password login is not set up — use an email code instead.' },
      { status: 400 },
    );
  }

  const f = failures.get(email);
  if (f && f.lockedUntil > Date.now()) {
    return NextResponse.json(
      { error: 'Too many attempts — try again in 15 minutes, or use an email code.' },
      { status: 429 },
    );
  }

  if (!isAdminEmail(email) || !verifyPassword(password, ADMIN_PASSWORD_HASH)) {
    const count = (f?.count || 0) + 1;
    failures.set(email, {
      count: count >= MAX_FAILED_LOGINS ? 0 : count,
      lockedUntil: count >= MAX_FAILED_LOGINS ? Date.now() + LOCKOUT_MS : 0,
    });
    return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
  }

  failures.delete(email);
  const res = NextResponse.json({ ok: true, admin: true });
  res.cookies.set(SESSION_COOKIE, makeSession(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
