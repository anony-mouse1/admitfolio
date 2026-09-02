'use client';

import { useMemo, useState } from 'react';
import styles from './SellerApplicationsWorkspace.module.css';
import ListingPricePanel, { type ListingPriceSave } from './ListingPricePanel';
import {
  anonymitySummary,
  applicationDecisionLabel,
  applicationsForFilter,
  isSafeLocalLogoPath,
  listingActionLabel,
  listingFilterCounts,
  listingStatusLabel,
  listingStatusTone,
  type SellerApplicationListing,
  type SellerApplicationRecord,
  type SellerListingFilter,
  type SellerProfileSummary,
} from './sellerApplicationsCore';

export type SellerApplicationsWorkspaceProps = {
  profile: SellerProfileSummary;
  applications: SellerApplicationRecord[];
  onEditProfile: () => void;
  onAddApplication: () => void;
  onEditApplication: (applicationKey: string) => void;
  onAddListing: (applicationKey: string) => void;
  onEditListing: (listingId: string) => void;
  onTakeDownListing?: (listingId: string) => void;
  /** Where a seller writes in when a finished listing needs changing. */
  supportEmail: string;

  // Both editors render inside the card that opened them. They used to render
  // outside this component entirely, above or below the whole workspace, so the
  // button that opened them looked dead.
  editingApplicationKey?: string | null;
  applicationClassYear?: string;
  applicationEditBusy?: boolean;
  applicationEditError?: string;
  onApplicationClassYearChange?: (value: string) => void;
  onSaveApplication?: () => void;
  onCancelApplicationEdit?: () => void;

  activeListingId?: string | null;
  onCloseListingControls?: () => void;
  onSaveListingPrice?: (payload: ListingPriceSave) => Promise<string | null>;
};

const FILTER_LABELS: Record<SellerListingFilter, string> = {
  all: 'All',
  published: 'Published',
  review: 'In review',
};

function initials(value: string | null): string {
  const letters = (value || 'Verified seller')
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('');
  return letters.toUpperCase() || 'VS';
}

