'use client';

import ErrorScreen from '@/components/ErrorScreen';
import { FONT_STYLESHEET } from '@/lib/fonts';
import './globals.css';

// A crash in the root layout itself. This replaces the layout entirely, so it
// brings its own document, stylesheet and fonts, and a title in place of the
// metadata a client component cannot export.
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <head>
        <title>Something went wrong | Admitfolio</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONT_STYLESHEET} />
      </head>
      <body>
        <ErrorScreen onRetry={retry} />
      </body>
    </html>
  );
}
