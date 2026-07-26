import 'server-only';
import Stripe from 'stripe';

// Stripe is optional at boot (local dev without keys): routes that need it
// return a friendly 503 instead of crashing the build.
export const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// Re-exported so existing `from '@/lib/stripe'` imports keep working; the
// definition moved to config.ts so email templates can use it too.
export { SITE_URL } from './config';
