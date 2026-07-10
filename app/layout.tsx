import type { Metadata, Viewport } from 'next';
import './fonts.css';
import './globals.css';

// viewportFit lets the page extend into the notch/home-indicator areas on
// iPhone; safe-area insets in the CSS keep controls clear of them.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FAF8F4',
};

export const metadata: Metadata = {
  title: 'Admitfolio, Read the essays that got them in',
  description:
    'A marketplace of real college admissions essays, written by the students who got accepted. Browse by school and prompt, see why each one worked, and find the angle only you can write.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
