import type { ReactNode } from 'react';
import LogoBadge from '@/components/LogoBadge';
import { schoolColor, schoolInfo, schoolShortName } from '@/lib/schools';
import {
  admitNameLine,
  cardTagLabel,
  collegeAdmitTags,
  contentsLine,
  headlineSchool,
  isQuestBridgeTag,
  majorsOf,
  priceLabel,
  publicListingTitle,
  questBridgeLabel,
  type PublicListing,
} from '@/lib/publicListing';

// Everything inside a browse card, with no opinion about what the card itself
// is. The homepage wraps this in a clickable div (components/PublicListingCard),
// and the collection pages wrap it in a plain anchor
// (components/CollectionListingCard) so a crawler can follow it. The markup is
// what shipped inline in app/page.tsx, unchanged, so the two stay identical.
//
// Deliberately no 'use client'. Rendered from a server component this produces
// real HTML, which is the whole point of app/essays; rendered from the homepage
// it joins that client bundle as before.

export function listingCardClassName(listing: PublicListing, extra = ''): string {
  return `ecard catalog-card${listing.essays.length > 1 ? ' is-set' : ''}${extra ? ` ${extra}` : ''}`;
}

export function ListingCardBody({ listing, unlock }: { listing: PublicListing; unlock: ReactNode }) {
  const count = listing.essays.length;
  const head = headlineSchool(listing);
  const info = schoolInfo(head);
  const label = info ? info.short : schoolShortName(head);
  const majors = majorsOf(listing);
  const title = publicListingTitle(listing);
  const admittedColleges = collegeAdmitTags(listing);
  const questBridge = questBridgeLabel(listing);
  const displayTags = questBridge
    ? [questBridge, ...listing.seller.backgroundTags.filter((tag) => tag !== questBridge)]
    : listing.seller.backgroundTags;
  return (
    <>
      <div className="ecard-head">
        <LogoBadge
          domain={info ? info.domain : undefined}
          letter={(label[0] || 'A').toUpperCase()}
          color={schoolColor(head)}
          school={head}
          size={44}
          fontSize={18}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={`ecard-type ${count > 1 ? 'kind-package' : 'kind-single'}`}>
            <span className="type-glyph" aria-hidden="true" />
            <span>{count > 1 ? 'Package' : 'Single'}</span>
            <b>{count} essay{count === 1 ? '' : 's'}</b>
          </div>
          <div className="ecard-school">{label}</div>
          <div className="ecard-meta">{contentsLine(listing)}</div>
        </div>
      </div>
      <div className={`ecard-prompt${majors.length ? '' : ' is-empty'}`} title={majors.join(', ')}>
        {majors.length ? `${majors[0]}${majors.length > 1 ? ` +${majors.length - 1}` : ''}` : ''}
      </div>
      <div className="ecard-hook" title={title}>{title}</div>
      <div className={`ecard-tags${displayTags.length ? '' : ' is-empty'}`}>
        {displayTags.slice(0, 2).map((t) => (
          <span key={t} className={`etag${isQuestBridgeTag(t) ? ' questbridge' : ''}`} title={t}>{cardTagLabel(t)}</span>
        ))}
        {displayTags.length > 2 && (
          <span className="etag etag-more" title={displayTags.slice(2).join(', ')}>
            +{displayTags.length - 2}
          </span>
        )}
      </div>
      {/* Two labelled lines with reserved heights, so every card is the same
          shape and the price rules line up straight across a row. */}
      <div className="ecard-lines">
        <div className="ecard-admits">
          <span className="ecard-admits-label">Seller attends</span>
          <span className="admit-names" title={listing.school}>{schoolShortName(listing.school)}</span>
        </div>
        <div className="ecard-admits">
          <span className="ecard-admits-label">Accepted at:</span>
          <span className="admit-names multi" title={admittedColleges.join(', ')}>
            {admittedColleges.length ? admitNameLine(admittedColleges) : 'Not listed'}
          </span>
        </div>
      </div>
      <div className="ecard-foot">
        <div className="ecard-price">
          <span className="p">{priceLabel(listing.price)}</span>
          <span className="w">{count > 1 ? `${count}-essay set` : 'full essay'}</span>
        </div>
        {unlock}
      </div>
    </>
  );
}
