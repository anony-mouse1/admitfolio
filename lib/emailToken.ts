import 'server-only';
import crypto from 'crypto';
import { SESSION_SECRET } from './config';

// Proof that an email passed OTP verification, issued by /api/verify-code and
// required by /api/submit-listing — without it, the .edu check is client-side
// theater and anyone can submit listings as any address. Same "<payload>.<sig>"
// HMAC format as lib/session.ts. TTL is generous because sellers fill in the
// whole listing wizard between verifying and submitting.

const EMAIL_TOKEN_TTL_MS = 60 * 60 * 1000;

export function makeEmailToken(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({ email: email.toLowerCase(), exp: Date.now() + EMAIL_TOKEN_TTL_MS }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyEmailToken(token: string | undefined | null): { email: string } | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const { email, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof email !== 'string' || typeof exp !== 'number' || Date.now() > exp) return null;
    return { email };
  } catch {
    return null;
  }
}
