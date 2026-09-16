'use client';

import { useEffect } from 'react';
import { recordBrowserLanding } from '@/lib/visitSource';

// Records the first page of the session, once per tab, so /api/checkout can
// tell Stripe which page earned the sale. Renders nothing.
//
// Mounted in app/layout.tsx rather than in either checkout surface, because by
// the time the buyer reaches checkout the landing page is long gone. This is
// the one client component on every route: the homepage, the collections hub,
// the six collection pages, the seven guides and the legal pages.
//
// Kept out of components/SiteAnalytics.tsx deliberately. That file's job is to
// be the only place <Analytics> and <SpeedInsights> are mounted, and a second
// concern living inside it makes that rule harder to see.
export default function VisitSource() {
  useEffect(() => {
    recordBrowserLanding();
  }, []);
  return null;
}
