export type FulfillmentStatus =
  | 'fulfilled'
  | 'already_fulfilled'
  | 'in_progress'
  | 'email_failed'
  | 'invalid';

export type FulfillmentInput = {
  purchaseId: string;
  listingId: string;
  buyerEmail: string;
  buyerIp: string | null;
  itemLabel: string;
  amountCents: number;
};

export type FulfillmentResult = {
  ok: boolean;
  status: FulfillmentStatus;
  fingerprint?: string;
  accessUrl?: string;
  email?: { ok: boolean; simulated?: boolean; status?: number; detail?: string };
  alreadyFulfilled?: boolean;
  error?: string;
};

export type FulfillmentCoreDeps = {
  fingerprint: (purchaseId: string, buyerEmail: string) => string;
  accessUrl: (purchaseId: string) => string;
  claim: (
    purchaseId: string,
    fingerprint: string,
  ) => Promise<'claimed' | 'sent' | 'busy' | 'missing' | 'purchase_mismatch' | 'fingerprint_mismatch'>;
  sendEmail: (input: FulfillmentInput, fingerprint: string, accessUrl: string) => Promise<{
    ok: boolean;
    simulated?: boolean;
    status?: number;
    detail?: string;
  }>;
  markSent: (purchaseId: string, fingerprint: string) => Promise<void>;
  markFailed: (purchaseId: string, fingerprint: string, error: string) => Promise<void>;
  production: boolean;
};

function validate(input: FulfillmentInput): string | null {
  if (!input.purchaseId.trim()) return 'purchaseId is required';
  if (!input.listingId.trim()) return 'listingId is required';
  if (!input.buyerEmail.trim() || !input.buyerEmail.includes('@')) return 'buyerEmail is invalid';
  if (!input.itemLabel.trim()) return 'itemLabel is required';
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0) return 'amountCents is invalid';
  return null;
}

export async function fulfillPurchaseCore(
  input: FulfillmentInput,
  deps: FulfillmentCoreDeps,
): Promise<FulfillmentResult> {
  const invalid = validate(input);
  if (invalid) return { ok: false, status: 'invalid', error: invalid };

  const fingerprint = deps.fingerprint(input.purchaseId, input.buyerEmail);
  const accessUrl = deps.accessUrl(input.purchaseId);
  const claim = await deps.claim(input.purchaseId, fingerprint);

  if (claim === 'sent') {
    return { ok: true, status: 'already_fulfilled', fingerprint, accessUrl, alreadyFulfilled: true };
  }
  if (claim === 'busy') {
    // Keep the webhook retry alive. The active attempt may still succeed, but
    // if it crashes after claiming the lease Stripe must come back after the
    // lease expires instead of treating the purchase as permanently handled.
    return {
      ok: false,
      status: 'in_progress',
      fingerprint,
      accessUrl,
      error: 'delivery is already in progress',
    };
  }
  if (claim === 'missing') {
    return { ok: false, status: 'invalid', fingerprint, error: 'purchase does not exist' };
  }
  if (claim === 'purchase_mismatch') {
    return { ok: false, status: 'invalid', fingerprint, error: 'fulfillment input does not match the stored purchase' };
  }
  if (claim === 'fingerprint_mismatch') {
    return { ok: false, status: 'invalid', fingerprint, error: 'purchase identity does not match its delivery fingerprint' };
  }

  let email;
  try {
    email = await deps.sendEmail(input, fingerprint, accessUrl);
  } catch (error) {
    email = { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }

  // A missing production email key must not turn into a permanently completed
  // delivery. Local tests/dev may deliberately simulate delivery.
  const accepted = email.ok && (!deps.production || !email.simulated);
  if (!accepted) {
    const detail = email.simulated
      ? 'email provider is not configured in production'
      : email.detail || (email.status ? `email provider returned ${email.status}` : 'email provider rejected delivery');
    await deps.markFailed(input.purchaseId, fingerprint, detail);
    return { ok: false, status: 'email_failed', fingerprint, accessUrl, email, error: detail };
  }

  await deps.markSent(input.purchaseId, fingerprint);
  return { ok: true, status: 'fulfilled', fingerprint, accessUrl, email };
}
