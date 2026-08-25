import type { Metadata, Viewport } from 'next';
import SiteAnalytics from '@/components/SiteAnalytics';
import './globals.css';

const fontStylesheet =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..800;1,9..144,400..800&family=Spectral:ital,wght@0,400;0,500;0,600;0,700;0,800;1,600&family=Geist:wght@400;500;600;700&family=Inter:wght@400..900&family=Manrope:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Inter+Tight:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,600&family=Source+Sans+3:wght@400;500;600;700&family=Schibsted+Grotesk:wght@400;500;600;700&display=swap';

// viewportFit lets the page extend into the notch/home-indicator areas on
// iPhone; safe-area insets in the CSS keep controls clear of them.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F6F0E7',
};

export const metadata: Metadata = {
  title: 'Admitfolio, Read the essays that got them in',
  description:
    'A marketplace of real college admissions essays, written by the students who got accepted. Browse by school and prompt, see why each one worked, and find the angle only you can write.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const buildVersion = process.env.VERCEL_GIT_COMMIT_SHA || 'local';
  return (
    <html lang="en">
      <head>
        <meta name="admitfolio-build" content={buildVersion} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={fontStylesheet} />
      </head>
      <body>
        {children}
        {/* Cookieless analytics - exactly what the privacy policy describes.
            Wrapped so buyer reading tokens are stripped from reported URLs. */}
        <SiteAnalytics />
      </body>
    </html>
  );
}
