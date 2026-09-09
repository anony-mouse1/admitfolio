'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import ListingDetail from '@/components/ListingDetail';
import ListingCheckout from '@/components/ListingCheckout';
import { ANALYTICS_EVENTS, trackConversion } from '@/lib/analyticsEvents';
import { checkoutItemForListing, headlineSchool, type CheckoutItem, type PublicListing } from '@/lib/publicListing';
import { schoolShortName } from '@/lib/schools';

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
// Checkout opens here too. app/page.tsx used to be the only place that could
// run it, because openBuy wrote its URL against a hardcoded '/', so Unlock had
// to throw the buyer onto the homepage at the exact moment they decided to buy.
// components/ListingCheckout is the one implementation of that dialog and this
// mounts it against this collection's own path instead.

type Props = {
  /** Without otherListingIds: see the note in app/essays/[collection]/page.tsx. */
  listings: Omit<PublicListing, 'otherListingIds'>[];
  /** The collection's own path, e.g. /essays/biology. Never carries the query. */
  basePath: string;
  /** From ?listing= on the server, already checked against this collection. */
  initialListingId: string | null;
  /** From ?checkout= on the server. Restores the dialog after a reload. */
  initialCheckoutId: string | null;
  children: ReactNode;
};

export default function CollectionBrowser({ listings, basePath, initialListingId, initialCheckoutId, children }: Props) {
  const [openId, setOpenId] = useState<string | null>(initialListingId || initialCheckoutId);
  const [checkoutItem, setCheckoutItem] = useState<Partial<CheckoutItem>>(() => {
    const listing = initialCheckoutId ? listings.find((l) => l.id === initialCheckoutId) : null;
    return listing ? checkoutItemForListing(listing as PublicListing) : {};
  });
  // Restored from the URL, so Checkout Started is not re-fired: app/page.tsx
  // makes the same distinction with its trackStart argument.
  const [checkoutOpen, setCheckoutOpen] = useState(Boolean(initialCheckoutId));
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

  // Unlock. The URL gets ?checkout= on this collection, so Back closes the
  // dialog and puts the listing sheet straight back, and the buyer never leaves
  // the page they were reading.
  const openCheckout = useCallback((listing: (typeof listings)[number]) => {
    const item = checkoutItemForListing(listing as PublicListing);
    trackConversion(ANALYTICS_EVENTS.checkoutStarted, { school: item.school, value: item.price });
    setCheckoutItem(item);
    setCheckoutOpen(true);
    window.history.pushState({ collectionCheckout: item.listingId }, '', `${basePath}?checkout=${encodeURIComponent(item.listingId)}`);
    checkoutPushedRef.current = true;
  }, [basePath]);

  const checkoutPushedRef = useRef(Boolean(!initialCheckoutId));
  const closeCheckout = useCallback(() => {
    if (checkoutPushedRef.current) { window.history.back(); return; }
    setCheckoutOpen(false);
    window.history.replaceState({}, '', openId ? `${basePath}?listing=${encodeURIComponent(openId)}` : basePath);
  }, [basePath, openId]);

  useEffect(() => {
    function onPop() {
      const params = new URLSearchParams(window.location.search);
      const checkoutId = params.get('checkout');
      const id = params.get('listing') || checkoutId;
      pushedRef.current = false;
      checkoutPushedRef.current = false;
      setCheckoutOpen(Boolean(checkoutId && listings.some((l) => l.id === checkoutId)));
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
    if (!openId && !checkoutOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (checkoutOpen) closeCheckout();
      else close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, checkoutOpen, close, closeCheckout]);

  // Same lock the homepage applies while an overlay is open.
  useEffect(() => {
    document.body.style.overflow = openId || checkoutOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [openId, checkoutOpen]);

  const listing = openId ? listings.find((l) => l.id === openId) || null : null;

  // Listing Viewed, once per listing per session, exactly as app/page.tsx
  // records it. Without this a checkout opened from a collection page has no
  // preceding view in the funnel and the two surfaces do not add up.
  const trackedViews = useRef(new Set<string>());
  useEffect(() => {
    if (!listing || trackedViews.current.has(listing.id)) return;
    trackedViews.current.add(listing.id);
    trackConversion(ANALYTICS_EVENTS.listingViewed, {
      school: schoolShortName(headlineSchool(listing as PublicListing)),
      listingType: listing.essays.length > 1 ? 'package' : 'single',
    });
  }, [listing]);

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
          obscured={checkoutOpen}
          onUnlock={() => openCheckout(listing)}
        />
      )}
      <ListingCheckout open={checkoutOpen} item={checkoutItem} onClose={closeCheckout} />
    </>
  );
}
