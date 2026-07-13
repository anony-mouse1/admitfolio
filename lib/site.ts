// Public site constants. The contact address comes from env so the repo
// (which is public) never contains a personal email; swap the env var for a
// domain inbox later without touching code.
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contact@admitfolio.com';
