import { ListingCardBody, listingCardClassName } from '@/components/ListingCardBody';
import { publicListingTitle, type PublicListing } from '@/lib/publicListing';

// The same browse card, as a real anchor.
//
// A collection page exists so a crawler can reach listings, which means the
// link has to be an href in the served HTML rather than an onClick. /?listing=
// is the URL the homepage already pushes when a card opens (openDetail in
// app/page.tsx), so following one lands on the same detail sheet a buyer sees.
//
// No handlers, so this renders on the server and the listing text is in the
// document. "Unlock" is a span here rather than its own control: the whole card
// is one link, and a second target inside an anchor would be a nested link.

export default function CollectionListingCard({ listing }: { listing: PublicListing }) {
  return (
    <a
      className={listingCardClassName(listing, 'ecard-link')}
      href={`/?listing=${encodeURIComponent(listing.id)}`}
      aria-label={publicListingTitle(listing)}
    >
      <ListingCardBody listing={listing} unlock={<span className="ecard-unlock">Unlock</span>} />
    </a>
  );
}
