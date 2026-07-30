'use client';

import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { redactAnalyticsUrl, redactAnalyticsPath } from '@/lib/redactAnalyticsUrl';

// Wraps both Vercel analytics components so neither can ship a buyer's reading
// token to Vercel. `beforeSend` is a function prop, which a Server Component
// cannot pass across the boundary - hence this small client component rather
// than wiring it straight into app/layout.tsx.
//
// Keep this the ONLY place <Analytics> and <SpeedInsights> are mounted. A second
// bare mount anywhere would bypass every guard below.
//
// Both callbacks cancel the event (return null) when the URL cannot be
// sanitised, so the failure mode is a missing datapoint rather than a leaked
// credential.
export default function SiteAnalytics() {
  return (
    <>
      <Analytics
        beforeSend={(event) => {
          const url = redactAnalyticsUrl(event.url);
          return url ? { ...event, url } : null;
        }}
      />
      <SpeedInsights
        beforeSend={(event) => {
          const url = redactAnalyticsUrl(event.url);
          if (!url) return null;
          // `route` is a SEPARATE field from `url` and must be scrubbed on its
          // own: spreading the event would carry it through untouched. Vercel's
          // computeRoute() returns the raw pathname whenever the path does not
          // match known params - which is every 404, including a miscased
          // /PURCHASE/<token> - and that value is written straight to
          // script.dataset.route. So on exactly the requests where the URL
          // carries a token, `route` does too.
          return { ...event, url, route: event.route ? redactAnalyticsPath(event.route) : event.route };
        }}
      />
    </>
  );
}
