import { normalizeAnonymity, type Anonymity } from '../../lib/anonymity';

export type SellerListingStatus = 'approved' | 'pending' | 'draft' | 'rejected' | 'removed';
export type SellerListingFilter = 'all' | 'published' | 'review' | 'draft';
export type ApplicationDecision = 'admitted' | 'waitlisted' | 'denied' | 'withdrawn';
export type ApplicationVerificationStatus = 'verified' | 'reviewing' | 'needs_proof' | 'not_started';

export type SellerApplicationListing = {
  /** Listing is the purchase and mutation unit. Never replace this with an essay id. */
  id: string;
  title: string;
  essayCount: number;
  wordCount: number | null;
  priceCents: number | null;
  status: SellerListingStatus;
  /** Authoritative privacy choice for this listing only. */
  anonymity: Anonymity | 'firstName';
  reviewerNote?: string | null;
  // Everything below feeds the price panel that opens inside this row. It used
  // to live in a card rendered after the whole workspace, far from the button.
  pricingMode: 'package' | 'separate';
  /** Whole dollars, as stored. Null when the listing has no package price. */
  packagePrice: number | null;
  /** Lowest price this listing may carry, resolved from its tier server-side. */
  priceFloor: number;
  sales: number;
  createdAt: string;
  essays: Array<{ id: string; label: string; price: number | null }>;
};

export type SellerApplicationRecord = {
  /** Private dashboard key used only for callbacks and React identity. */
  key: string;
  school: string;
  cycleLabel: string;
  classYear?: string | null;
  decision: ApplicationDecision;
  verificationStatus: ApplicationVerificationStatus;
  verificationLabel?: string | null;
  /** Only root-relative, production asset paths are rendered. */
  localLogoSrc?: string | null;
  listings: SellerApplicationListing[];
};

export type SellerProfileSummary = {
  displayName: string | null;
  bio: string | null;
  backgroundTags: string[];
};

export function listingFilterForStatus(status: SellerListingStatus): Exclude<SellerListingFilter, 'all'> {
  if (status === 'approved') return 'published';
  if (status === 'pending') return 'review';
  return 'draft';
}

export function listingStatusLabel(status: SellerListingStatus): string {
  switch (status) {
    case 'approved': return 'Published';
    case 'pending': return 'Pending review';
    case 'draft': return 'Draft';
    case 'rejected': return 'Needs changes';
    case 'removed': return 'Taken down';
  }
}

export function listingActionLabel(status: SellerListingStatus): string {
  switch (status) {
    case 'draft': return 'Continue';
    case 'rejected': return 'Fix and resubmit';
    case 'pending': return 'View';
    default: return 'Edit';
  }
}

export function anonymitySummary(value: SellerApplicationListing['anonymity']): string {
  switch (normalizeAnonymity(value)) {
    case 'full': return 'Full name is public';
    case 'revealOnPurchase': return 'Anonymous publicly, first name after purchase';
    default: return 'Seller name stays hidden';
  }
}

export function applicationDecisionLabel(decision: ApplicationDecision): string {
  switch (decision) {
    case 'admitted': return 'Admitted';
    case 'waitlisted': return 'Waitlisted';
    case 'denied': return 'Not admitted';
    case 'withdrawn': return 'Withdrawn';
  }
}

/**
 * Produces a factual buyer-facing outcome. Unverified outcomes never become
 * claims, and no result is framed as something an essay caused.
 */
export function verifiedOutcomeClaim(application: SellerApplicationRecord): string | null {
  if (application.verificationStatus !== 'verified') return null;
  const decision = applicationDecisionLabel(application.decision);
  const classYear = application.classYear?.trim();
  return classYear
    ? `${decision} to ${application.school}, Class of ${classYear}`
    : `${decision} to ${application.school}`;
}

export function applicationVerificationLabel(application: SellerApplicationRecord): string {
  if (application.verificationLabel?.trim()) return application.verificationLabel.trim();
  switch (application.verificationStatus) {
    case 'verified': return 'Outcome verified';
    case 'reviewing': return 'AI check in progress';
    case 'needs_proof': return 'Proof needs an update';
    case 'not_started': return 'Verification not started';
  }
}

export function isSafeLocalLogoPath(src: string | null | undefined): src is string {
  if (!src || !src.startsWith('/') || src.startsWith('//')) return false;
  return !src.startsWith('/mockup-assets/');
}

export function applicationsForFilter(
  applications: SellerApplicationRecord[],
  filter: SellerListingFilter,
): SellerApplicationRecord[] {
  if (filter === 'all') return applications;
  return applications
    .map((application) => ({
      ...application,
      listings: application.listings.filter((listing) => listingFilterForStatus(listing.status) === filter),
    }))
    .filter((application) => application.listings.length > 0);
}

export function listingFilterCounts(applications: SellerApplicationRecord[]): Record<SellerListingFilter, number> {
  const counts: Record<SellerListingFilter, number> = { all: 0, published: 0, review: 0, draft: 0 };
  for (const application of applications) {
    for (const listing of application.listings) {
      counts.all += 1;
      counts[listingFilterForStatus(listing.status)] += 1;
    }
  }
  return counts;
}
