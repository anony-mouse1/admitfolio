'use client';

import ErrorScreen from '@/components/ErrorScreen';

// A crash in any page below the root layout. Without this file the visitor got
// a blank screen. The root layout still renders around it, so the site's fonts
// and styles are already here.
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen onRetry={retry} />;
}
