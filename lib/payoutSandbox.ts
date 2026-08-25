import 'server-only';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import Stripe from 'stripe';
import { SESSION_SECRET } from './config';
import { isSandboxStripeKey } from './payoutSandboxCore';

export const PAYOUT_SANDBOX_COOKIE = 'admitfolio_payout_sandbox';
const SANDBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PayoutSandboxState = {
  v: 1;
  sessionId: string;
  adminEmail: string;
  createdAt: number;
  exp: number;
  accountId?: string;
  paymentIntentId?: string;
  chargeId?: string;
  transferId?: string;
};

function signature(payload: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

export function newPayoutSandboxState(adminEmail: string): PayoutSandboxState {
  const now = Date.now();
  return {
    v: 1,
    sessionId: crypto.randomUUID(),
    adminEmail: adminEmail.toLowerCase(),
    createdAt: now,
    exp: now + SANDBOX_TTL_MS,
  };
}

export function encodePayoutSandboxState(state: PayoutSandboxState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  return `${payload}.${signature(payload)}`;
}

export async function readPayoutSandboxState(adminEmail: string): Promise<PayoutSandboxState | null> {
  const token = (await cookies()).get(PAYOUT_SANDBOX_COOKIE)?.value;
  if (!token) return null;
  const [payload, supplied] = token.split('.');
  if (!payload || !supplied) return null;
  const expected = signature(payload);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) return null;

  try {
    const state = JSON.parse(Buffer.from(payload, 'base64url').toString()) as PayoutSandboxState;
    if (
      state.v !== 1 ||
      state.adminEmail !== adminEmail.toLowerCase() ||
      typeof state.sessionId !== 'string' ||
      typeof state.exp !== 'number' ||
      Date.now() > state.exp
    ) return null;
    return state;
  } catch {
    return null;
  }
}

export function payoutSandboxCookie(state: PayoutSandboxState) {
  return {
    name: PAYOUT_SANDBOX_COOKIE,
    value: encodePayoutSandboxState(state),
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: Math.floor((state.exp - Date.now()) / 1000),
    },
  };
}

export function payoutSandboxStripe(): Stripe | null {
  const key = process.env.STRIPE_SANDBOX_SECRET_KEY?.trim();
  if (!key) return null;
  if (!isSandboxStripeKey(key)) {
    throw new Error('STRIPE_SANDBOX_SECRET_KEY must be a Stripe test-mode key.');
  }
  return new Stripe(key);
}

export function safeStripeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Stripe could not complete this test step.';
  return message.replace(/sk_(?:live|test)_[A-Za-z0-9_]+/g, '[redacted]').slice(0, 300);
}
