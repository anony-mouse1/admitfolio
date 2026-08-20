export const PAYOUT_SANDBOX_GROSS_CENTS = 18_400;
export const PAYOUT_SANDBOX_SELLER_CENTS = 11_040;
export const PAYOUT_SANDBOX_PLATFORM_CENTS = 7_360;

export type SandboxCapabilityStatus =
  | 'active'
  | 'pending'
  | 'restricted'
  | 'unsupported'
  | 'not_requested';

export type SandboxAccountSnapshot = {
  livemode: boolean;
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          stripe_transfers?: { status?: SandboxCapabilityStatus };
          payouts?: { status?: SandboxCapabilityStatus };
        };
      };
    };
  };
};

export function sandboxAccountStatus(account: SandboxAccountSnapshot | null): {
  status: 'setup_required' | 'verification_in_progress' | 'ready' | 'restricted';
  transfers: SandboxCapabilityStatus;
  payouts: SandboxCapabilityStatus;
} {
  if (!account) {
    return { status: 'setup_required', transfers: 'not_requested', payouts: 'not_requested' };
  }
  if (account.livemode) throw new Error('The payout sandbox cannot use a live Stripe account.');

  const balance = account.configuration?.recipient?.capabilities?.stripe_balance;
  const transfers = balance?.stripe_transfers?.status || 'not_requested';
  const payouts = balance?.payouts?.status || 'not_requested';
  if (transfers === 'active' && payouts === 'active') {
    return { status: 'ready', transfers, payouts };
  }
  if (transfers === 'restricted' || transfers === 'unsupported' || payouts === 'restricted') {
    return { status: 'restricted', transfers, payouts };
  }
  return { status: 'verification_in_progress', transfers, payouts };
}

export function sandboxIdempotencyKey(sessionId: string, action: 'account' | 'sale' | 'transfer') {
  if (!/^[a-f0-9-]{36}$/i.test(sessionId)) throw new Error('Invalid payout sandbox session.');
  return `admitfolio-payout-sandbox-${action}-${sessionId}`;
}

export function isSandboxStripeKey(key: string): boolean {
  return key.startsWith('sk_test_') || key.startsWith('rk_test_');
}
