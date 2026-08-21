// Client-safe policy for deciding whether a Vercel Analytics or Speed Insights
// event may leave the browser. Keep this independent from React so the exact
// production-host and internal-traffic rules can be unit tested.

export const INTERNAL_ANALYTICS_STORAGE_KEY = 'admitfolio_analytics_internal';

const PUBLIC_HOSTS = new Set(['admitfolio.com', 'www.admitfolio.com']);

type AnalyticsStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storageCall(action: () => void): void {
  try {
    action();
  } catch {
    // Analytics must never interrupt the product when storage is unavailable.
  }
}

function isInternalPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/{2,}/g, '/').toLowerCase();
  return normalized === '/admin' || normalized.startsWith('/admin/');
}

/**
 * Returns true only for public production traffic that should be reported.
 *
 * Visiting an admin route marks that browser as internal. Team members who do
 * not use the admin can opt out by visiting `/?internal=1`; `/?internal=0`
 * clears the flag. Control-page visits are themselves never reported.
 */
export function shouldSendAnalyticsEvent(rawUrl: string, storage?: AnalyticsStorage): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  const control = url.searchParams.get('internal');
  if (control === '1') {
    if (storage) storageCall(() => storage.setItem(INTERNAL_ANALYTICS_STORAGE_KEY, '1'));
    return false;
  }
  if (control === '0') {
    if (storage) storageCall(() => storage.removeItem(INTERNAL_ANALYTICS_STORAGE_KEY));
    return false;
  }

  if (isInternalPath(url.pathname)) {
    if (storage) storageCall(() => storage.setItem(INTERNAL_ANALYTICS_STORAGE_KEY, '1'));
    return false;
  }

  if (!PUBLIC_HOSTS.has(url.hostname.toLowerCase())) return false;

  if (storage) {
    let optedOut = false;
    storageCall(() => {
      optedOut = storage.getItem(INTERNAL_ANALYTICS_STORAGE_KEY) === '1';
    });
    if (optedOut) return false;
  }

  return true;
}

export function shouldSendBrowserAnalytics(rawUrl: string): boolean {
  if (typeof window === 'undefined') return false;

  let storage: AnalyticsStorage | undefined;
  try {
    storage = window.localStorage;
  } catch {
    storage = undefined;
  }
  return shouldSendAnalyticsEvent(rawUrl, storage);
}
