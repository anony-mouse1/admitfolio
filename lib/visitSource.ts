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

import { looksLikeCredential, redactAnalyticsUrl } from './redactAnalyticsUrl';

export const LANDING_STORAGE_KEY = 'admitfolio:landing';

// Stripe rejects a metadata value over 500 characters, counted in Unicode code
// points (verified against the sandbox: 500 ASCII ok, 501 rejected; 500 emoji
// ok at 2000 bytes, 501 CJK rejected at 1503 bytes). The rejection fails the
// whole sessions.create call, which /api/checkout turns into a 502 the buyer
// reads as "Could not start checkout". The slice below counts code points so it
// can never leave a split surrogate pair behind.
//
// Since the privacy pass, every field is bounded by its own rule before it ever
// reaches this clamp, so the arithmetic is exact rather than a measurement of
// what happened to turn up:
//
//   landingPage       80, MAX_PATH_LENGTH, or 8 for the /[other] bucket.
//   checkoutPage      the same.
//   landingUtm        145. Three keys at a 40 character value each, plus
//                     "source=", "&medium=" and "&campaign=".
//   landingReferrer   253, a hostname's own limit. The path is gone.
//
// So the longest value any of these can now produce is 253, and 400 is a
// backstop that nothing real can reach rather than a margin over a measurement.
// It stays because the client is untrusted: a stale or hostile build can put
// anything in the request body, and an absurd value must truncate rather than
// fail a purchase. There is no aggregate cap to spend: 50 keys at 500
// characters each was accepted.
export const MAX_SOURCE_VALUE = 400;

// The utm parameters worth carrying. source/medium/campaign answer "which
// channel"; utm_content and utm_term are ad-level detail for ads this site
// does not run, and every extra parameter is length spent on the one value.
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;

// What is written in place of a value that is not provably safe. Deliberately
// not "drop the parameter": a redacted campaign still says the visit came from
// a campaign, and losing that would quietly reclassify a campaign visit as
// organic, which is the opposite of what this feature is for.
export const REDACTED = '[redacted]';

/**
 * A campaign value we are willing to copy into Stripe metadata verbatim.
 *
 * utm values are not ours. They are typed by whoever built the link, and email
 * platforms in particular use them as a place to stash a recipient identifier,
 * so `utm_campaign=jane.doe@example.com` and `utm_source=sub_18f2a...` are both
 * things that arrive in the wild. Passing them through would put a third
 * party's personal data into the Stripe Dashboard, where every Dashboard user
 * can read it and nobody expects to find it.
 *
 * So: lowercase alphanumerics, dot, underscore and hyphen, up to 40 characters,
 * and it may not start or end with punctuation. That is the shape of every
 * campaign name anyone actually writes (`newsletter`, `ea-deadline-nov`,
 * `google.com`) and it excludes an email address, because `@` is not in the
 * set. Anything outside it becomes REDACTED rather than being guessed at.
 *
 * Length is doing real work here too. 40 characters cannot hold much, and the
 * credential check below closes the one shape that fits: our signed tokens have
 * a 33 character minimum and would otherwise pass this pattern.
 */
const UTM_SAFE_VALUE = /^[a-z0-9](?:[a-z0-9._-]{0,38}[a-z0-9])?$/;

/**
 * Shapes that fit UTM_SAFE_VALUE but are obviously an identifier rather than a
 * campaign name, and so are redacted anyway.
 *
 * Mail platforms put merge tags in utm_campaign, and what arrives is the
 * expanded value: `sub_18f2a9c4b7e1d0a3f5c8b2e6d9a1f4c7` is 36 lowercase
 * characters that pass the pattern above and identify exactly one recipient.
 * A run of sixteen or more hex characters, or a uuid, is not something anybody
 * names a campaign, so both are treated as identifiers.
 *
 * This is a heuristic and it is neither complete nor exact. It over-redacts a
 * campaign name of 16 or more characters drawn only from a-f and 0-9, which is
 * the safe direction to be wrong in, and it under-redacts an opaque id that
 * happens to use the full alphabet, say `k7mqx2vplzrt9wnd`, which is
 * indistinguishable from a short campaign slug. Length is all that bounds the
 * second case.
 */
const IDENTIFIER_SHAPES = [
  /[0-9a-f]{16,}/,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
];

function looksLikeIdentifier(value: string): boolean {
  return IDENTIFIER_SHAPES.some((shape) => shape.test(value));
}

