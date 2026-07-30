// Strips credentials out of a URL before it is handed to a third-party
// analytics sink.
//
// Buyer reading links are `/purchase/<accessToken>`, so the credential is the
// path segment itself. That token is an HMAC bearer credential valid for a year
// (lib/accessToken.ts) and it alone authorises /api/essay/<id>, so anything that
// can read it can read that buyer's essays. Worse, those reads would be logged
// against the original buyer, quietly corrupting the attribution that per-buyer
// watermarking exists to provide.
//
// DESIGN: this rebuilds a known-good URL rather than pattern-matching known-bad
// ones. An earlier version matched `^/purchase/<one segment>` plus three exact
// query names and passed everything else through verbatim; adversarial testing
// leaked the token 37 ways, because a denylist only covers the shapes its author
// thought of. Every rule below is therefore "keep what is provably safe, redact
// the rest".
//
// This runs client-side (analytics beforeSend), so it must not import
// 'server-only' or touch anything Node-specific.

// Query params whose VALUES are safe to report. Anything not listed has its
// value replaced - including params that do not exist yet. Keep this list to
// genuine analytics facets (see app/page.tsx and app/admin/page.tsx).
const SAFE_QUERY_PARAMS = new Set(['layout', 'bg', 'login', 'preview']);

// Sub-paths of /purchase that are ordinary pages rather than credentials.
// Compared case-insensitively. Anything else under /purchase - at ANY depth -
// is treated as a token.
const PUBLIC_PURCHASE_SEGMENTS = new Set(['success']);

// This app's signed tokens are all "<base64url>.<base64url>" (accessToken,
// uploadToken, emailToken, session). Matching the shape rather than the route
// catches a token wherever it turns up, including routes added later.
const CREDENTIAL_SHAPE = /^[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}$/;

function looksLikeCredential(value: string): boolean {
  if (CREDENTIAL_SHAPE.test(value)) return true;
  try {
    const decoded = decodeURIComponent(value);
    // A segment that decodes to something containing a separator is smuggling
    // structure past the parser (e.g. `purchase%2F<token>` is one segment to
    // URL, two to the server). Never let that through intact.
    if (decoded !== value && (CREDENTIAL_SHAPE.test(decoded) || /[/?#]/.test(decoded))) {
      return true;
    }
  } catch {
    // Malformed percent-escape - unparseable means uncheckable.
    return true;
  }
  return false;
}

/**
 * Returns a safe-to-send URL, or `null` if it could not be sanitised with
 * confidence - callers must cancel the event rather than send it.
 *
 * Also suitable for scrubbing SpeedInsights' `route`, which is a bare pathname
 * on 404s; pass it through `redactAnalyticsPath`.
 */
export function redactAnalyticsUrl(raw: string): string | null {
  try {
    const url = new URL(raw);

    // "Parseable" is not "checkable": data:, blob:, javascript: and custom
    // schemes have an opaque path that assigning to .pathname silently no-ops.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    // Credential-shaped fields we never want to report at all.
    url.username = '';
    url.password = '';
    url.hash = '';

    url.pathname = redactPathname(url.pathname);

    for (const key of [...url.searchParams.keys()]) {
      const name = key.trim().toLowerCase();
      // The token can be the param NAME (`?<token>` with no value), in which
      // case rewriting the value would leave it in place.
      if (looksLikeCredential(key)) {
        url.searchParams.delete(key);
        continue;
      }
      const allowed = SAFE_QUERY_PARAMS.has(name) || name.startsWith('utm_');
      if (!allowed) {
        url.searchParams.set(key, '[redacted]');
      } else if (url.searchParams.getAll(key).some(looksLikeCredential)) {
        // Allowlisted name carrying a credential-shaped value.
        url.searchParams.set(key, '[redacted]');
      }
    }

    return url.toString();
  } catch {
    // Includes unparseable input. Fail closed.
    return null;
  }
}

/**
 * Redacts a bare pathname. Exported because SpeedInsights reports `route`
 * separately from `url`, and on a route it cannot match (any 404 - including a
 * miscased /PURCHASE/<token>) it returns the raw pathname.
 */
export function redactAnalyticsPath(pathname: string): string {
  try {
    return redactPathname(pathname);
  } catch {
    return '/[redacted]';
  }
}

function redactPathname(pathname: string): string {
  // Collapse repeated slashes first. `//purchase/<token>` and
  // `/purchase//<token>` otherwise shift the segment indexes and slip past the
  // "under /purchase" rule; a proxy or a retyped link can produce either.
  const segments = pathname.replace(/\/{2,}/g, '/').split('/');
  // Next.js routing is case-sensitive, so /PURCHASE/<token> 404s - but the 404
  // still renders inside the root layout, which mounts analytics. Compare
  // case-insensitively so the miscased form is redacted too.
  const underPurchase = (segments[1] || '').toLowerCase() === 'purchase';

  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment) continue;

    if (looksLikeCredential(segment)) {
      segments[i] = '[token]';
      continue;
    }
    // Everything below /purchase that is not explicitly public is assumed to be
    // a credential, at any depth. This over-redacts an unknown sub-path rather
    // than risk shipping one that carries a token.
    if (underPurchase && i >= 2 && !PUBLIC_PURCHASE_SEGMENTS.has(segment.toLowerCase())) {
      segments[i] = '[token]';
    }
  }

  return segments.join('/');
}
