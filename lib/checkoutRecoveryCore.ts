export type CheckoutRecoveryCandidate = {
  stripeSessionId: string;
  email: string;
  listingId: string;
  itemLabel: string;
  amountCents: number;
  recoveryUrl: string;
  recoveryExpiresAt: Date;
  sessionCreatedAt: Date;
};

type ExpiredCheckoutSessionLike = {
  id?: unknown;
  status?: unknown;
  created?: unknown;
  amount_total?: unknown;
  currency?: unknown;
  customer_email?: unknown;
  customer_details?: { email?: unknown } | null;
  consent?: { promotions?: unknown } | null;
  after_expiration?: {
    recovery?: {
      enabled?: unknown;
      url?: unknown;
      expires_at?: unknown;
    } | null;
  } | null;
  metadata?: Record<string, string | undefined> | null;
};

export type CheckoutRecoveryParseResult =
  | { ok: true; candidate: CheckoutRecoveryCandidate }
  | { ok: false; reason: string };

function usableEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || !email.includes('@') || /\s/.test(email) || email.length > 254) return null;
  return email;
}

function stripeRecoveryUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const stripeHost = url.hostname === 'stripe.com' || url.hostname.endsWith('.stripe.com');
    return url.protocol === 'https:' && stripeHost ? url.toString() : null;
  } catch {
    return null;
  }
}

// A signed checkout.session.expired event is necessary but not sufficient to
// email someone. Require an explicit Stripe promotions opt-in, a Stripe-hosted
// recovery link, and a complete listing quote before exposing the candidate to
// the email workflow.
export function checkoutRecoveryCandidate(
  session: ExpiredCheckoutSessionLike,
  now = new Date(),
): CheckoutRecoveryParseResult {
  if (session.status !== 'expired') return { ok: false, reason: 'session_not_expired' };
  if (session.consent?.promotions !== 'opt_in') return { ok: false, reason: 'promotions_not_opted_in' };

  const stripeSessionId = typeof session.id === 'string' ? session.id.trim() : '';
  if (!/^cs_(?:test|live)_/.test(stripeSessionId)) {
    return { ok: false, reason: 'invalid_session_id' };
  }

  const email = usableEmail(session.customer_details?.email ?? session.customer_email);
  if (!email) return { ok: false, reason: 'missing_email' };

  const metadata = session.metadata ?? {};
  const listingId = metadata.listingId?.trim() ?? '';
  const itemLabel = metadata.itemLabel?.trim() ?? '';
  if (metadata.purchaseUnit !== 'listing' || !listingId || !itemLabel) {
    return { ok: false, reason: 'invalid_listing_metadata' };
  }

  const amountCents = session.amount_total;
  const currency = typeof session.currency === 'string' ? session.currency.toLowerCase() : '';
  if (!Number.isSafeInteger(amountCents) || (amountCents as number) < 1 || currency !== 'usd') {
    return { ok: false, reason: 'invalid_amount' };
  }

  const recovery = session.after_expiration?.recovery;
  const recoveryUrl = recovery?.enabled === true ? stripeRecoveryUrl(recovery.url) : null;
  const recoveryExpiresAtSeconds = recovery?.expires_at;
  if (
    !recoveryUrl ||
    !Number.isSafeInteger(recoveryExpiresAtSeconds) ||
    (recoveryExpiresAtSeconds as number) * 1000 <= now.getTime()
  ) {
    return { ok: false, reason: 'missing_or_expired_recovery_url' };
  }

  const createdSeconds = session.created;
  if (!Number.isSafeInteger(createdSeconds) || (createdSeconds as number) < 1) {
    return { ok: false, reason: 'invalid_session_created_at' };
  }

  return {
    ok: true,
    candidate: {
      stripeSessionId,
      email,
      listingId,
      itemLabel,
      amountCents: amountCents as number,
      recoveryUrl,
      recoveryExpiresAt: new Date((recoveryExpiresAtSeconds as number) * 1000),
      sessionCreatedAt: new Date((createdSeconds as number) * 1000),
    },
  };
}

export type CheckoutRecoveryResult =
  | { ok: true; status: 'ignored' | 'already_purchased' | 'listing_unavailable' | 'already_sent' | 'sent'; reason?: string }
  | { ok: false; status: 'in_progress' | 'email_failed'; error: string };

export type CheckoutRecoveryDependencies = {
  production: boolean;
  listingAvailable: (candidate: CheckoutRecoveryCandidate) => Promise<boolean>;
  alreadyPurchased: (candidate: CheckoutRecoveryCandidate) => Promise<boolean>;
  claim: (
    candidate: CheckoutRecoveryCandidate,
  ) => Promise<
    | { status: 'claimed'; recoveryId: string }
    | { status: 'sent' }
    | { status: 'busy' }
  >;
  sendEmail: (
    candidate: CheckoutRecoveryCandidate,
    recoveryId: string,
  ) => Promise<{ ok: boolean; simulated?: boolean; status?: number; detail?: string }>;
  markSent: (recoveryId: string) => Promise<void>;
  markFailed: (recoveryId: string, error: string) => Promise<void>;
};

export async function recoverExpiredCheckout(
  session: ExpiredCheckoutSessionLike,
  deps: CheckoutRecoveryDependencies,
  now = new Date(),
): Promise<CheckoutRecoveryResult> {
  const parsed = checkoutRecoveryCandidate(session, now);
  if (!parsed.ok) return { ok: true, status: 'ignored', reason: parsed.reason };
  const candidate = parsed.candidate;

  if (!(await deps.listingAvailable(candidate))) {
    return { ok: true, status: 'listing_unavailable' };
  }
  if (await deps.alreadyPurchased(candidate)) {
    return { ok: true, status: 'already_purchased' };
  }

  const claim = await deps.claim(candidate);
  if (claim.status === 'sent') return { ok: true, status: 'already_sent' };
  if (claim.status === 'busy') {
    return { ok: false, status: 'in_progress', error: 'A recovery email attempt is already running.' };
  }

  let email;
  try {
    email = await deps.sendEmail(candidate, claim.recoveryId);
  } catch (error) {
    email = { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
  const accepted = email.ok && (!deps.production || !email.simulated);
  if (!accepted) {
    const error = email.simulated
      ? 'email provider is not configured in production'
      : email.detail || (email.status ? `email provider returned ${email.status}` : 'email provider rejected delivery');
    await deps.markFailed(claim.recoveryId, error);
    return { ok: false, status: 'email_failed', error };
  }

  await deps.markSent(claim.recoveryId);
  return { ok: true, status: 'sent' };
}
