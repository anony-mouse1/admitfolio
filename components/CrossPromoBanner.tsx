'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  CROSS_PROMO_COPY,
  CROSS_PROMO_DISMISS_KEY,
  crossPromoBannerAllowed,
  crossPromoUrl,
} from '@/lib/crossPromo';

// Site-wide bottom banner for the Fatimah's Guide cross-promotion. Mounted once
// in app/layout.tsx. See lib/crossPromo.ts for the links and the copy.
//
// While it shows, <html> carries `fg-promo-on` and `--fg-promo-h`, the banner's
// measured height. globals.css pads the page by that much and lifts the other
// bottom-docked controls above it, so it never hides content. The height is
// measured rather than fixed because the phone line can wrap to two lines.
//
// It renders nothing on the server and on the first client pass, so a visitor
// who dismissed it never sees it flash in before localStorage is read.
export default function CrossPromoBanner() {
  const pathname = usePathname() || '/';
  const allowed = crossPromoBannerAllowed(pathname);
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  // True while an inline cross-promo card is on screen: the same ask twice in
  // one view is noise, so the banner steps aside and comes back once the card
  // has scrolled out.
  const [cardInView, setCardInView] = useState(false);
  const bar = useRef<HTMLElement>(null);

  useEffect(() => {
    let stored = false;
    try { stored = window.localStorage.getItem(CROSS_PROMO_DISMISS_KEY) === '1'; } catch { stored = false; }
    setDismissed(stored);
  }, []);

  const showing = allowed && dismissed === false;

  useEffect(() => {
    if (!showing) return;
    setCardInView(false);
    const cards = document.querySelectorAll('[data-cross-promo-card]');
    if (!cards.length || typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      setCardInView(visible.size > 0);
    });
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [showing, pathname]);

  useEffect(() => {
    const root = document.documentElement;
    const node = bar.current;
    if (!showing || !node) return;
    const measure = () => root.style.setProperty('--fg-promo-h', `${Math.ceil(node.getBoundingClientRect().height)}px`);
    measure();
    root.classList.add('fg-promo-on');
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    return () => {
      observer?.disconnect();
      root.classList.remove('fg-promo-on');
      root.style.removeProperty('--fg-promo-h');
    };
  }, [showing]);

  if (!showing) return null;

  const dismiss = () => {
    try { window.localStorage.setItem(CROSS_PROMO_DISMISS_KEY, '1'); } catch { /* still hidden for this visit */ }
    setDismissed(true);
  };
  const { bannerLong, bannerShort } = CROSS_PROMO_COPY;

  return (
    <aside
      ref={bar}
      className="fg-promo"
      data-suspended={cardInView ? 'true' : 'false'}
      aria-label="Free call with Fatimah's Guide"
    >
      <a href={crossPromoUrl('banner')} target="_blank" rel="noopener">
        <span className="fg-promo-long">
          {bannerLong.lead}<b>{bannerLong.emphasis}</b>{bannerLong.tail}
        </span>
        <span className="fg-promo-short">
          {bannerShort.lead}<b>{bannerShort.emphasis}</b>{bannerShort.tail}
        </span>
        <span className="fg-promo-arrow" aria-hidden="true">→</span>
      </a>
      <button className="fg-promo-x" type="button" aria-label="Dismiss" onClick={dismiss}>&times;</button>
    </aside>
  );
}
