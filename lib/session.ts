import crypto from 'crypto';
import { SESSION_SECRET, SESSION_TTL_MS } from './config';

// Stateless signed-cookie sessions (HMAC-SHA256), same approach as the
// prototype: "<base64url(payload)>.<base64url(sig)>".

export function makeSession(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({ email: email.toLowerCase(), exp: Date.now() + SESSION_TTL_MS }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(token: string | undefined | null): { email: string } | null {
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
