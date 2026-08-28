import 'server-only';
import Stripe from 'stripe';

// Stripe is optional at boot (local dev without keys): routes that need it
// return a friendly 503 instead of crashing the build.
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-07-29.dahlia' })
  : null;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
// Stripe issues a separate signing secret for a webhook configured to receive
// events from connected accounts. Do not reuse the ordinary checkout secret.
export const STRIPE_CONNECT_WEBHOOK_SECRET = process.env.STRIPE_CONNECT_WEBHOOK_SECRET || '';
// Stripe gives each event destination its own signing secret. The v2 account
// destination above cannot verify snapshot events sent on behalf of connected
// accounts, including bank payout events.
export const STRIPE_CONNECT_SNAPSHOT_WEBHOOK_SECRET =
  process.env.STRIPE_CONNECT_SNAPSHOT_WEBHOOK_SECRET || '';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://admitfolio.com').replace(/\/$/, '');
