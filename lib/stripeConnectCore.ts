export type StripeConnectErrorDetails = {
  message: string;
  code: string | null;
  type: string | null;
  requestId: string | null;
  statusCode: number | null;
};

type StripeLikeError = {
  message?: unknown;
  code?: unknown;
  type?: unknown;
  requestId?: unknown;
  statusCode?: unknown;
  raw?: {
    message?: unknown;
    code?: unknown;
    type?: unknown;
    requestId?: unknown;
    statusCode?: unknown;
  };
};

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function statusValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function stripeConnectErrorDetails(error: unknown): StripeConnectErrorDetails {
  const candidate = error && typeof error === 'object' ? error as StripeLikeError : {};
  const raw = candidate.raw || {};
  return {
    message:
      stringValue(candidate.message) ||
      stringValue(raw.message) ||
      'Stripe Connect request failed.',
    code: stringValue(candidate.code) || stringValue(raw.code),
    type: stringValue(candidate.type) || stringValue(raw.type),
    requestId: stringValue(candidate.requestId) || stringValue(raw.requestId),
    statusCode: statusValue(candidate.statusCode) || statusValue(raw.statusCode),
  };
}

export function sellerFacingConnectError(error: unknown): {
  code: 'platform_not_ready' | 'stripe_unavailable';
  message: string;
  status: 502 | 503;
} {
  const details = stripeConnectErrorDetails(error);
  const normalized = `${details.code || ''} ${details.message}`.toLowerCase();
  if (
    details.code === 'account_create_activation_required' ||
    normalized.includes('must be activated') ||
    normalized.includes('signed up for connect') ||
    normalized.includes('sign up for connect') ||
    normalized.includes('platform profile')
  ) {
    return {
      code: 'platform_not_ready',
      message: 'Payout setup is temporarily unavailable while Admitfolio finishes Stripe activation. Your earnings are safe. Please try again shortly.',
      status: 503,
    };
  }
  return {
    code: 'stripe_unavailable',
    message: 'Stripe could not open payout setup right now. Your earnings are safe. Please try again in a few minutes.',
    status: details.statusCode && details.statusCode >= 500 ? 503 : 502,
  };
}
