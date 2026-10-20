import type { Metadata, Viewport } from 'next';
import SiteAnalytics from '@/components/SiteAnalytics';
import VisitSource from '@/components/VisitSource';
import { FONT_STYLESHEET } from '@/lib/fonts';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from '@/lib/site';
import './globals.css';

// viewportFit lets the page extend into the notch/home-indicator areas on
// iPhone; safe-area insets in the CSS keep controls clear of them.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F6F0E7',
};

// Both strings moved to lib/site.ts. They are unchanged, and the move is the
// point: the Organization JSON-LD on the homepage has to publish the same
// description this tag carries, and two copies of a sentence drift.
const homeTitle = SITE_TITLE;
const homeDescription = SITE_DESCRIPTION;

export const metadata: Metadata = {
  // Every other page builds absolute canonical and OpenGraph URLs by hand.
  // metadataBase is what lets a page pass a relative one and still emit an
  // absolute tag, and Next warns on every build without it.
  metadataBase: new URL(SITE_URL),
  title: homeTitle,
  description: homeDescription,
  // The homepage is the most-shared URL on the site and was the only surface
  // without a card: the guides, the collections and the hub all have one, so a
  // link to / was the one that pasted as a bare URL. Declared here rather than
  // in app/page.tsx because that file is a client component and cannot export
  // metadata. Every other route sets its own openGraph and overrides this.
  openGraph: {
    title: homeTitle,
    description: homeDescription,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const buildVersion = process.env.VERCEL_GIT_COMMIT_SHA || 'local';
  return (
    <html lang="en">
      <head>
        <meta name="admitfolio-build" content={buildVersion} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONT_STYLESHEET} />
      </head>
      <body>
        {children}
        {/* Cookieless analytics - exactly what the privacy policy describes.
            Wrapped so buyer reading tokens are stripped from reported URLs. */}
        <SiteAnalytics />
        {/* Records the first page of the session in sessionStorage, so a
            purchase can be credited to the page that earned it. Not a cookie,
            nothing leaves the tab until the buyer starts a checkout. */}
        <VisitSource />
      </body>
    </html>
  );
}
