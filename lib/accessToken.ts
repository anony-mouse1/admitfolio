import 'server-only';
import crypto from 'crypto';
import { SESSION_SECRET } from './config';

// Buyer access tokens: HMAC-signed "<payload>.<sig>" like lib/session.ts,
// carrying the purchase id. They live in receipt emails, so they get a long
// (1 year) validity rather than a session-length one.

const ACCESS_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export function makeAccessToken(purchaseId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ purchaseId, exp: Date.now() + ACCESS_TTL_MS }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(`access:${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyAccessToken(token: string | undefined | null): { purchaseId: string } | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(`access:${payload}`).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const { purchaseId, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof purchaseId !== 'string' || typeof exp !== 'number' || Date.now() > exp) return null;
    return { purchaseId };
  } catch {
    return null;
  }
}
