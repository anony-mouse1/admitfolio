import 'server-only';
import crypto from 'crypto';
import { SESSION_SECRET } from './config';
import type { SellerCodePurpose } from './sellerAccount';

// Proof that an email passed OTP verification, issued by /api/verify-code and
// consumed by either the dedicated signup route or password-reset route. The
// purpose is signed so a signup code can never reset an existing password.
// Same "<payload>.<sig>" HMAC format as lib/session.ts.

const EMAIL_TOKEN_TTL_MS = 60 * 60 * 1000;

export function makeEmailToken(email: string, purpose: SellerCodePurpose): {
  token: string;
  tokenId: string;
  expiresAt: Date;
} {
  const tokenId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + EMAIL_TOKEN_TTL_MS);
  const payload = Buffer.from(
    JSON.stringify({ id: tokenId, email: email.toLowerCase(), purpose, exp: expiresAt.getTime() }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return { token: `${payload}.${sig}`, tokenId, expiresAt };
}

export function verifyEmailToken(
  token: string | undefined | null,
  expectedPurpose: SellerCodePurpose,
): { id: string; email: string; purpose: SellerCodePurpose; expiresAt: Date } | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const { id, email, purpose, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (
      typeof id !== 'string' ||
      typeof email !== 'string' ||
      purpose !== expectedPurpose ||
      typeof exp !== 'number' ||
      Date.now() > exp
    ) return null;
    return { id, email, purpose, expiresAt: new Date(exp) };
  } catch {
    return null;
  }
}
