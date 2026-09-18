import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from './site';

// Every JSON-LD object the site publishes, built here and nowhere else.
//
// The rule these all obey: structured data must describe what the page
// actually renders. Google treats markup about content a visitor cannot see as
// a spam violation, and the penalty is a manual action on the whole site, not
// a lost rich result. So none of these functions takes a hand-written list.
// Each one is handed the exact values the page is about to render and derives
// the markup from them, which makes a drift between markup and page
// impossible rather than merely unlikely.
//
// Nothing here is a rich result we are eligible for. Admitfolio sells a
// listing, not a product with a per-item page, so there is no Product and no
// Offer anywhere in this file (see the note on itemListSchema). These
// objects exist to tell a crawler what the organisation is and what each page
// is a list of, which is understanding, not decoration.

export type JsonLd = Record<string, unknown>;

/**
 * The homepage's Organization block.
 *
 * Deliberately four fields and no more. Every one of them is something the
 * served page already states:
 *
 * - `name` is the wordmark in the nav and the first word of the <title>.
 * - `url` is the same origin the canonical link on / points at.
 * - `logo` is the icon the document already links as apple-touch-icon. Next
 *   serves app/apple-icon.png at this exact path and robots.txt allows it, so
 *   it is crawlable, and at 180x180 it clears Google's 112x112 minimum.
 * - `description` is SITE_DESCRIPTION, the identical string the served
 *   <meta name="description"> carries.
 *
 * What is missing is missing on purpose, and should stay missing until
 * somebody can point at the fact rather than infer it:
 *
 * - No `sameAs`. Admitfolio has no social profile of its own. The one social
 *   link on the site is https://www.instagram.com/fatimahs.guide/, in the FAQ,
 *   and that account is the founder's personal one under a different name.
 *   `sameAs` means "this is another page for this same organisation", so
 *   listing it would tell Google that Admitfolio and Fatimah's Guide are one
 *   entity. If an @admitfolio account exists, add it here; do not promote the
 *   founder's to stand in for one.
 * - No `foundingDate`, `address`, `telephone` or `numberOfEmployees`. None of
 *   those is recorded anywhere in this repo, and a plausible guess in
 *   structured data is a false statement about a real company.
 */
export function organizationSchema(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/apple-icon.png`,
    description: SITE_DESCRIPTION,
  };
}

/** One rendered entry in a list: exactly the text and the href the page shows. */
export type ListedItem = { name: string; url: string };

/**
 * A page's ItemList, built from the items that page is about to render.
 *
 * `numberOfItems` is the array length rather than a separate count, so it
 * cannot disagree with `itemListElement`, and `position` follows array order,
 * which is the order the cards are mapped in. Hand this the same array the
 * page maps over and the two cannot drift.
 *
 * No `itemListOrder`. The catalogue comes back newest-reviewed first, which is
 * a real order but not one of schema.org's three, and claiming
 * ItemListUnordered would say the order carries no meaning when it does.
 *
 * Each element is a bare ListItem with a name and a url, and that is the
 * ceiling on purpose. A ListItem may carry an `item` with its own @type, and
 * the tempting one here is Product with an Offer and a price. It would be
 * wrong twice over. A listing has no page of its own for an offer to live on,
 * so the `url` would be a query variant of a page whose canonical is the bare
 * path; and an Offer commits the site to price, availability and currency
 * being correct in markup on every crawl, on a catalogue where a seller can
 * take a listing down at any moment. Product markup on a page that is not a
 * product page is the most common structured-data manual action there is.
 */
export function itemListSchema(name: string, items: ListedItem[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  };
}

/** Absolute form of an on-site path, for the `url` of a listed item. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path}`;
}
