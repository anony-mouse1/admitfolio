export const SELLER_CODE_PURPOSES = ['signup', 'reset'] as const;

export type SellerCodePurpose = (typeof SELLER_CODE_PURPOSES)[number];

export function normalizeSellerEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function sellerCodePurpose(value: unknown): SellerCodePurpose | null {
  return value === 'signup' || value === 'reset' ? value : null;
}

export function passwordProblem(value: unknown): string | null {
  const password = String(value || '');
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 128) return 'Password must be 128 characters or fewer.';
  return null;
}
