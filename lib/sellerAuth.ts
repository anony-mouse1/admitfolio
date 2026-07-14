import 'server-only';
import { cookies } from 'next/headers';
import { SELLER_COOKIE } from './config';
import { verifySession } from './session';

// Reads the seller session cookie (set by /api/seller-login and
// /api/reset-password). Mirrors lib/adminAuth.ts, minus the admin allowlist.

export function currentSeller(): { email: string } | null {
  const token = cookies().get(SELLER_COOKIE)?.value;
  return verifySession(token, 'seller');
}
