// Proof-of-admission: sellers upload an acceptance letter for every school they
// claim on a listing.
//
// Why this exists: `Listing.admitTags` is free text a seller types, and nothing
// checked it. The site tells buyers "100% verified admits" and "Every listing is
// from a verified admit", but the only thing actually verified was control of a
// .edu inbox - which is decent evidence the seller attends that university, and
// no evidence at all for the other schools they claim. Those claims are the
// headline a buyer shops by, so they need to be backed by something.

/** Where a proof sits. `pending` is the only state a seller can create. */
export type ProofStatus = 'pending' | 'verified' | 'rejected';
export const PROOF_STATUSES: ProofStatus[] = ['pending', 'verified', 'rejected'];

/** Storage prefix inside the private essays bucket. */
export const PROOF_PREFIX = 'admit-proofs';

// Filler that carries no distinguishing information, so "Tufts" and "Tufts
// University" collapse to one proof instead of asking for the same letter twice.
const FILLER = /\b(the|university|universities|college|school|of|at|in)\b/g;

/**
 * Canonical key for an admit claim, so a seller uploads one letter per school
 * rather than one per spelling. Proofs are keyed on (sellerId, schoolKey), which
 * also lets a returning seller reuse a letter across listings.
 *
 * This is deliberately dumb string normalisation. It collapses the easy cases
 * ("Tufts" / "Tufts University", trailing punctuation, casing) but NOT the hard
 * ones - "UC Berkeley" and "University of California, Berkeley" still key apart.
 * lib/schools.ts (on another branch) resolves those to a single domain; swap
 * this for `schoolInfo(name)?.domain ?? schoolKey(name)` once it lands, and
 * backfill existing rows. Until then the cost is a duplicate upload request,
 * which is annoying but never wrong.
 */
export function schoolKey(name: string): string {
  return String(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Human label for a proof's state, used in the seller dashboard and console. */
export const PROOF_LABEL: Record<ProofStatus, string> = {
  pending: 'Awaiting review',
  verified: 'Verified',
  rejected: 'Not accepted',
};
