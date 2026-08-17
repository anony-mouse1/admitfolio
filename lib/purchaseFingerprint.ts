import crypto from 'node:crypto';

// A buyer's identity and IP must never be printed into the copy itself. The
// document carries only this keyed, non-reversible purchase code. Support can
// look the code up on Purchase and reach the buyer/IP audit trail server-side.
const FINGERPRINT_DOMAIN = 'admitfolio:purchase-fingerprint:v1';

export function normalizeBuyerEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function makePurchaseFingerprint(
  purchaseId: string,
  buyerEmail: string,
  secret: string,
): string {
  if (!purchaseId.trim()) throw new Error('purchaseId is required');
  if (!normalizeBuyerEmail(buyerEmail)) throw new Error('buyerEmail is required');
  if (secret.length < 16) throw new Error('fingerprint secret must be at least 16 characters');

  const digest = crypto
    .createHmac('sha256', secret)
    .update(FINGERPRINT_DOMAIN)
    .update('\0')
    .update(purchaseId)
    .update('\0')
    .update(normalizeBuyerEmail(buyerEmail))
    .digest('hex')
    .slice(0, 20)
    .toUpperCase();

  return `AF-${digest.match(/.{1,4}/g)!.join('-')}`;
}
