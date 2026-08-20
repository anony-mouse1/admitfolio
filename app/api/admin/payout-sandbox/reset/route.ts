import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/adminAuth';
import { PAYOUT_SANDBOX_COOKIE } from '@/lib/payoutSandbox';

export const runtime = 'nodejs';

export async function POST() {
  if (!currentAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PAYOUT_SANDBOX_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
