'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './admin.module.css';

type PayoutStatus = 'not_eligible' | 'setup_required' | 'in_review' | 'ready';
type AdminPayout = {
  accountState: 'no_sales' | 'setup_needed' | 'stripe_review' | 'ready';
  connectedAccount: string | null;
  pendingCents: number;
  transferredCents: number;
  stripeBalanceCents: number;
  bankInTransitCents: number;
  bankPaidCents: number;
  latestBankPayoutStatus: string | null;
  latestBankPayoutArrivalDate: string | null;
  latestSafeError: string | null;
  latestBankPayoutError: string | null;
};
type SellerRow = {
  id: string;
  email: string;
  name: string | null;
  school: string | null;
  major: string | null;
  listingCount: number;
  publishedListingCount: number;
  liveSaleCount: number;
  payoutStatus: PayoutStatus;
  payout: AdminPayout;
};
type DashboardListing = {
  id: string;
  school: string;
  targetSchool: string | null;
  applicationSystem: string | null;
  status: string;
  pricingMode: string;
  packagePrice: number | null;
  adminNote: string | null;
  createdAt: string;
  sales: number;
  grossCents: number;
  sellerEarningsCents: number;
  platformFeeCents: number;
  stripeProcessingFeeCents: number;
  essays: { id: string; prompt: string; question: string | null; price: number | null }[];
};
type SellerPreview = {
  seller: {
    id: string;
    email: string;
    name: string | null;
    bio: string | null;
    backgroundTags: string[];
  };
  dashboard: {
    listings: DashboardListing[];
    sellerShareBps: number;
    allTimeGrossCents: number;
    allTimeSellerEarningsCents: number;
    allTimePlatformFeeCents: number;
    allTimeStripeProcessingFeeCents: number;
    monthGrossCents: number;
    monthSellerEarningsCents: number;
    monthStripeProcessingFeeCents: number;
    payouts: {
      status: PayoutStatus;
      setupAvailable: boolean;
      liveSaleCount: number;
      pendingCents: number;
      paidCents: number;
      accountingPendingCount?: number;
      bankPayouts: {
        stripeBalanceCents: number;
        paidCents: number;
        inTransitCents: number;
        failedCents: number;
        latest: {
          id: string;
          amountCents: number;
          currency: string;
          status: 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled';
          arrivalDate: string | null;
          failureMessage: string | null;
        } | null;
      };
    };
  };
  adminPayout: AdminPayout;
};

const PREVIEW_SELLER: SellerRow = {
  id: 'preview-seller',
  email: 'demo.seller@example.edu',
  name: 'Demo Seller',
  school: 'University of Washington',
  major: 'Computer Science',
  listingCount: 9,
  publishedListingCount: 9,
  liveSaleCount: 1,
  payoutStatus: 'setup_required',
  payout: {
    accountState: 'setup_needed', connectedAccount: null, pendingCents: 11_040,
    transferredCents: 0, stripeBalanceCents: 0, bankInTransitCents: 0, bankPaidCents: 0,
    latestBankPayoutStatus: null, latestBankPayoutArrivalDate: null,
    latestSafeError: null, latestBankPayoutError: null,
  },
};

const PREVIEW_DASHBOARD: SellerPreview = {
  seller: { id: PREVIEW_SELLER.id, email: PREVIEW_SELLER.email, name: PREVIEW_SELLER.name, bio: 'I wrote about building community through computer science.', backgroundTags: ['First-generation', 'STEM'] },
  dashboard: {
    listings: Array.from({ length: 9 }, (_, index) => ({
      id: `preview-listing-${index}`,
      school: 'University of Washington',
      targetSchool: index === 0 ? 'Stanford University' : `College package ${index + 1}`,
      applicationSystem: 'Common App',
      status: 'approved',
      pricingMode: 'package',
      packagePrice: index === 0 ? 184 : 30,
      adminNote: null,
      createdAt: '2026-08-19T00:00:00.000Z',
      sales: index === 0 ? 1 : 0,
      grossCents: index === 0 ? 18_400 : 0,
      sellerEarningsCents: index === 0 ? 11_040 : 0,
      platformFeeCents: index === 0 ? 7_360 : 0,
      stripeProcessingFeeCents: 0,
      essays: [{ id: `preview-essay-${index}`, prompt: 'Personal statement', question: null, price: null }],
    })),
    sellerShareBps: 6_000,
    allTimeGrossCents: 18_400,
    allTimeSellerEarningsCents: 11_040,
    allTimePlatformFeeCents: 7_360,
    allTimeStripeProcessingFeeCents: 0,
    monthGrossCents: 18_400,
    monthSellerEarningsCents: 11_040,
    monthStripeProcessingFeeCents: 0,
    payouts: {
      status: 'setup_required', setupAvailable: true, liveSaleCount: 1,
      pendingCents: 11_040, paidCents: 0, accountingPendingCount: 0,
      bankPayouts: { stripeBalanceCents: 0, paidCents: 0, inTransitCents: 0, failedCents: 0, latest: null },
    },
  },
  adminPayout: PREVIEW_SELLER.payout,
};

