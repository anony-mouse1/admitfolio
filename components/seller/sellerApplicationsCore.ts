import { normalizeAnonymity, type Anonymity } from '../../lib/anonymity';

// 'draft' is defensive only. No route writes it: both submit paths create
// 'pending', and lib/sellerDashboardView maps any status it does not recognise
// onto it rather than crashing. Nothing in production carries it.
export type SellerListingStatus = 'approved' | 'pending' | 'draft' | 'rejected' | 'removed';

// There is no Drafts chip. It used to be a catch-all holding rejected and taken
// down listings, so clicking "Drafts" showed a listing labelled "Taken down"
// and no actual draft, which live only in SellerApplicationDraft and never
// reach this component.
export type SellerListingFilter = 'all' | 'published' | 'review';
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

/**
 * Which chip a listing belongs under, or null when it belongs under All only.
 *
 * Rejected and taken down listings are terminal: nothing a seller presses moves
 * them, so they are not "in review" and they are not "published". They appear
 * under All, which is the default, rather than being filed under a heading that
 * misdescribes them.
 */
export function listingFilterForStatus(
  status: SellerListingStatus,
): Exclude<SellerListingFilter, 'all'> | null {
  if (status === 'approved') return 'published';
  if (status === 'pending') return 'review';
  return null;
}

/** Pill colour. Terminal listings read as closed rather than in progress. */
export function listingStatusTone(status: SellerListingStatus): 'published' | 'review' | 'closed' {
  return listingFilterForStatus(status) ?? 'closed';
}

// The 'draft' arm below is unreachable, kept because the status union keeps its
// defensive value and the switch stays exhaustive.
export function listingStatusLabel(status: SellerListingStatus): string {
  switch (status) {
    case 'approved': return 'Published';
    case 'pending': return 'Pending review';
    case 'draft': return 'Draft';
    case 'rejected': return 'Needs changes';
    case 'removed': return 'Taken down';
  }
}

// Only 'approved' and 'pending' can reach this. A rejected or taken down
// listing renders no action button at all, and 'draft' is the defensive value
// nothing writes. The arms stay so the switch remains exhaustive.
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
      // A terminal listing has no chip, so it is dropped from Published and In
      // review and appears under All, which is the default.
      listings: application.listings.filter((listing) => listingFilterForStatus(listing.status) === filter),
    }))
    .filter((application) => application.listings.length > 0);
}

export function listingFilterCounts(applications: SellerApplicationRecord[]): Record<SellerListingFilter, number> {
  const counts: Record<SellerListingFilter, number> = { all: 0, published: 0, review: 0 };
  for (const application of applications) {
    for (const listing of application.listings) {
      counts.all += 1;
      const filter = listingFilterForStatus(listing.status);
      if (filter) counts[filter] += 1;
    }
  }
  return counts;
}
