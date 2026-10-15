// Only explicitly selected fields can leave the site. No Meta JavaScript runs
// on pages containing buyer email addresses, reading tokens, or essay text.
export const META_PIXEL_ID = '1468782682028598';
export const META_CONSENT_COOKIE = 'admitfolio_meta_consent';
export const META_CONSENT_VERSION = 'v1';
export type MetaPurchase = { eventId: string; value: number; currency: string };

export function publicMetaPath(path: string): boolean {
  return path === '/' || /^\/(essays|guides)(\/[a-z0-9-]+)?$/.test(path)
    || /^\/listings\/[a-z0-9-]+$/.test(path);
}

export function validMetaPurchase(value: unknown): value is MetaPurchase {
  if (!value || typeof value !== 'object') return false;
  const p = value as MetaPurchase;
  return /^purchase_[a-f0-9]{64}$/.test(p.eventId)
    && Number.isFinite(p.value) && p.value > 0 && /^[A-Z]{3}$/.test(p.currency);
}

export function metaPixelUrl(input: {
  origin: string; path: string; fbp?: string; fbc?: string; purchase?: MetaPurchase;
}): string | null {
  if (!['https://admitfolio.com', 'https://www.admitfolio.com'].includes(input.origin)) return null;
  if (input.purchase ? !validMetaPurchase(input.purchase) || input.path !== '/purchase/success' : !publicMetaPath(input.path)) return null;
  const url = new URL('https://www.facebook.com/tr');
  url.searchParams.set('id', META_PIXEL_ID);
  url.searchParams.set('ev', input.purchase ? 'Purchase' : 'PageView');
  url.searchParams.set('dl', input.origin + input.path);
  url.searchParams.set('noscript', '1');
  if (input.fbp && /^fb\.1\.\d{13}\.\d{1,20}$/.test(input.fbp)) url.searchParams.set('fbp', input.fbp);
  if (input.fbc && /^fb\.1\.\d{13}\.[A-Za-z0-9_-]{1,500}$/.test(input.fbc)) url.searchParams.set('fbc', input.fbc);
  if (input.purchase) {
    url.searchParams.set('eid', input.purchase.eventId);
    url.searchParams.set('cd[value]', String(input.purchase.value));
    url.searchParams.set('cd[currency]', input.purchase.currency);
  }
  return url.toString();
}

export function purchaseForMeta(purchase: {
  stripeSessionId: string | null; grossAmountCents: number | null;
  amount: number; currency: string | null; createdAt: Date;
} | null, sessionId: string, eventId: string, now = Date.now()): MetaPurchase | null {
  // Only a purchase recorded by the signed payment webhook qualifies. A
  // success-page visit or a browser-supplied amount is never payment proof.
  if (!purchase || !/^cs_live_[A-Za-z0-9]+$/.test(sessionId) || purchase.stripeSessionId !== sessionId) return null;
  const age = now - purchase.createdAt.getTime();
  if (age < 0 || age > 7 * 86400_000) return null;
  const cents = purchase.grossAmountCents ?? purchase.amount * 100;
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  const result = { eventId, value: cents / 100, currency: (purchase.currency || 'usd').toUpperCase() };
  return validMetaPurchase(result) ? result : null;
}
