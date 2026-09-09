'use client';

import LogoBadge from '@/components/LogoBadge';
import { schoolColor, schoolInfo, schoolShortName } from '@/lib/schools';
import {
  cardTagLabel,
  collegeAdmitTags,
  contentsLine,
  headlineSchool,
  isQuestBridgeTag,
  majorsOf,
  priceLabel,
  publicListingTitle,
  questBridgeLabel,
  sameTitleText,
  type PublicListing,
} from '@/lib/publicListing';
import type { Anonymity } from '@/lib/anonymity';

// The listing detail sheet, lifted out of app/page.tsx unchanged apart from the
// showSiblings gate below. app/page.tsx said for months that this component was
// "pure presentation over a PublicListing, so it can move into a /listing/[id]
// route later without changing", and that turned out to be true: the collection
// pages under app/essays now open the same sheet in place, which is what stops
// a click from a collection page bouncing through the homepage.

/* One school as a chip: logo plus short name. Used for both admit lists and the
   "now attends" line on the detail sheet. */
function SchoolChip({ name, verified }: { name: string; verified?: boolean }) {
  const info = schoolInfo(name);
  const label = info ? info.short : schoolShortName(name);
  return (
    <span className="d-school" title={name}>
      <LogoBadge
        domain={info ? info.domain : undefined}
        letter={(label[0] || '?').toUpperCase()}
        color={schoolColor(name)}
        school={name}
        size={24}
        fontSize={11}
      />
      {label}
      {verified && <span className="d-verified" title="Acceptance letter checked by a human">✓</span>}
    </span>
  );
}

/* What the seller is promised, in the seller's own terms. Never a name.
   'anonymous' means never named, even to the buyer, so saying "anonymous until
   purchase" for that case would be a promise the product does not keep. */
function anonymityNote(mode: Anonymity | undefined): string {
  if (mode === 'full') return 'Shares their name publicly.';
  if (mode === 'revealOnPurchase') return 'Anonymous until purchase.';
  return 'Stays anonymous, before and after purchase.';
}

/* The listing detail sheet.
   Pure presentation over a PublicListing, so it can move into a /listing/[id]
   route later without changing. Rendered as JSX rather than an HTML string:
   Essay.question is seller free text that runs to 1,200 characters in the live
   data, and one missed escape in a template would be stored XSS. */
