// The Fatimah's Guide cross-promotion, approved by Fatimah on Oct 25 2026.
//
// Three placements, each tagged so the click shows up in fatimahs.guide's own
// analytics: a site-wide bottom banner, a card at the end of every guide, and
// a card on the two pages a buyer sees after paying. Every link and every line
// of copy lives here so the placements cannot drift apart, and so
// scripts/cross-promo.test.mjs can check them without rendering anything.
//
// No imports on purpose: the test loads this file on its own.

export const CROSS_PROMO_ORIGIN = 'https://fatimahs.guide';

export type CrossPromoMedium = 'banner' | 'blog' | 'purchase';

// utm_content says which page inside a medium earned the click: the guide's
// slug on a blog card, `success` or `reading` on the purchase pages. The banner
// runs on every page, so it carries none.
export function crossPromoUrl(medium: CrossPromoMedium, content?: string): string {
  const params = new URLSearchParams({
    utm_source: 'admitfolio',
    utm_medium: medium,
    utm_campaign: 'crosspromo',
  });
  if (content) params.set('utm_content', content);
  return `${CROSS_PROMO_ORIGIN}/?${params.toString()}#consult`;
}

// Remembered so a dismissed banner stays gone across visits. Holds only "1".
export const CROSS_PROMO_DISMISS_KEY = 'admitfolio:fg-promo-dismissed';

// The banner stays off the admin console and off /purchase/*. The purchase
// pages carry their own card, and one ask per page is enough.
export function crossPromoBannerAllowed(pathname: string): boolean {
  return !/^\/(admin|purchase)(\/|$)/i.test(pathname);
}

// Copy. Each banner line is split into a lead, the linked emphasis and a tail
// so the bold run can be styled without the sentence being written twice.
export const CROSS_PROMO_COPY = {
  // 900px and wider: one line.
  bannerLong: {
    lead: 'Want 1:1 help with your applications? ',
    emphasis: 'Book a free call with Fatimah',
    tail: ", Admitfolio's founder (bring a parent).",
  },
  // Below 900px. Allowed to wrap to two lines on small phones.
  bannerShort: {
    lead: '',
    emphasis: 'Free 1:1 call with Fatimah',
    tail: ", Admitfolio's founder. Bring a parent.",
  },
  guideHeading: 'Want 1:1 help with your applications?',
  guideBody: "Book a free call with Fatimah, Admitfolio's founder (bring a parent).",
  readingHeading: "You've read how they did it. Want help with yours?",
  purchaseBody: "Book a free 1:1 call with Fatimah, Admitfolio's founder (bring a parent).",
  button: 'Book a free call',
} as const;
