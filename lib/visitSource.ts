// Where a buyer came from, carried from the first page of their session to the
// Stripe Checkout Session they eventually create.
//
// Nine sales, no idea what produced any of them. Vercel Analytics records the
// funnel events but nothing joins a Stripe payment back to the page that
// earned it, so "which pages drive purchases" cannot be answered at all today.
// This rides along on the /api/checkout request that already happens.
//
// Client-safe by construction: no 'server-only', nothing Node-specific, no
// React. The rules are pure functions over a storage object so they can be unit
// tested without a browser, exactly like lib/analyticsPolicy.ts.
//
// The landing page is the FIRST page of the session, not the current one. A
// buyer who finds /essays/engineering in search, clicks through to the
// homepage and buys there is a sale that /essays/engineering earned. Recording
// the current page would credit the homepage every time and make the six
// collection pages look worthless.

import { redactAnalyticsUrl } from './redactAnalyticsUrl';

export const LANDING_STORAGE_KEY = 'admitfolio:landing';

// Stripe rejects a metadata value over 500 characters, counted in Unicode code
// points (verified against the sandbox: 500 ASCII ok, 501 rejected; 500 emoji
// ok at 2000 bytes, 501 CJK rejected at 1503 bytes). The rejection fails the
// whole sessions.create call, which /api/checkout turns into a 502 the buyer
// reads as "Could not start checkout". The slice below counts code points so it
// can never leave a split surrogate pair behind.
//
// 400 is a measured margin, not a round number:
//
//   our own paths     51 max, and bounded. The longest of the 20 public routes
//                     is /guides/how-to-take-inspiration-from-college-essays.
//                     Every route is enumerable, and the one that looks
//                     unbounded, /purchase/<token>, redacts to 17 characters.
//                     So landingPage and checkoutPage can never truncate.
//   landingUtm        125 for a long but plausible campaign, 57 for a typical
//                     newsletter send, 28 for plain organic.
//   landingReferrer   the only genuinely unbounded field. A long
//                     r/ApplyingToCollege thread measured 192, and that is an
//                     obvious traffic source for this product rather than a
//                     contrived example.
//
// The referrer is what sets the floor, and 200 left it 8 characters of room.
// 400 is double the longest thing measured and still 100 short of the hard
// limit, so no discrepancy between how Node counts code points and how Stripe
// counts them can turn an attribution field into a failed purchase. There is no
// aggregate cap to spend: 50 keys at 500 characters each was accepted.
export const MAX_SOURCE_VALUE = 400;

// The utm parameters worth carrying. source/medium/campaign answer "which
// channel"; utm_content and utm_term are ad-level detail for ads this site
// does not run, and every extra parameter is length spent on the one value.
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** What is stored at landing, and read back at checkout. */
export type LandingRecord = {
  page: string;
  referrer: string;
  utm: string;
};

/** The four fields that reach Stripe metadata. Any of them may be empty. */
export type VisitSource = {
  landingPage: string;
  landingReferrer: string;
  landingUtm: string;
  checkoutPage: string;
};

export const VISIT_SOURCE_KEYS: ReadonlyArray<keyof VisitSource> = [
  'landingPage',
  'landingReferrer',
  'landingUtm',
  'checkoutPage',
];

function clamp(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const points = [...normalized];
  return points.length <= MAX_SOURCE_VALUE ? normalized : points.slice(0, MAX_SOURCE_VALUE).join('');
}

/**
 * The pathname of one of our own URLs, with anything credential-shaped already
 * replaced by lib/redactAnalyticsUrl.
 *
 * That redaction is not decoration. A buyer reading an essay they bought is
 * sitting on /purchase/<accessToken>, a bearer credential valid for a year that
 * alone authorises /api/essay/<id>. If they buy a second listing from there,
 * the raw landing URL IS that token, and this would write it into Stripe
 * metadata where every Dashboard user can read it. Reusing the analytics
 * redactor means the token becomes "/purchase/[token]", which is the useful
 * answer anyway: they came back from their reading page.
 */
export function pathLabel(rawHref: string): string {
  const safe = redactAnalyticsUrl(rawHref);
  if (!safe) return '';
  try {
    return clamp(new URL(safe).pathname);
  } catch {
    return '';
  }
}

