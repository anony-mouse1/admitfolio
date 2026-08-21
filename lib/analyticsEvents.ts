'use client';

import { track } from '@vercel/analytics';
import { shouldSendBrowserAnalytics } from './analyticsPolicy';
export { ANALYTICS_EVENTS } from './analyticsEventNames';

type EventValue = string | number | boolean | null;
type EventData = Record<string, EventValue>;

/**
 * Sends a privacy-safe conversion event only from public production traffic.
 * Vercel Pro accepts at most two custom properties, so callers must keep data
 * compact and must never pass emails, queries, listing IDs, or access tokens.
 */
export function trackConversion(name: string, data?: EventData): void {
  if (typeof window === 'undefined' || !shouldSendBrowserAnalytics(window.location.href)) return;

  try {
    if (data) track(name, data);
    else track(name);
  } catch {
    // Measurement must never interrupt browsing, signup, or checkout.
  }
}
