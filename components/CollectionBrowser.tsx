'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import ListingDetail from '@/components/ListingDetail';
import type { PublicListing } from '@/lib/publicListing';

// Opens a listing in place on a collection page.
//
// The cards inside `children` are server-rendered anchors, so a crawler follows
// a real href and so does anyone opening in a new tab. For everyone else this
// intercepts the click and shows the sheet without navigating at all, which is
// what removes the homepage flash: before this, a click left the collection
// page, painted the whole homepage, and only swapped in the sheet once the
// client fetch of /api/listings came back.
//
// Because there is no navigation, Back is a plain popstate: the sheet closes
// and the collection page is still underneath, at the same scroll position.
//
// Checkout is deliberately still a real navigation. openBuy in app/page.tsx
// builds its URL as /?checkout=<id> and the whole purchase flow lives on the
// homepage; duplicating it here would fork the payment path, which is not worth
// it for a step the buyer expects to change pages.

type Props = {
  /** Without otherListingIds: see the note in app/essays/[collection]/page.tsx. */
  listings: Omit<PublicListing, 'otherListingIds'>[];
  /** The collection's own path, e.g. /essays/biology. Never carries the query. */
  basePath: string;
  /** From ?listing= on the server, already checked against this collection. */
  initialListingId: string | null;
  children: ReactNode;
};

export default function CollectionBrowser({ listings, basePath, initialListingId, children }: Props) {
  const [openId, setOpenId] = useState<string | null>(initialListingId);
  // True once this component pushed a history entry, which decides whether
  // closing should pop that entry or replace the URL in place. A visitor who
  // arrived on ?listing= directly has nothing of ours to pop.
  const pushedRef = useRef(false);

  const open = useCallback((id: string) => {
    setOpenId(id);
    window.history.pushState({ collectionListing: id }, '', `${basePath}?listing=${encodeURIComponent(id)}`);
    pushedRef.current = true;
  }, [basePath]);

  const close = useCallback(() => {
    if (pushedRef.current) {
      // Pop our own entry so Back and the close button agree, and so the
      // collection page is restored rather than stacked on top of itself.
      pushedRef.current = false;
      window.history.back();
      return;
    }
    setOpenId(null);
    window.history.replaceState({}, '', basePath);
  }, [basePath]);

  // Swap to a sibling listing without stacking history: one Back from anywhere
  // in the sheet returns to the collection, not through every listing viewed.
  const swap = useCallback((id: string) => {
    setOpenId(id);
    window.history.replaceState({ collectionListing: id }, '', `${basePath}?listing=${encodeURIComponent(id)}`);
  }, [basePath]);

  useEffect(() => {
    function onPop() {
      const id = new URLSearchParams(window.location.search).get('listing');
      pushedRef.current = false;
      setOpenId(id && listings.some((l) => l.id === id) ? id : null);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [listings]);

  // Plain left clicks only. A modifier click, a middle click or a right click
  // must keep doing what the browser does with an anchor.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a.ecard-link');
      if (!anchor) return;
      const id = new URL((anchor as HTMLAnchorElement).href).searchParams.get('listing');
      if (!id || !listings.some((l) => l.id === id)) return;
      event.preventDefault();
      open(id);
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [listings, open]);

  useEffect(() => {
    if (!openId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, close]);

  // Same lock the homepage applies while an overlay is open.
  useEffect(() => {
    document.body.style.overflow = openId ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [openId]);

  const listing = openId ? listings.find((l) => l.id === openId) || null : null;

  return (
    <>
      {children}
      {listing && (
        <ListingDetail
          key={listing.id}
          listing={listing}
          allListings={listings}
          // The collection page never receives otherListingIds, so there is
          // nothing to show and nothing to leak. Stated rather than implied.
          showSiblings={false}
          onClose={close}
          onOpenListing={swap}
          onUnlock={() => { window.location.assign(`/?checkout=${encodeURIComponent(listing.id)}`); }}
        />
      )}
    </>
  );
}