function schoolInitials(school: string): string {
  const words = school.split(/\s+/).filter((word) => !['of', 'the', 'at'].includes(word.toLowerCase()));
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

// Rejected and taken down are terminal. Nothing a seller presses moves them.
function isFinal(status: SellerApplicationListing['status']): boolean {
  return status === 'rejected' || status === 'removed';
}

function supportMailto(email: string, school: string, title: string): string {
  const subject = `Listing change request: ${school}`;
  const body = `I need a change to my listing.\n\nSchool: ${school}\nListing: ${title}\n\nWhat I need changed:\n`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function formatPrice(cents: number | null): string {
  if (cents == null) return 'Price not set';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default function SellerApplicationsWorkspace({
  profile,
  applications,
  onEditProfile,
  onAddApplication,
  onEditApplication,
  onAddListing,
  onEditListing,
  onTakeDownListing,
  supportEmail,
  editingApplicationKey = null,
  applicationClassYear = '',
  applicationEditBusy = false,
  applicationEditError = '',
  onApplicationClassYearChange,
  onSaveApplication,
  onCancelApplicationEdit,
  activeListingId = null,
  onCloseListingControls,
  onSaveListingPrice,
}: SellerApplicationsWorkspaceProps) {
  const [filter, setFilter] = useState<SellerListingFilter>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const counts = useMemo(() => listingFilterCounts(applications), [applications]);
  const visibleApplications = useMemo(() => applicationsForFilter(applications, filter), [applications, filter]);

  function toggleApplication(key: string) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section className={styles.workspace} aria-labelledby="seller-applications-title">
      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Application library</div>
          <h1 id="seller-applications-title">List once. Reuse what matters.</h1>
          <p>Keep your background and each school outcome in one place. Add more listings without repeating the same details.</p>
        </div>
        <button className={styles.primaryButton} type="button" onClick={onAddApplication}>+ Add an application</button>
      </header>

      <article className={styles.profileCard} data-testid="reusable-seller-profile">
        <div className={styles.profileAvatar} aria-hidden="true">{initials(profile.displayName)}</div>
        <div className={styles.profileCopy}>
          <h2>{profile.displayName?.trim() || 'Complete your seller profile'}</h2>
          <p>{profile.bio?.trim() || 'Add a short background once, then reuse it across your listings.'}</p>
          {profile.backgroundTags.length > 0 && (
            <div className={styles.profileTags} aria-label="Seller background">
              {profile.backgroundTags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          )}
          <div className={styles.reuseNote}>Saved once and reused across all {counts.all} {counts.all === 1 ? 'listing' : 'listings'}</div>
        </div>
        <button className={styles.secondaryButton} type="button" onClick={onEditProfile}>Edit reusable profile</button>
      </article>

      <div className={styles.sectionHeader}>
        <div>
          <h2>Your applications</h2>
          <p>Common school details sit above the listings they support.</p>
        </div>
        <div className={styles.filters} role="group" aria-label="Filter listings">
          {(Object.keys(FILTER_LABELS) as SellerListingFilter[]).map((key) => (
            <button
              key={key}
              className={filter === key ? styles.filterActive : styles.filter}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {FILTER_LABELS[key]} {counts[key]}
            </button>
          ))}
        </div>
      </div>

      {visibleApplications.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>{filter === 'all' ? 'No listings yet' : `No ${FILTER_LABELS[filter].toLowerCase()} listings yet`}</h3>
          <p>Your applications stay saved when a filter has no matching listings.</p>
        </div>
      ) : visibleApplications.map((application) => {
        const isCollapsed = collapsed.has(application.key);
        return (
          <article className={styles.applicationCard} key={application.key} data-testid="seller-application-group">
            <button
              className={styles.applicationHeader}
              type="button"
              aria-expanded={!isCollapsed}
              onClick={() => toggleApplication(application.key)}
            >
              <span className={styles.schoolMark} aria-hidden="true">
                {isSafeLocalLogoPath(application.localLogoSrc) && (
                  <img
                    src={application.localLogoSrc}
                    alt=""
                    onError={(event) => { event.currentTarget.hidden = true; }}
                  />
                )}
                <span>{schoolInitials(application.school)}</span>
              </span>
              <span className={styles.schoolCopy}>
                <strong>{application.school}</strong>
                <span>{application.cycleLabel} application</span>
              </span>
              <span className={styles.listingCount}>{application.listings.length} {application.listings.length === 1 ? 'listing' : 'listings'}</span>
              <span className={isCollapsed ? styles.chevronCollapsed : styles.chevron} aria-hidden="true">⌄</span>
            </button>

            {!isCollapsed && (
              <div className={styles.applicationBody}>
                <div className={styles.sharedDetails}>
                  <div className={styles.sharedTopline}>
                    <div><strong>Shared application details</strong><span>Entered once</span></div>
                    {editingApplicationKey === application.key ? (
                      <button type="button" onClick={() => onCancelApplicationEdit?.()}>Cancel</button>
                    ) : (
                      <button type="button" onClick={() => onEditApplication(application.key)}>Edit outcome</button>
                    )}
                  </div>
                  {editingApplicationKey === application.key ? (
                    <div className={styles.inlineEditor}>
                      <div className={styles.editorRow}>
                        <label>
                          Decision
                          {/* Listing has no decision column, so this is the only
                              value it can hold. Item 21, a schema change. */}
                          <input value={applicationDecisionLabel(application.decision)} disabled />
                        </label>
                        <label>
                          College class year
                          <input
                            value={applicationClassYear}
                            inputMode="numeric"
                            placeholder="2028"
                            onChange={(event) => onApplicationClassYearChange?.(event.target.value)}
                          />
                        </label>
                      </div>
                      <p className={styles.inlineHint}>
                        Saved once and reused across every {application.school} listing in this application.
                      </p>
                      {applicationEditError && <div className={styles.inlineError} role="alert">{applicationEditError}</div>}
                      <div className={styles.inlineActions}>
                        <button className={styles.primaryButton} type="button" disabled={applicationEditBusy} onClick={() => onSaveApplication?.()}>
                          {applicationEditBusy ? 'Saving…' : 'Save outcome'}
                        </button>
                        <button className={styles.secondaryButton} type="button" disabled={applicationEditBusy} onClick={() => onCancelApplicationEdit?.()}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.facts}>
                      <div><span>Decision</span><strong>{applicationDecisionLabel(application.decision)}</strong></div>
                      <div><span>Class year</span><strong>{application.classYear || 'Not set'}</strong></div>
                      <div><span>School</span><strong>{application.school}</strong></div>
                    </div>
                  )}
                </div>

                <div className={styles.listings}>
                  {application.listings.map((listing) => {
                    const tone = listingStatusTone(listing.status);
                    return (
                      <div className={styles.listingRow} key={listing.id} data-testid="seller-listing-row">
                        <div className={styles.documentIcon} aria-hidden="true">▤</div>
                        <div className={styles.listingCopy}>
                          <strong>{listing.title}</strong>
                          <div>
                            <span>{listing.essayCount} {listing.essayCount === 1 ? 'essay' : 'essays'}</span>
                            {listing.wordCount != null && <span>{listing.wordCount.toLocaleString()} words</span>}
                            <span className={styles.anonymity}>{anonymitySummary(listing.anonymity)}</span>
                          </div>
                          {listing.reviewerNote && <p>Reviewer note: {listing.reviewerNote}</p>}
                          {/* A rejected or taken down listing is final. There is
                              no seller-side way to change it, so the row offers
                              the way that does work instead of a control that
                              does not. The address is spelled out beside the
                              link because a mailto goes nowhere when no mail
                              client is configured. */}
                          {isFinal(listing.status) && (
                            <div className={styles.supportLine}>
                              <a href={supportMailto(supportEmail, application.school, listing.title)}>
                                Email us about this listing
                              </a>
                              <span>{supportEmail}</span>
                            </div>
                          )}
                        </div>
                        <div className={styles.listingActions}>
                          <strong className={styles.price}>{formatPrice(listing.priceCents)}</strong>
                          <span className={`${styles.statusPill} ${styles[tone]}`}>{listingStatusLabel(listing.status)}</span>
                          {!isFinal(listing.status) && (
                            <button
                              className={styles.secondaryButton}
                              type="button"
                              onClick={() => (activeListingId === listing.id ? onCloseListingControls?.() : onEditListing(listing.id))}
                            >
                              {activeListingId === listing.id ? 'Close' : listingActionLabel(listing.status)}
                            </button>
                          )}
                          {listing.status === 'approved' && onTakeDownListing && (
                            <button className={styles.dangerButton} type="button" onClick={() => onTakeDownListing(listing.id)}>
                              Take down
                            </button>
                          )}
                        </div>
                        {activeListingId === listing.id && onSaveListingPrice && onCloseListingControls && (
                          <ListingPricePanel
                            listing={listing}
                            onClose={onCloseListingControls}
                            onSave={onSaveListingPrice}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className={styles.addListingRow}>
                  <button type="button" onClick={() => onAddListing(application.key)}>+ Add another {application.school} listing</button>
                </div>
              </div>
            )}
          </article>
        );
      })}

      <div className={styles.guidance} data-testid="responsible-outcome-guidance">
        <article className={styles.allowedClaim}>
          <h3>Say what happened</h3>
          <p>Outcomes are factual, structured, and tied to a verified application.</p>
          <div><span>Shown to buyers</span>Admitted to Stanford, Class of 2028</div>
        </article>
        <article className={styles.blockedClaim}>
          <h3>Avoid causal claims</h3>
          <p>No listing can imply that one essay guaranteed an admission decision.</p>
          <div><span>Not allowed</span>This essay got me into Stanford</div>
        </article>
      </div>
    </section>
  );
}
