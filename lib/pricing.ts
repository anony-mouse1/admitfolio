// School tiers are retained for catalogue ordering. Seller pricing is no longer
// tied to a school's tier: recommendations depend only on package size.

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

export function recommendedPackagePrice(count: number): number {
  const essayCount = Math.max(1, Math.round(count));
  if (essayCount === 1) return 15;
  if (essayCount <= 3) return 19;
  if (essayCount <= 6) return 24;
  return 29;
}

export const RECOMMENDED_ESSAY_PRICE = 15;

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

// Best (lowest-numbered) tier among a seller's admit schools; null without admits.
export function admitsTier(admits: string[]): 1 | 2 | 3 | null {
  if (!admits.length) return null;
  return admits.map(schoolTier).reduce((a, b) => (a < b ? a : b)) as 1 | 2 | 3;
}
