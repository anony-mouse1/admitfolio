// The price range of live listings with the same number of essays, shown to a
// seller while they price a listing. It is built from the public catalogue the
// page already loads, so it only ever describes what any buyer can see.
//
// It deliberately says nothing about how likely a price is to sell. There is
// not enough sales data for that, and a range is all the catalogue supports.

export type PricedListing = { id: string; price: number | null; essayCount: number };

export type SimilarPriceRange = {
  essayCount: number;
  /** Live listings with this essay count, excluding the one being edited. */
  count: number;
  /** Null when there are too few listings for a range to mean anything. */
  min: number | null;
  max: number | null;
  /** The middle half (25th to 75th percentile). Null when it would mislead. */
  middle: { low: number; high: number } | null;
};

// Below three, a "range" is one or two sellers' own prices.
export const MIN_LISTINGS_FOR_RANGE = 3;
// Below eight, quartiles are just individual listings.
export const MIN_LISTINGS_FOR_MIDDLE = 8;

function nearestRank(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1) + 0.5))];
}

export function similarPriceRange(
  listings: PricedListing[],
  essayCount: number,
  excludeListingId?: string,
): SimilarPriceRange {
  const prices = listings
    .filter((listing) => listing.essayCount === essayCount && listing.id !== excludeListingId)
    .map((listing) => listing.price)
    .filter((price): price is number => typeof price === 'number' && Number.isFinite(price) && price > 0)
    .sort((a, b) => a - b);
  const count = prices.length;
  if (count < MIN_LISTINGS_FOR_RANGE) return { essayCount, count, min: null, max: null, middle: null };
  const low = nearestRank(prices, 0.25);
  const high = nearestRank(prices, 0.75);
  return {
    essayCount,
    count,
    min: prices[0],
    max: prices[count - 1],
    middle: count >= MIN_LISTINGS_FOR_MIDDLE && low !== high ? { low, high } : null,
  };
}