const money = (cents: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
}).format(cents / 100);

const payoutLabel: Record<PayoutStatus, string> = {
  not_eligible: 'No live sales',
  setup_required: 'Setup needed',
  in_review: 'Stripe review',
  ready: 'Ready',
};

const accountLabel: Record<AdminPayout['accountState'], string> = {
  no_sales: 'Not created',
  setup_needed: 'Not created',
  stripe_review: 'Onboarding or review',
  ready: 'Ready for transfers',
};

function initials(seller: Pick<SellerRow, 'name' | 'email'>) {
  const source = seller.name?.trim() || seller.email.split('@')[0];
  return source.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

export default function SellerSupport({ previewMode = false }: { previewMode?: boolean }) {
  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmSeller, setConfirmSeller] = useState<SellerRow | null>(null);
  const [preview, setPreview] = useState<SellerPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (previewMode) {
      setSellers([PREVIEW_SELLER]);
      setLoading(false);
      return;
    }
    let active = true;
    fetch('/api/admin/sellers', { credentials: 'same-origin' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not load sellers.');
        if (active) setSellers(data.sellers || []);
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : 'Could not load sellers.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [previewMode]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sellers;
    return sellers.filter((seller) => [seller.name, seller.email, seller.school, seller.major]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle)));
  }, [query, sellers]);

  async function enterPreview() {
    if (!confirmSeller) return;
    if (previewMode) {
      setPreview(PREVIEW_DASHBOARD);
      setConfirmSeller(null);
      return;
    }
    setPreviewLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/sellers/${encodeURIComponent(confirmSeller.id)}/dashboard`, {
        credentials: 'same-origin',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not open the seller dashboard.');
      setPreview(data);
      setConfirmSeller(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the seller dashboard.');
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <>
      <div className={styles.supportHead}>
        <div>
          <div className={styles.supportEyebrow}>Seller support</div>
          <h1 className={styles.supportTitle}>Open a seller&apos;s dashboard</h1>
          <p>Look up a seller and view exactly what their live data shows. Passwords stay private and seller actions are disabled.</p>
        </div>
        <span className={styles.safePill}>Read-only access</span>
      </div>

      <div className={styles.sellerSearchCard}>
        <label htmlFor="seller-support-search">Find a seller</label>
        <input
          id="seller-support-search"
          className={styles.sellerSearch}
          type="search"
          placeholder="Search by name, school, or email"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span>Every seller shown here has completed Admitfolio&apos;s .edu verification.</span>
      </div>

      {error && <div className={styles.supportError} role="alert">{error}</div>}
      {loading ? (
        <div className={styles.loading}>Loading sellers…</div>
      ) : shown.length === 0 ? (
        <div className={styles.empty}>No seller matches that search.</div>
      ) : (
        <div className={styles.sellerDirectory}>
          <div className={styles.directoryHead}>
            <h2>Seller results</h2>
            <span>{shown.length} seller{shown.length === 1 ? '' : 's'}</span>
          </div>
          {shown.map((seller) => (
            <article className={styles.supportSellerCard} key={seller.id}>
              <div className={styles.supportAvatar}>{initials(seller)}</div>
              <div className={styles.supportSellerMain}>
                <div className={styles.supportSellerName}>{seller.name || seller.email.split('@')[0]}</div>
                <div className={styles.supportSellerDetail}>
                  {[seller.school, seller.major, seller.email].filter(Boolean).join(' · ')}
                </div>
                <div className={styles.supportMeta}>
                  <span>{seller.publishedListingCount} published</span>
                  <span>{seller.liveSaleCount} sale{seller.liveSaleCount === 1 ? '' : 's'}</span>
                  <span>{money(seller.payout.pendingCents)} pending</span>
                  <span className={styles[`payout_${seller.payoutStatus}`]}>{payoutLabel[seller.payoutStatus]}</span>
                </div>
              </div>
              <button className={styles.btn} type="button" onClick={() => setConfirmSeller(seller)}>
                View dashboard
              </button>
            </article>
          ))}
        </div>
      )}

      <div className={styles.supportNotice}>
        <b>Support mode is view-only.</b> You can inspect listings, earnings, payout status, and profile details. Editing prices, listings, profiles, or payout information stays blocked.
      </div>

      {confirmSeller && (
        <div className={styles.supportModalBackdrop} role="presentation" onMouseDown={() => !previewLoading && setConfirmSeller(null)}>
          <div className={styles.supportModal} role="dialog" aria-modal="true" aria-labelledby="seller-preview-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.supportAvatar}>{initials(confirmSeller)}</div>
            <h2 id="seller-preview-title">View {confirmSeller.name || confirmSeller.email}&apos;s dashboard?</h2>
            <p>This opens a read-only support view. The seller&apos;s password and sign-in details are never exposed.</p>
            <ul>
              <li>Seller actions stay disabled</li>
              <li>A clear admin banner stays visible</li>
              <li>This access is recorded in the server log</li>
            </ul>
            <div className={styles.supportModalActions}>
              <button className={`${styles.btn} ${styles.btnGhost}`} type="button" disabled={previewLoading} onClick={() => setConfirmSeller(null)}>Cancel</button>
              <button className={styles.btn} type="button" disabled={previewLoading} onClick={enterPreview}>{previewLoading ? 'Opening…' : 'Enter support view'}</button>
            </div>
          </div>
        </div>
      )}

      {preview && <SellerDashboardPreview preview={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

function SellerDashboardPreview({ preview, onClose }: { preview: SellerPreview; onClose: () => void }) {
  const { seller, dashboard, adminPayout } = preview;
  const published = dashboard.listings.filter((listing) => listing.status === 'approved').length;
  return (
    <div className={styles.previewOverlay} role="dialog" aria-modal="true" aria-label={`Read-only dashboard for ${seller.name || seller.email}`}>
      <div className={styles.previewSupportBar}>
        <div>
          <b>Viewing {seller.name || seller.email}&apos;s dashboard</b>
          <span>Admin support session. Seller actions are disabled.</span>
        </div>
        <span className={styles.readOnlyPill}>Read-only</span>
        <button type="button" onClick={onClose}>Exit seller view</button>
      </div>

      <div className={styles.previewScroll}>
        <section className={styles.adminPayoutSummary} aria-label="Admin payout summary">
          <div><span>Stripe account</span><b>{accountLabel[adminPayout.accountState]}</b></div>
          <div><span>Connected account</span><b>{adminPayout.connectedAccount || 'None'}</b></div>
          <div><span>Pending</span><b>{money(adminPayout.pendingCents)}</b></div>
          <div><span>Transferred</span><b>{money(adminPayout.transferredCents)}</b></div>
          <div><span>At Stripe</span><b>{money(adminPayout.stripeBalanceCents)}</b></div>
          <div><span>Bank payout</span><b>{adminPayout.latestBankPayoutStatus || 'None'}</b></div>
          <div><span>In transit</span><b>{money(adminPayout.bankInTransitCents)}</b></div>
          <div><span>Deposited</span><b>{money(adminPayout.bankPaidCents)}</b></div>
          {adminPayout.latestSafeError && <p role="alert">{adminPayout.latestSafeError}</p>}
          {adminPayout.latestBankPayoutError && <p role="alert">{adminPayout.latestBankPayoutError}</p>}
        </section>

        <div className={styles.previewDashboard}>
          <nav className={styles.previewNav}>
            <div className={styles.logo}>admitfolio<b>.</b></div>
            <strong>Seller Dashboard</strong>
            <span>{seller.email}</span>
          </nav>
          <main className={styles.previewBody}>
            <section>
              <h2 className={styles.previewHeading}>Earnings overview</h2>
              <div className={styles.previewStats}>
                <PreviewStat label="Total net earnings" value={money(dashboard.allTimeSellerEarningsCents)} detail="After platform and transaction fees · all time" />
                <PreviewStat label="This month (net)" value={money(dashboard.monthSellerEarningsCents)} detail={`Gross ${money(dashboard.monthGrossCents)}`} />
                <PreviewStat label="Pending payout" value={money(dashboard.payouts.pendingCents)} detail={dashboard.payouts.accountingPendingCount ? 'Finalizing Stripe transaction fee' : payoutLabel[dashboard.payouts.status]} />
                <PreviewStat label="Total sales" value={String(dashboard.payouts.liveSaleCount)} detail={`Across ${published} live listing${published === 1 ? '' : 's'}`} />
              </div>

              {dashboard.payouts.status === 'setup_required' && (
                <div className={styles.previewPayoutCallout}>
                  <div>
                    <span>Your first sale</span>
                    <h3>Congrats, you made your first sale!</h3>
                    <p>{dashboard.payouts.accountingPendingCount
                      ? 'Stripe is finalizing the transaction fee for this sale. The exact payout will appear shortly.'
                      : <>You have <b>{money(dashboard.payouts.pendingCents)}</b> waiting. Set up your payout once so Stripe can send this and future earnings to your bank.</>}</p>
                    <small>Identity and bank details go directly to Stripe. Admitfolio never stores them.</small>
                  </div>
                  <button type="button" disabled title="Disabled in admin support mode">Set up my payout</button>
                </div>
              )}
              {dashboard.payouts.status === 'in_review' && (
                <div className={styles.previewPayoutCallout}>
                  <div><h3>Stripe is reviewing your payout details.</h3><p>Your earnings stay recorded and will be released when Stripe enables payouts.</p></div>
                  <button type="button" disabled title="Disabled in admin support mode">Continue payout setup</button>
                </div>
              )}
              {dashboard.payouts.status === 'ready' && dashboard.payouts.bankPayouts.latest && (
                <div className={`${styles.previewPayoutCallout} ${dashboard.payouts.bankPayouts.latest.status === 'failed' ? styles.previewPayoutFailed : styles.previewPayoutBank}`}>
                  <div>
                    <span>Bank payout</span>
                    <h3>{dashboard.payouts.bankPayouts.latest.status === 'paid'
                      ? 'Deposited in the seller bank'
                      : dashboard.payouts.bankPayouts.latest.status === 'failed'
                        ? 'Bank payout needs attention'
                        : 'On the way to the seller bank'}</h3>
                    <p>{money(dashboard.payouts.bankPayouts.latest.amountCents)}. {dashboard.payouts.bankPayouts.latest.failureMessage || (dashboard.payouts.bankPayouts.latest.arrivalDate
                      ? `Expected ${new Date(dashboard.payouts.bankPayouts.latest.arrivalDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`
                      : 'Stripe has not provided an arrival date yet.')}</p>
                  </div>
                </div>
              )}

              <div className={styles.revenueBreakdown}>
                <h3>All-time revenue breakdown</h3>
                <div><span>Gross sales</span><b>{money(dashboard.allTimeGrossCents)}</b></div>
                <div><span>Admitfolio fee ({(100 - dashboard.sellerShareBps / 100).toFixed(0)}%)</span><b>− {money(dashboard.allTimePlatformFeeCents)}</b></div>
                <div><span>Stripe transaction fee</span><b>− {money(dashboard.allTimeStripeProcessingFeeCents)}</b></div>
                <div className={styles.revenueNet}><span>Your payout</span><b>{money(dashboard.allTimeSellerEarningsCents)}</b></div>
              </div>
            </section>

            <section>
              <h2 className={styles.previewHeading}>Your seller profile</h2>
              <div className={styles.previewProfile}>
                <div className={styles.supportAvatar}>{initials({ name: seller.name, email: seller.email })}</div>
                <div><b>{seller.name || 'No name added'}</b><p>{seller.bio || 'No seller bio added yet.'}</p><div className={styles.supportMeta}>{seller.backgroundTags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>
              </div>
            </section>

            <section>
              <h2 className={styles.previewHeading}>Your listings</h2>
              <div className={styles.previewListings}>
                {dashboard.listings.length === 0 ? <div className={styles.empty}>No listings yet.</div> : dashboard.listings.map((listing) => (
                  <article key={listing.id}>
                    <div><h3>{listing.targetSchool || listing.school}</h3><span className={styles[`listing_${listing.status}`]}>{listing.status}</span></div>
                    <p>{listing.essays.length} essay{listing.essays.length === 1 ? '' : 's'} · {listing.sales} sale{listing.sales === 1 ? '' : 's'}</p>
                    <div className={styles.listingMoney}>
                      <span>Gross <b>{money(listing.grossCents)}</b></span>
                      <span>Admitfolio fee <b>{money(listing.platformFeeCents)}</b></span>
                      <span>Stripe fee <b>{money(listing.stripeProcessingFeeCents)}</b></span>
                      <span>Payout <b>{money(listing.sellerEarningsCents)}</b></span>
                    </div>
                    {listing.adminNote && <small>Review note: {listing.adminNote}</small>}
                  </article>
                ))}
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

function PreviewStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className={styles.previewStat}><span>{label}</span><b>{value}</b><small>{detail}</small></div>;
}
