// Smart pricing engine - shared by the sell wizard (client) and the seller
// price-edit API (server), so floors can't be bypassed with a direct request.

const T1_KEYS = ['harvard', 'yale', 'princeton', 'stanford', 'mit', 'massachusetts institute', 'columbia', 'university of chicago', 'uchicago', 'upenn', 'university of pennsylvania', ' penn ', 'caltech', 'california institute', 'brown', 'dartmouth', 'cornell', 'duke', 'northwestern', 'johns hopkins', 'john hopkins', 'vanderbilt', 'rice', 'notre dame', 'washington university', 'washu', ' ivy ', 'williams', 'amherst', 'pomona', 'swarthmore', 'bowdoin', 'claremont mckenna', 'georgetown'];
const T2_KEYS = ['ucla', 'uc los angeles', 'berkeley', ' cal ', 'usc', 'southern california', 'michigan', 'ann arbor', 'unc', 'north carolina', 'nyu', 'new york university', 'carnegie mellon', 'cmu', 'emory', ' uva ', 'virginia', 'tufts', 'wake forest', 'boston college', 'georgia tech', 'georgia institute', 'ut austin', 'texas at austin', 'wisconsin', 'madison', 'boston university', 'northeastern', 'uc san diego', 'ucsd', 'uc irvine', 'uc davis', 'uc santa barbara', 'ucsb', 'case western', 'rochester', 'lehigh', 'villanova', 'william and mary', 'william & mary', 'tulane', 'rensselaer', ' rpi ', 'purdue', 'illinois urbana', 'university of florida', 'ohio state', 'maryland', 'pittsburgh', 'miami', 'washington seattle'];

export function schoolTier(name: string): 1 | 2 | 3 {
  const n = ' ' + String(name).toLowerCase().replace(/[^a-z0-9 &]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  if (T1_KEYS.some((k) => n.includes(k))) return 1;
  if (T2_KEYS.some((k) => n.includes(k))) return 2;
  return 3;
}

export const TIER: Record<1 | 2 | 3, { label: string; base: number; extra: number; perEssay: number }> = {
  1: { label: 'Tier 1 · Top', base: 40, extra: 18, perEssay: 30 },
  2: { label: 'Tier 2 · Strong', base: 30, extra: 13, perEssay: 22 },
  3: { label: 'Tier 3 · Standard', base: 20, extra: 9, perEssay: 15 },
};

// Revenue split: sellers keep this share of every sale.
export const SELLER_SHARE = 0.7;

export const packageFloor = (tier: 1 | 2 | 3, count: number) => TIER[tier].base + TIER[tier].extra * (Math.max(1, count) - 1);
export const perEssayFloor = (tier: 1 | 2 | 3) => TIER[tier].perEssay;

// Best (lowest-numbered) tier among a seller's admit schools; null without admits.
export function admitsTier(admits: string[]): 1 | 2 | 3 | null {
  if (!admits.length) return null;
  return admits.map(schoolTier).reduce((a, b) => (a < b ? a : b)) as 1 | 2 | 3;
}
