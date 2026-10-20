'use client';

import { ListingCardBody, listingCardClassName } from '@/components/ListingCardBody';
import type { PublicListing } from '@/lib/publicListing';

/* Real, purchasable listing card (launch mode). */

export default function PublicListingCard({
  listing,
  onUnlock,
  onOpen,
}: {
  listing: PublicListing;
  onUnlock: () => void;
  onOpen: () => void;
}) {
  return (
    // The whole card opens the detail sheet. It has had `cursor: pointer` since
    // launch while doing nothing, which is why clicking a card felt broken.
    <div
      className={listingCardClassName(listing)}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        // Only the card's own keys. Enter or Space on the Unlock button bubbles
        // here, and preventDefault would cancel that button's click and open
        // the sheet instead.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <ListingCardBody
        listing={listing}
        unlock={
          /* Decided buyers keep the one-click path; stopPropagation so it does
             not also open the sheet behind the buy modal. A real button, so a
             keyboard can reach it: as a div it was mouse only. */
          <button
            className="ecard-unlock"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUnlock();
            }}
          >
            Unlock
          </button>
        }
      />
    </div>
  );
}
