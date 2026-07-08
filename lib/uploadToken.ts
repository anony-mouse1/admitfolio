import 'server-only';
import crypto from 'crypto';
import { SESSION_SECRET } from './config';

// Short-lived HMAC token returned by /api/submit-listing and required by
// /api/upload-essay. Sellers have no session cookie, so this is what scopes
// PDF uploads to the listing they just created. Same "<payload>.<sig>"
// base64url format as lib/session.ts.

const UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;

export function makeUploadToken(listingId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ listingId, exp: Date.now() + UPLOAD_TOKEN_TTL_MS }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyUploadToken(token: string | undefined | null): { listingId: string } | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const { listingId, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof listingId !== 'string' || typeof exp !== 'number' || Date.now() > exp) return null;
    return { listingId };
  } catch {
    return null;
  }
}
