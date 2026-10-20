'use client';

// What a visitor sees when a page crashes. Shared by app/error.tsx and
// app/global-error.tsx so the two cannot say different things.
//
// The way home is a plain anchor, not a Link. After a crash, a full page load
// is the dependable way back, because it throws away whatever client state
// broke.
export default function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="error-screen">
      <a className="logo" href="/" aria-label="Admitfolio home">
        <span className="logo-word">Admitfolio</span>
        <span className="logo-dot" aria-hidden="true" />
      </a>
      <h1>Something went wrong.</h1>
      <p>This page ran into a problem. Try again, or go back to the homepage.</p>
      <div className="error-screen-actions">
        <a className="btn-primary" href="/">Back to the homepage</a>
        <button className="btn-ghost" type="button" onClick={onRetry}>Try again</button>
      </div>
    </main>
  );
}