/**
 * A path segment on one of our own URLs.
 *
 * Our routes are lowercase kebab-case, and the redactor above has already
 * replaced anything credential-shaped with a `[token]` style bucket, so both
 * shapes are allowed and nothing else is. The bound matters because a landing
 * page is whatever URL the visitor arrived on, and a 404 on our own domain
 * renders inside the root layout where the landing is recorded. Without this,
 * `admitfolio.com/<anything someone chose to put here>` would be copied into
 * Stripe metadata as a landing page.
 *
 * This is a bound, not a proof. A lowercase hyphenated 404 path still gets
 * through, and closing that completely means checking the path against the
 * route registries, which would pull lib/collections.ts and lib/guides.ts into
 * the bundle of every page on the site, because this records on every route.
 * That cost is not worth the remaining sliver, but the sliver is real and is
 * written down here rather than left for someone to rediscover.
 */
const SAFE_PATH_SEGMENT = /^(?:\[[a-z]+\]|[a-z0-9]+(?:-[a-z0-9]+)*)$/;

// Three segments and 80 characters. The longest public route is
// /guides/how-to-take-inspiration-from-college-essays at 51 characters and two
// segments, so this is headroom rather than a limit anything real reaches.
const MAX_PATH_SEGMENTS = 3;
const MAX_PATH_LENGTH = 80;

// What an unrecognised path becomes. Visibly a bucket in the Dashboard, so a
// route added later that somehow fails the shape shows up as this rather than
// silently disappearing.
export const OTHER_PATH = '/[other]';

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
  let pathname: string;
  try {
    pathname = new URL(safe).pathname;
  } catch {
    return '';
  }
  return safePath(pathname);
}

/**
 * A pathname bounded to the shape our own routes have, or OTHER_PATH.
 *
 * See SAFE_PATH_SEGMENT for why this exists and what it does not cover.
 */
export function safePath(pathname: string): string {
  const collapsed = pathname.replace(/\/{2,}/g, '/');
  const trimmed = collapsed.length > 1 ? collapsed.replace(/\/$/, '') : collapsed;
  if (trimmed === '/' || trimmed === '') return '/';
  if (trimmed.length > MAX_PATH_LENGTH) return OTHER_PATH;
  const segments = trimmed.split('/').slice(1);
  if (segments.length > MAX_PATH_SEGMENTS) return OTHER_PATH;
  if (!segments.every((segment) => SAFE_PATH_SEGMENT.test(segment))) return OTHER_PATH;
  return trimmed;
}

/**
 * The site that sent them. The HOST, and nothing else.
 *
 * This used to be host plus path, on the argument that a specific Reddit
 * thread or article is the referrer worth knowing about. That argument was
 * wrong about what a referrer path actually contains. It is a URL on somebody
 * else's site, chosen by them, and the paths that show up in practice include
 * webmail (`mail.example.com/mail/u/0/inbox/...`), shared documents
 * (`docs.example.com/document/d/<id>`), company intranets and private group
 * chats. None of that is ours to copy into the Stripe Dashboard, where every
 * Dashboard user can read it, and no consent anyone gave us covers it.
 *
 * The host answers the question this feature exists to answer. "reddit.com
 * sent them" is which channel earned the sale; which thread is a detail we do
 * not need badly enough to take everything else that comes with it. The query
 * and the hash were already dropped and remain dropped.
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
  return clamp(url.hostname.toLowerCase());
}

/**
 * The campaign parameters on the landing URL, compacted into one value.
 *
 * Read off the redacted url, not the raw one: redactAnalyticsUrl allows utm_*
 * values through by name, and replaces one that is credential-shaped. That is
 * necessary and not sufficient. A credential has a recognisable shape; a
 * recipient's email address in `utm_campaign` does not, and used to pass
 * straight through to Stripe. Every value is now checked against
 * UTM_SAFE_VALUE and becomes REDACTED if it does not fit.
 *
 * The parameter is still listed when its value is redacted, because the fact
 * that a campaign brought this buyer is itself the attribution, and dropping
 * the key would file the visit as organic.
 */
export function utmLabel(rawHref: string): string {
  const safe = redactAnalyticsUrl(rawHref);
  if (!safe) return '';
  try {
    const params = new URL(safe).searchParams;
    const parts: string[] = [];
    for (const key of UTM_KEYS) {
      const raw = params.get(key)?.trim();
      if (!raw) continue;
      const value = raw.toLowerCase();
      const safe = UTM_SAFE_VALUE.test(value) && !looksLikeCredential(value) && !looksLikeIdentifier(value);
      parts.push(`${key.slice(4)}=${safe ? value : REDACTED}`);
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
