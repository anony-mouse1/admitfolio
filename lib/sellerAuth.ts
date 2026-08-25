import 'server-only';
import { cookies } from 'next/headers';
import { SELLER_COOKIE } from './config';
import { verifySession } from './session';

// Reads the seller session cookie (set by /api/seller-login and
// /api/reset-password). Mirrors lib/adminAuth.ts, minus the admin allowlist.

export async function currentSeller(): Promise<{ email: string } | null> {
  const token = (await cookies()).get(SELLER_COOKIE)?.value;
  return verifySession(token, 'seller');
}