export default function ListingDetail({
  listing,
  allListings,
  obscured = false,
  showSiblings = true,
  onClose,
  onOpenListing,
  onUnlock,
}: {
  listing: PublicListing;
  allListings: PublicListing[];
  obscured?: boolean;
  /**
   * "Browse more essays from this seller" is a same-seller grouping, and
   * lib/anonymity.ts exists to stop that grouping being published. On the
   * collection pages the sheet renders on the server, so this is false there
   * until the client has mounted and the block can never reach a crawler.
   */
  showSiblings?: boolean;
  onClose: () => void;
  onOpenListing: (id: string) => void;
  onUnlock: () => void;
}) {
  const head = headlineSchool(listing);
  const info = schoolInfo(head);
  const label = info ? info.short : schoolShortName(head);
  const majors = majorsOf(listing);
  const verified = new Set(listing.verifiedAdmitTags || []);
  const listed = new Date(listing.createdAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const count = listing.essays.length;
  const firstEssayLabel = listing.essays[0]?.prompt
    .replace(/\s*·\s*/g, ' ')
    .replace(/Personal Statement/g, 'personal statement')
    .replace(/Supplement/g, 'supplement') || 'Essay';
  const remainingEssays = listing.essays.slice(1);
  const remainingAreSupplements = remainingEssays.length > 0
    && remainingEssays.every((essay) => /supplement/i.test(essay.prompt));
  const essayPreview = count === 1
    ? firstEssayLabel
    : `${firstEssayLabel} + ${count - 1} ${remainingAreSupplements
      ? `supplement${count === 2 ? '' : 's'}`
      : 'more'}`;
  const title = publicListingTitle(listing);
  const admittedColleges = collegeAdmitTags(listing);
  const questBridge = questBridgeLabel(listing);
  const sellerTags = questBridge
    ? [questBridge, ...listing.seller.backgroundTags.filter((tag) => tag !== questBridge)]
    : listing.seller.backgroundTags;
  const otherListings = (listing.otherListingIds || [])
    .map((id) => allListings.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is PublicListing => Boolean(candidate));

  return (
    <div
      className="ov"
      role="dialog"
      aria-modal="true"
      aria-hidden={obscured || undefined}
      inert={obscured || undefined}
      aria-label={`${label} listing`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet">
        <button className="sheet-x mobile-page-close" type="button" aria-label="Back to essays" onClick={onClose}>
          <span className="mobile-page-close-icon" aria-hidden="true">&times;</span>
          <span className="mobile-page-back-label" aria-hidden="true">←</span>
        </button>

        <div className="d-head">
          <LogoBadge
            domain={info ? info.domain : undefined}
            letter={(label[0] || 'A').toUpperCase()}
            color={schoolColor(head)}
            school={head}
            size={54}
            fontSize={22}
          />
          <div style={{ minWidth: 0 }}>
            <div className="d-title">{label}</div>
            <div className="d-sub">{contentsLine(listing)}</div>
          </div>
        </div>

        <div className="d-hook">{title}</div>
        {/* The actual essay excerpt stays primary. A distinct seller-written
            description can still add context once the buyer opens the card. */}
        {listing.teaser && listing.openingLine && !sameTitleText(listing.teaser, listing.openingLine) && (
          <div className="d-teaser">Seller&apos;s summary: {listing.teaser}</div>
        )}

        <div className="d-foot d-foot-top">
          <div className="d-price">
            {priceLabel(listing.price)}
            <span>{count > 1 ? 'for the whole set' : 'for the full essay'}</span>
          </div>
          <button className="d-unlock-btn" type="button" onClick={onUnlock}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="10" width="14" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            {count > 1 ? `Unlock ${count} essays` : 'Unlock full essay'}
            <span className="d-unlock-arrow" aria-hidden="true">→</span>
          </button>
        </div>

        <div className="d-sec">
          <details className="d-essay-details">
            <summary>
              <span className="d-essay-summary-copy">
                <strong>{count === 1 ? 'One essay included' : `${count} essays included`}</strong>
                <span>{essayPreview}</span>
              </span>
              <span className="d-essay-summary-count">{count} {count === 1 ? 'essay' : 'essays'}</span>
              <span className="d-essay-chevron" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </summary>
            <ul className="d-essays">
              {listing.essays.map((e, i) => (
                <li key={i}>
                  <div className="p">{e.prompt}</div>
                  {e.question && <div className="q">{e.question}</div>}
                  {e.wordCount ? <div className="q">{e.wordCount} words</div> : null}
                </li>
              ))}
            </ul>
          </details>
        </div>

        <div className="d-sec d-overview" aria-label="Listing overview">
          {admittedColleges.length > 0 && (
            <div className="d-overview-row">
              <div className="d-overview-label">Admitted to</div>
              <div className="d-schools">
                {admittedColleges.map((t) => (
                  <SchoolChip key={t} name={t} verified={verified.has(t)} />
                ))}
              </div>
            </div>
          )}
          <div className="d-overview-row">
            <div className="d-overview-label">Now attends</div>
            <div className="d-schools">
              <SchoolChip name={listing.school} />
            </div>
          </div>
          {majors.length > 0 && (
            <div className="d-overview-row">
              <div className="d-overview-label">Applied as</div>
              <div className="d-schools">
                {majors.map((m) => (
                  <span key={m} className="etag">{m}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="d-sec d-seller-strip" aria-label="Seller information">
          <LogoBadge letter="V" color="#4a1d6b" school={listing.seller.displayName} size={40} fontSize={16} />
          <div className="d-seller-copy">
            <span className="d-seller-kicker">Seller</span>
            <div className="d-profile-name">{listing.seller.displayName}</div>
            <div className="d-profile-note">
              {anonymityNote(listing.seller.anonymity)} Listed {listed}.
            </div>
          </div>
          {sellerTags.length > 0 && (
            <div className="d-seller-tags">
              {sellerTags.map((t) => (
                <span key={t} className={`etag${isQuestBridgeTag(t) ? ' questbridge' : ''}`}>{cardTagLabel(t)}</span>
              ))}
            </div>
          )}
        </div>

        {showSiblings && otherListings.length > 0 && (
          <div className="d-more-seller">
            <h3>Browse more essays from this seller</h3>
            <p>{otherListings.length} other public listing{otherListings.length === 1 ? '' : 's'}</p>
            <div className="d-related-list">
              {otherListings.map((other) => {
                const otherSchool = headlineSchool(other);
                const otherInfo = schoolInfo(otherSchool);
                const otherLabel = otherInfo ? otherInfo.short : schoolShortName(otherSchool);
                return (
                  <button
                    key={other.id}
                    className="d-related"
                    type="button"
                    onClick={() => onOpenListing(other.id)}
                  >
                    <LogoBadge
                      domain={otherInfo ? otherInfo.domain : undefined}
                      letter={(otherLabel[0] || 'A').toUpperCase()}
                      color={schoolColor(otherSchool)}
                      school={otherSchool}
                      size={36}
                      fontSize={14}
                    />
                    <span className="d-related-copy">
                      <strong>{otherLabel}</strong>
                      <span>{publicListingTitle(other)}</span>
                    </span>
                    <span className="d-related-meta">
                      {other.essays.length} {other.essays.length === 1 ? 'essay' : 'essays'}
                      {` · ${priceLabel(other.price)}`}
                    </span>
                    <span className="d-related-arrow" aria-hidden="true">→</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
