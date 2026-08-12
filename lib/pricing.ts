// Smart pricing engine - shared by the sell wizard (client) and the seller
// price-edit API (server), so floors can't be bypassed with a direct request.

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
// rest. Single source of truth - the Stripe webhook's `net`, the seller
// dashboard's earnings and payout figures, and its "you keep N%" label all
// derive from it. Keep it that way: a split change that reached the webhook but
// not the dashboard would pay a seller one number and show them another.
// The published split in app/terms/page.tsx does NOT derive from this and must
// be edited by hand to match - it is a commitment to sellers, not a computation.
export const SELLER_SHARE = 0.7;

export const packageFloor = (tier: 1 | 2 | 3, count: number) => TIER[tier].base + TIER[tier].extra * (Math.max(1, count) - 1);
export const perEssayFloor = (tier: 1 | 2 | 3) => TIER[tier].perEssay;

// Best (lowest-numbered) tier among a seller's admit schools; null without admits.
export function admitsTier(admits: string[]): 1 | 2 | 3 | null {
  if (!admits.length) return null;
  return admits.map(schoolTier).reduce((a, b) => (a < b ? a : b)) as 1 | 2 | 3;
}
