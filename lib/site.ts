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
