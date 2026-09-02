// Proof-of-admission: sellers upload an acceptance letter for every school they
// claim on a listing.
//
// A seller can upload a letter for an admission claim while their listing is
// pending. The final source of truth is admin approval of the seller's essays:
// once any listing is approved, all of that seller's admission claims are
// verified without a second acceptance-letter decision.

/** Where a proof sits. `pending` is the only state a seller can create. */
export type ProofStatus = 'pending' | 'verified' | 'rejected';
export const PROOF_STATUSES: ProofStatus[] = ['pending', 'verified', 'rejected'];

/** Storage prefix inside the private essays bucket. */
export const PROOF_PREFIX = 'admit-proofs';

// Filler that carries no distinguishing information, so "Tufts" and "Tufts
// University" collapse to one proof instead of asking for the same letter twice.
const FILLER = /\b(the|university|universities|college|school|of|at|in)\b/g;

export type ListingAdmissionClaim = {
  schoolKey: string;
  schoolLabel: string;
};

/**
 * Both review markers are required, not optional. A caller that maps rows by
 * hand and drops them would otherwise still type-check while
 * `isAdminApprovedListing` silently collapsed to `status === 'approved'`, which
 * hands seller-wide verification to AI-auto-approved listings.
 */
export type ListingApprovalState = {
  status: string;
  humanReviewedAt: Date | string | null;
  aiDecision: string | null;
};

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

/**
 * Return the distinct schools claimed by one listing, keeping a human label for
 * proof rows and the normalized key used for matching.
 */
export function listingAdmissionClaims(
  admitTags: string,
  targetSchool?: string | null,
): ListingAdmissionClaim[] {
  let labels: string[] = [];
  try {
    const parsed: unknown = JSON.parse(admitTags);
    if (Array.isArray(parsed)) labels = parsed.map(String);
  } catch {
    // A malformed legacy value has no trusted proof claims.
  }
  if (targetSchool) labels.push(targetSchool);

  const claims = new Map<string, ListingAdmissionClaim>();
  for (const rawLabel of labels) {
    const schoolLabel = rawLabel.trim();
    const key = schoolKey(schoolLabel);
    if (!key || claims.has(key)) continue;
    claims.set(key, { schoolKey: key, schoolLabel });
  }
  return [...claims.values()];
}

/**
 * Return only the proof keys claimed by one listing. Review jobs must never
 * load every admission document belonging to the seller because those files
 * can contain unrelated schools and sensitive personal information.
 */
export function listingProofKeys(admitTags: string, targetSchool?: string | null): string[] {
  return listingAdmissionClaims(admitTags, targetSchool).map((claim) => claim.schoolKey);
}

/**
 * New admin decisions stamp humanReviewedAt. Older listings predate that field,
 * so an approved row without an AI approval marker is treated as legacy admin
 * approval. A purely automated approval never verifies the whole seller.
 */
export function isAdminApprovedListing(listing: ListingApprovalState): boolean {
  return listing.status === 'approved'
    && (listing.humanReviewedAt != null || listing.aiDecision !== 'approved');
}

/** Admin approval of the essays is also approval of their admission claims. */
export function resolvedProofStatus(
  sellerHasApprovedListing: boolean,
  proofStatus?: string | null,
): ProofStatus | 'missing' {
  if (sellerHasApprovedListing) return 'verified';
  return PROOF_STATUSES.includes(proofStatus as ProofStatus)
    ? proofStatus as ProofStatus
    : 'missing';
}

/**
 * Keep pending listings proof-based. Once the listing is approved, every claim
 * is verified even when a legacy seller was never asked to upload a letter.
 */
export function verifiedAdmissionTags(
  sellerHasAdminApproval: boolean,
  admitTags: string[],
  verifiedProofKeys: Iterable<string>,
): string[] {
  if (sellerHasAdminApproval) return [...admitTags];
  const verified = new Set(verifiedProofKeys);
  return admitTags.filter((tag) => verified.has(schoolKey(tag)));
}

/** Human label for a proof's state, used in the seller dashboard and console. */
export const PROOF_LABEL: Record<ProofStatus, string> = {
  pending: 'Awaiting review',
  verified: 'Verified',
  rejected: 'Not accepted',
};
