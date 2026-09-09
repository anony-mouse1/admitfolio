import { sameSchool, schoolInfo, schoolShortName } from './schools';
import type { PublicListing } from './publicListing';

// What the right-hand panel on a collection page shows. Every figure is derived
// from listings the page has already loaded, so this costs no extra query and
// invents nothing.
//
// Schools are aggregate counts and the page renders them as plain text, never
// as links. That is deliberate: per-school routes are a separate decision, and
// a count of how many listings in a collection claim a school is not a
// per-seller grouping. It is the same data already printed on every card's
// "Accepted at" line, added up.

export type CollectionSummary = {
  listings: number;
  essays: number;
  packages: number;
  priceLow: number | null;
  priceHigh: number | null;
  prompts: { label: string; count: number }[];
  schools: { label: string; count: number }[];
};

const NOT_A_SCHOOL = new Set(['questbridge.org', 'gatesscholarship.org']);

export function collectionSummary(listings: PublicListing[]): CollectionSummary {
  const prompts = new Map<string, number>();
  for (const listing of listings) {
    for (const prompt of new Set(listing.essays.map((essay) => essay.prompt))) {
      prompts.set(prompt, (prompts.get(prompt) || 0) + 1);
    }
  }

  // Counted once per listing per school, and keyed on the resolved domain so
  // "UCSD" and "UC San Diego" are one row rather than two.
  const schools = new Map<string, { label: string; count: number }>();
  for (const listing of listings) {
    const seen: string[] = [];
    for (const tag of listing.verifiedAdmitTags || []) {
      const info = schoolInfo(tag);
      if (info && NOT_A_SCHOOL.has(info.domain)) continue;
      const key = info ? info.domain : `raw:${tag.toLowerCase().trim()}`;
      if (seen.includes(key)) continue;
      if (!info && seen.some((k) => k.startsWith('raw:') && sameSchool(k.slice(4), tag))) continue;
      seen.push(key);
      const row = schools.get(key) || { label: info ? info.short : schoolShortName(tag), count: 0 };
      row.count += 1;
      schools.set(key, row);
    }
  }

  const prices = listings.map((l) => l.price).filter((p): p is number => typeof p === 'number').sort((a, b) => a - b);
  const byCount = <T extends { count: number; label: string }>(rows: T[]) =>
    rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    listings: listings.length,
    essays: listings.reduce((total, l) => total + l.essays.length, 0),
    packages: listings.filter((l) => l.essays.length > 1).length,
    priceLow: prices[0] ?? null,
    priceHigh: prices.at(-1) ?? null,
    // Kept short on purpose: the panel sits beside the page header, and a long
    // list left the text column looking like a hole rather than a column.
    prompts: byCount([...prompts.entries()].map(([label, count]) => ({ label, count }))).slice(0, 4),
    schools: byCount([...schools.values()]).slice(0, 6),
  };
}
