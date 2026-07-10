'use client';

import { useState } from 'react';

type LogoBadgeProps = {
  domain?: string;
  letter: string;
  color: string;
  school: string;
  size: number;
  fontSize: number;
};

/**
 * Colored monogram badge with an optional real university logo overlay.
 * If the favicon fails to load, the <img> is hidden and the letter shows
 * through - mirrors the original onerror/onload behavior.
 */
export default function LogoBadge({ domain, letter, color, school, size, fontSize }: LogoBadgeProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <div
      className={`badge${loaded ? ' has-logo' : ''}`}
      style={{ width: `${size}px`, height: `${size}px`, background: color, fontSize: `${fontSize}px` }}
    >
      {domain && !errored && (
        <img
          className="badge-logo"
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
          alt={`${school} logo`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
        />
      )}
      {letter}
    </div>
  );
}
