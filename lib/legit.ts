import { SITE_URL } from './site';

// The legitimacy page's path and URL, in one place for the same reason
// lib/guides.ts and lib/collections.ts keep theirs: the page's own canonical
// tag, the sitemap entry, the footers, the checkout panel and the collection
// pages all link here, and a path written out five times is a path that ends up
// spelled four ways.
//
// "Is admitfolio legit" is the third biggest query the site gets. The page
// answering it needs one stable URL that never moves.

export const LEGIT_PATH = '/legit';

export function legitUrl(): string {
  return `${SITE_URL}${LEGIT_PATH}`;
}
