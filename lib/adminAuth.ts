import { cookies } from 'next/headers';
import { verifySession } from './session';
import { isAdminEmail, SESSION_COOKIE } from './config';

// Returns the signed-in admin, or null if the request has no valid admin session.
export function currentAdmin(): { email: string } | null {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const s = verifySession(token);
  if (!s || !isAdminEmail(s.email)) return null;
  return s;
}
