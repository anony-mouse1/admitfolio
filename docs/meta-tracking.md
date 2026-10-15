# Opt-in Meta purchase tracking

Pixel: `1468782682028598` (Admitfolio Website).

Only the consent popup and its Privacy choices control change the public UI. Existing pages, catalogue, checkout, payment handling, privacy-policy page and styles are unchanged. Popup details disclose the optional data sharing. The older privacy-policy page still says there are no advertising cookies; the user explicitly prohibited other page changes, so reconciling that wording needs separate permission before the ad launch.

Implementation uses Meta's documented image pixel, not third-party JavaScript: https://developers.facebook.com/documentation/meta-pixel/advanced#install-the-pixel-using-an-img-tag . Images are attached to the DOM with no referrer. Only sanitized public paths, advertising cookie IDs, and verified purchase amount/currency/event ID are sent. No email, seller identity, session ID, essay or reading link is sent.

Before consent, after decline, with GPC/DNT or internal-traffic suppression, nothing is sent to Meta. Production hosts are allowlisted. Local/preview hosts show the popup but do not send tracking. Preferences last 180 days; optional ad cookies last 90 days and are cleared on withdrawal.

On the existing purchase success page, a read-only API checks the purchase recorded by the signed Stripe webhook. It never creates a purchase or trusts a browser price. The client waits up to a minute for the webhook. Purchase IDs are stable hashes; an in-flight guard and local storage prevent repeated events in the same browser. Failed image loads can retry on a later visit. This is browser tracking: customers who do not return to the success page, decline, block requests, or leave before the webhook is recorded will not be counted. No CAPI token is needed.

Validation: `node scripts/meta-tracking.test.mjs`, `node scripts/analytics-policy.test.mjs`, `node scripts/embedded-checkout.test.mjs`, `tsc --noEmit`, and direct `next build` (no migrations). The synthetic purchase test mocks the database and image transport, exercises pending/paid/invalid/old orders, price trust, origin/consent/GPC checks, URL privacy, deduplication and delivery retries. It never charges a card or sends a synthetic purchase to Meta. Browser checks on the existing collection page verify both choices persist through reload and can be changed.

No database migrations, backfills, or new secrets are required. Ads must remain off until Fatimah explicitly approves launching them. Reset the seven-day schedule relative to the eventual launch; the saved October 15–22 draft dates are not a promise of seven full days after a later approval.
