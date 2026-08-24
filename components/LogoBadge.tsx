'use client';

import { useState } from 'react';
import { schoolLogoSrc } from '@/lib/schoolLogos';

// Existing callers import this name from LogoBadge. Keep that API while the
// source of truth lives in the shared server-safe helper.
export { universityLogoSrc } from '@/lib/schoolLogos';

type LogoBadgeProps = {
  domain?: string;
  letter: string;
  color: string;
  school: string;
  size: number;
  fontSize: number;
};

/**
 * Self-hosted university mark with a deterministic monogram fallback.
 * Unsupported schools and failed local assets keep the letter badge. No
 * browser request is ever made to Wikimedia, a university CDN, or a favicon
 * service.
 */
export default function LogoBadge({ domain, letter, color, school, size, fontSize }: LogoBadgeProps) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [erroredSrc, setErroredSrc] = useState<string | null>(null);
  const logoSrc = schoolLogoSrc(domain);
  const loaded = !!logoSrc && loadedSrc === logoSrc;
  const errored = !!logoSrc && erroredSrc === logoSrc;

  return (
    <div
      className={`badge${loaded ? ' has-logo' : ''}`}
      style={{ width: `${size}px`, height: `${size}px`, background: color, fontSize: `${fontSize}px` }}
    >
      {logoSrc && !errored && (
        <img
          className={`badge-logo badge-logo-hires${domain === 'binghamton.edu' ? ' badge-logo-binghamton' : ''}`}
          src={logoSrc}
          alt={`${school} logo`}
          loading="lazy"
          onLoad={() => setLoadedSrc(logoSrc)}
          onError={() => setErroredSrc(logoSrc)}
        />
      )}
      {letter}
    </div>
  );
}
