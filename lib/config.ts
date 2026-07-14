// Runtime config, read from env. Mirrors the prototype's server.js settings.
// Nothing here hard-codes a personal address - admin/test emails come from env.

export const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
export const FROM_EMAIL = process.env.FROM_EMAIL || 'Admitfolio <onboarding@resend.dev>';

// Who can sign into the admin review console. Comma-separated in ADMIN_EMAILS.
export const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);
export const isAdminEmail = (e: string) => ADMIN_EMAILS.has(String(e).trim().toLowerCase());

// TEST-ONLY: extra non-.edu emails allowed to sign up while testing (Resend
// sandbox only delivers to your account email). Remove before launch.
export const TEST_EMAILS = new Set(
  (process.env.TEST_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

// DEV-ONLY fixed login code - when set, /api/send-code skips real email and this
// code always verifies. Never set in production.
export const DEV_LOGIN_CODE = process.env.DEV_LOGIN_CODE || '';

// Password for the admin console (scrypt "salt:hash", same format as seller
// passwords). Email + password is the ONLY admin login - there is no
// email-code path. When unset, no one can enter the console.
export const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';

// Secret for signing admin session cookies and upload tokens. The dev fallback
// would let anyone forge admin cookies, so production must set its own.
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production.');
}
export const SESSION_SECRET =
  process.env.SESSION_SECRET || 'admitfolio-dev-session-secret-change-me';

const eduRe = /^[^@\s]+@[^@\s]+\.edu$/i;
export const isEduEmail = (e: string) => eduRe.test(e);

// A sign-up email is allowed if it's a .edu, a configured test address, or an admin.
export const emailAllowed = (e: string) =>
  eduRe.test(e) || TEST_EMAILS.has(e.toLowerCase()) || isAdminEmail(e);

export const CODE_TTL_MS = 10 * 60 * 1000; // codes valid 10 minutes
export const MAX_ATTEMPTS = 5;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_COOKIE = 'admitfolio_session';
export const SELLER_COOKIE = 'admitfolio_seller';
