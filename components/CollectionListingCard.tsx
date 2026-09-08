import { ListingCardBody, listingCardClassName } from '@/components/ListingCardBody';
import { publicListingTitle, type PublicListing } from '@/lib/publicListing';

// The same browse card, as a real anchor.
//
// A collection page exists so a crawler can reach listings, which means the
// link has to be an href in the served HTML rather than an onClick.
//
// The href points at this collection's own URL, not at the homepage. Following
// it lands on the collection with the listing open, so a crawler, a middle
// click and a shared link all arrive somewhere that makes sense, and there is
// no homepage in between. components/CollectionBrowser intercepts the ordinary
// click so a visitor does not navigate at all. The collection's canonical is
// the bare path, so the ?listing= variants consolidate onto it.
//
// No handlers, so this renders on the server and the listing text is in the
// document. "Unlock" is a span here rather than its own control: the whole card
// is one link, and a second target inside an anchor would be a nested link.

export default function CollectionListingCard({ listing, basePath }: { listing: PublicListing; basePath: string }) {
  return (
    <a
      className={listingCardClassName(listing, 'ecard-link')}
      href={`${basePath}?listing=${encodeURIComponent(listing.id)}`}
      aria-label={publicListingTitle(listing)}
    >
      <ListingCardBody listing={listing} unlock={<span className="ecard-unlock">Unlock</span>} />
    </a>
  );
}
