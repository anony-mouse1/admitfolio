import { NextResponse } from 'next/server';
import { SELLER_COOKIE } from '@/lib/config';

export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SELLER_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
