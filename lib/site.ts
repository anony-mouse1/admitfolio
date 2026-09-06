// Public site constants. The contact address can be overridden by env, while
// the public fallback stays on Admitfolio's canonical support inbox.
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'hello@admitfolio.com';

// Background tags a seller can pick for their profile. Shared by the wizard
// UI and the profile API (which validates against this exact list).
export const PROFILE_TAGS = [
  'First-generation',
  'Low-income background',
  'International student',
  'Transfer student',
  'Immigrant family',
  'Rural hometown',
  'Student athlete',
  'Worked through school',
] as const;

// The origin the public site lives at. Canonical tags, the sitemap and Stripe
// return URLs are all built on SITE_URL. Production resolves to the apex; local
// dev sets NEXT_PUBLIC_SITE_URL to localhost. No trailing slash, so callers
// append paths that start with one.
export const PRODUCTION_SITE_URL = 'https://admitfolio.com';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || PRODUCTION_SITE_URL).replace(/\/$/, '');
