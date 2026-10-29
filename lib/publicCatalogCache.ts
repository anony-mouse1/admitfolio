import 'server-only';
import { revalidateTag } from 'next/cache';

// The cache tag on the public catalogue (lib/publicCatalog.ts), shared by
// /api/listings, the six collection pages and /essays. Kept apart from that
// module so the write routes that expire it do not pull in the catalogue query.
export const PUBLIC_CATALOG_TAG = 'public-catalog';

/**
 * Expire the cached catalogue after a write that can change a card. Call it
 * once the write has committed, never inside a $transaction callback, from a
 * route handler or a function one calls: Next queues the tag on the request
 * and applies it when the handler returns.
 *
 * `{ expire: 0 }` makes the next visit read fresh data instead of serving the
 * old catalogue once more, which is what a takedown needs.
 *
 * It never throws. The write it follows has already happened, and a cache
 * bookkeeping failure must not turn a saved change into an error for the
 * seller or admin. The catalogue would still pick the change up on the next
 * request through its fingerprint key.
 */
export function revalidatePublicCatalog(): void {
  try {
    revalidateTag(PUBLIC_CATALOG_TAG, { expire: 0 });
  } catch (error) {
    console.error('public catalog revalidation failed:', error instanceof Error ? error.message : error);
  }
}