/**
 * The site that sent them, as host plus path.
 *
 * The query string is dropped rather than redacted. A referrer query is the
 * part most likely to carry someone else's personal data, a webmail message id
 * or an internal tool's search terms, and none of it answers "which site sent
 * them". The path does: a Reddit thread or a specific article is exactly the
 * kind of referrer worth knowing about.
 *
 * A same-origin referrer is dropped too. next.config.js sets
 * `Referrer-Policy: no-referrer`, so our own pages cannot produce one today,
 * but that header is one edit away from changing and this is where the
 * /purchase token would arrive if it did.
 */
export function referrerLabel(rawReferrer: string, currentOrigin: string): string {
  if (!rawReferrer) return '';
  let url: URL;
  try {
    url = new URL(rawReferrer);
  } catch {
    return '';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  if (url.origin === currentOrigin) return '';
  const path = url.pathname === '/' ? '' : url.pathname;
  return clamp(`${url.hostname}${path}`);
}

/**
 * The campaign parameters on the landing URL, compacted into one value.
 *
 * Read off the REDACTED url, not the raw one: redactAnalyticsUrl allows utm_*
 * values through by name, and replaces one that is credential-shaped.
 */
export function utmLabel(rawHref: string): string {
  const safe = redactAnalyticsUrl(rawHref);
  if (!safe) return '';
  try {
    const params = new URL(safe).searchParams;
    const parts: string[] = [];
    for (const key of UTM_KEYS) {
      const value = params.get(key)?.trim();
      if (value) parts.push(`${key.slice(4)}=${value}`);
    }
    return clamp(parts.join('&'));
  } catch {
    return '';
  }
}

/**
 * Records the landing page, once per tab. FIRST WRITE WINS, which is the whole
 * mechanism: this runs on every page in the root layout, so writing every time
 * would overwrite /essays/engineering with / the moment the buyer clicked
 * through, and credit the homepage for a sale the collection page earned.
 *
 * The record is written even when every field comes out empty, so an
 * unreadable first page cannot leave the slot open for the second page to
 * claim.
 */
export function recordLanding(rawHref: string, rawReferrer: string, storage?: StorageLike): void {
  if (!storage) return;
  try {
    if (storage.getItem(LANDING_STORAGE_KEY) !== null) return;
  } catch {
    // Storage disabled. A missing datapoint, never a broken page.
    return;
  }

  let origin = '';
  try {
    origin = new URL(rawHref).origin;
  } catch {
    origin = '';
  }
  const record: LandingRecord = {
    page: pathLabel(rawHref),
    referrer: referrerLabel(rawReferrer, origin),
    utm: utmLabel(rawHref),
  };
  try {
    storage.setItem(LANDING_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Private mode, or a full quota. Same rule: measurement never interrupts.
  }
}

export function readLanding(storage?: StorageLike): LandingRecord | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(LANDING_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LandingRecord>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      page: typeof parsed.page === 'string' ? clamp(parsed.page) : '',
      referrer: typeof parsed.referrer === 'string' ? clamp(parsed.referrer) : '',
      utm: typeof parsed.utm === 'string' ? clamp(parsed.utm) : '',
    };
  } catch {
    return null;
  }
}

/**
 * What /api/checkout is told. `checkoutPage` is the page the buyer pressed
 * Unlock on, which is a different question from where they landed: together
 * they separate "the collection page sold it outright" from "the collection
 * page fed the homepage".
 */
export function visitSource(rawHref: string, storage?: StorageLike): VisitSource {
  const landing = readLanding(storage);
  return {
    landingPage: landing?.page ?? '',
    landingReferrer: landing?.referrer ?? '',
    landingUtm: landing?.utm ?? '',
    checkoutPage: pathLabel(rawHref),
  };
}

/** Browser entry points. Kept separate so every rule above stays testable. */
export function recordBrowserLanding(): void {
  if (typeof window === 'undefined') return;
  let storage: StorageLike | undefined;
  try {
    storage = window.sessionStorage;
  } catch {
    return;
  }
  recordLanding(window.location.href, document.referrer, storage);
}

export function browserVisitSource(): VisitSource {
  if (typeof window === 'undefined') {
    return { landingPage: '', landingReferrer: '', landingUtm: '', checkoutPage: '' };
  }
  let storage: StorageLike | undefined;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = undefined;
  }
  return visitSource(window.location.href, storage);
}
