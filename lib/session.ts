import crypto from 'crypto';
import { SESSION_SECRET, SESSION_TTL_MS } from './config';

// Stateless signed-cookie sessions (HMAC-SHA256), same approach as the
// prototype: "<base64url(payload)>.<base64url(sig)>".
//
// Tokens carry an audience ("kind") so a seller cookie can never be replayed
// as an admin session - without it, the two cookies would be interchangeable
// and an OTP-issued seller token for an admin email would bypass the admin
// password entirely.

export type SessionKind = 'admin' | 'seller';

export function makeSession(email: string, kind: SessionKind): string {
  const payload = Buffer.from(
    JSON.stringify({ email: email.toLowerCase(), kind, exp: Date.now() + SESSION_TTL_MS }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(
  token: string | undefined | null,
  kind: SessionKind,
): { email: string } | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const { email, exp } = parsed;
    if (typeof email !== 'string' || typeof exp !== 'number' || Date.now() > exp) return null;
    // Legacy tokens predate the kind field. Grandfather them in as seller
    // sessions only - admin access always requires a fresh, explicitly-scoped
    // token from /api/admin/login.
    const tokenKind: SessionKind = parsed.kind === 'admin' ? 'admin' : 'seller';
    if (tokenKind !== kind) return null;
    return { email };
  } catch {
    return null;
  }
}
