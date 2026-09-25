// Pricing rules, shared by the sell wizard and dashboard editor (client) and
// every route that saves a price (server), so the form and a direct request are
// held to exactly the same limits.
//
// Sellers choose their own price. The school tier only sets a recommended
// price, shown as a suggestion. The hard limits are MIN_PRICE and the two caps.

import { schoolInfo } from './schools';

// Tiers are keyed on the resolved school, not on loose substrings of the name
// the seller typed.
//
// The previous version matched a keyword list, and ' penn ' in the tier 1 list
// matched "Penn State", so a Penn State admit was priced as if it were UPenn.
// Worse, it was inconsistent: "Penn State" scored tier 1 while "Pennsylvania
// State University" scored tier 3, so the floor a seller saw depended on how
// they spelled their own school. lib/schools.ts already resolves both to
// psu.edu and keeps them apart from upenn.edu, so tiers now hang off that.
const T1_DOMAINS = new Set([
  'harvard.edu', 'yale.edu', 'princeton.edu', 'stanford.edu', 'mit.edu', 'columbia.edu',
  'uchicago.edu', 'upenn.edu', 'caltech.edu', 'brown.edu', 'dartmouth.edu', 'cornell.edu',
  'duke.edu', 'northwestern.edu', 'jhu.edu', 'vanderbilt.edu', 'rice.edu', 'nd.edu',
  'wustl.edu', 'williams.edu', 'amherst.edu', 'pomona.edu', 'swarthmore.edu', 'bowdoin.edu',
  'cmc.edu', 'georgetown.edu',
]);
const T2_DOMAINS = new Set([
  'ucla.edu', 'berkeley.edu', 'usc.edu', 'umich.edu', 'unc.edu', 'nyu.edu', 'cmu.edu',
  'emory.edu', 'virginia.edu', 'tufts.edu', 'wfu.edu', 'bc.edu', 'gatech.edu', 'utexas.edu',
  'wisc.edu', 'bu.edu', 'northeastern.edu', 'ucsd.edu', 'uci.edu', 'ucdavis.edu', 'ucsb.edu',
  'case.edu', 'rochester.edu', 'lehigh.edu', 'villanova.edu', 'wm.edu', 'tulane.edu',
  'rpi.edu', 'purdue.edu', 'illinois.edu', 'ufl.edu', 'osu.edu', 'umd.edu', 'pitt.edu',
  'miami.edu', 'washington.edu',
]);

export function schoolTier(name: string): 1 | 2 | 3 {
  const info = schoolInfo(name);
  if (!info) return 3;
  if (T1_DOMAINS.has(info.domain)) return 1;
  if (T2_DOMAINS.has(info.domain)) return 2;
  return 3;
}

export const TIER: Record<1 | 2 | 3, { label: string; base: number; extra: number; perEssay: number }> = {
  1: { label: 'Tier 1 · Top', base: 40, extra: 18, perEssay: 30 },
  2: { label: 'Tier 2 · Strong', base: 30, extra: 13, perEssay: 22 },
  3: { label: 'Tier 3 · Standard', base: 20, extra: 9, perEssay: 15 },
};

// Revenue split: sellers keep this share of every sale, the platform keeps the
// rest. New purchases snapshot this value in cents. The dashboard reads those
// snapshots so historical purchases keep the terms in effect when they sold.
// The published split in app/terms/page.tsx does NOT derive from this and must
// be edited by hand to match - it is a commitment to sellers, not a computation.
export const SELLER_SHARE_BPS = 6_000;
export const SELLER_SHARE = SELLER_SHARE_BPS / 10_000;
// The marketplace has not had a live paid purchase yet, so there is no older
// revenue promise to preserve. Rows created by prototypes also use 60/40.
export const UNSNAPSHOTTED_SELLER_SHARE_BPS = SELLER_SHARE_BPS;

// Recommended prices. These were hard floors until sellers were allowed to set
// their own price; the numbers are unchanged and are now only a suggestion.
export const recommendedPackagePrice = (tier: 1 | 2 | 3, count: number) => TIER[tier].base + TIER[tier].extra * (Math.max(1, count) - 1);
export const recommendedEssayPrice = (tier: 1 | 2 | 3) => TIER[tier].perEssay;

// Prices are whole dollars (Listing.packagePrice and Essay.price are Int
// columns). A non-whole amount is refused rather than rounded, so a seller who
// types $12.50 is told, instead of silently being charged out at $13.
export const MIN_PRICE = 10;
export const MAX_PACKAGE_PRICE = 399;
export const MAX_ESSAY_PRICE = 99;
export const WHOLE_DOLLARS_ONLY = 'Whole dollars only, no cents.';

export type PriceKind = 'package' | 'essay';
export type PriceCheck = { ok: true; price: number } | { ok: false; error: string };

export function checkPrice(value: unknown, kind: PriceKind): PriceCheck {
  const max = kind === 'package' ? MAX_PACKAGE_PRICE : MAX_ESSAY_PRICE;
  const amount = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(amount)) {
    return { ok: false, error: kind === 'package' ? 'Set a package price.' : 'Set a price for every essay.' };
  }
  if (!Number.isInteger(amount)) return { ok: false, error: `${WHOLE_DOLLARS_ONLY} Round to the nearest dollar.` };
  if (amount < MIN_PRICE) return { ok: false, error: `The lowest price you can set is $${MIN_PRICE}.` };
  if (amount > max) {
    return {
      ok: false,
      error: kind === 'package'
        ? `The most you can charge for one listing is $${max}.`
        : `The most you can charge for one essay is $${max}.`,
    };
  }
  return { ok: true, price: amount };
}
