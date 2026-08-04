// How a seller's name may be shown, and when.
//
// The wizard offers three choices and the middle one is about TIMING, not about
// how much of the name is shown:
//
//   anonymous        never named, not even to a buyer
//   revealOnPurchase nothing on the public listing; first name once bought
//   full             named on the public listing
//
// Until 2026-08 the middle choice was stored as 'firstName' and every read path
// treated that as "show the first name", so sellers who asked to stay anonymous
// until someone bought were named on the public catalogue from the moment their
// listing went live. `normalizeAnonymity` maps the old value onto the new one so
// those rows behave correctly whether or not the data migration has run.
//
// Every public surface must go through `publicDisplayName`. `buyerDisplayName`
// is only for surfaces reached with a verified purchase (the reading page).
// The admin console deliberately uses neither: it shows `Seller.name` raw, since
// the anonymity choice governs buyers, not review.

export type Anonymity = 'anonymous' | 'revealOnPurchase' | 'full';

export const ANONYMITY_VALUES: readonly Anonymity[] = ['anonymous', 'revealOnPurchase', 'full'];

// What buyers see instead of a name.
export const ANONYMOUS_LABEL = 'Verified admit';

// Anything unrecognised falls back to `anonymous`: the failure mode of a bad or
// missing value has to be showing too little, never too much.
export function normalizeAnonymity(value: string | null | undefined): Anonymity {
  switch (String(value ?? '')) {
    case 'full':
      return 'full';
    case 'revealOnPurchase':
    case 'firstName': // legacy value, written before the reveal was gated
      return 'revealOnPurchase';
    default:
      return 'anonymous';
  }
}

function firstNameOf(fullName: string): string {
  return fullName.split(/\s+/)[0];
}

// For anything a visitor can reach without buying: the browse catalogue, the
// listing card, /api/listings. Only 'full' is named here.
export function publicDisplayName(anonymity: string | null | undefined, name: string | null): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return ANONYMOUS_LABEL;
  return normalizeAnonymity(anonymity) === 'full' ? trimmed : ANONYMOUS_LABEL;
}

// For surfaces behind a verified purchase. 'anonymous' stays anonymous forever,
// exactly as the wizard promises.
export function buyerDisplayName(anonymity: string | null | undefined, name: string | null): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return ANONYMOUS_LABEL;
  switch (normalizeAnonymity(anonymity)) {
    case 'full':
      return trimmed;
    case 'revealOnPurchase':
      return firstNameOf(trimmed);
    default:
      return ANONYMOUS_LABEL;
  }
}
