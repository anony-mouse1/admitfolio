// Public site constants. The contact address comes from env so the repo
// (which is public) never contains a personal email; swap the env var for a
// domain inbox later without touching code.
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contact@admitfolio.com';

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
