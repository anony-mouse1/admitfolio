'use client';

import { useEffect, useState, useCallback } from 'react';
import styles from './admin.module.css';

type Essay = {
  id: string;
  prompt: string;
  question: string | null;
  price: number | null;
  wordCount: number | null;
  pdfPath: string | null;
  pdfUrl: string | null;
};
// One reviewer lens's verdict, as returned by /api/admin/listings.
type Lens = {
  key: string;
  label: string;
  pass: boolean;
  confidence: string;
  concerns: string[];
};
type Listing = {
  id: string;
  school: string;
  gradYear: string | null;
  major: string | null;
  appliedMajors: string | null;
  admitTags: string[];
  anonymity: string;
  pricingMode: string;
  packagePrice: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'removed'; // removed = seller take-down
  adminNote: string | null;
  sellerNote: string | null;
  createdAt: string;
  // Automated reviewer-panel verdict.
  aiReviewedAt: string | null;
  aiDecision: 'approved' | 'flagged' | null;
  aiConfidence: 'high' | 'medium' | 'low' | null;
  aiReasons: string | null;
  aiSuggestion: 'approve' | 'reject' | null;
  aiLenses: Lens[]; // per-lens breakdown of the panel's review
  humanReviewedAt: string | null; // set only when YOU decided from this console
  sellerEmail: string;
  isTest: boolean; // seller is an admin/test account - dummy data, not a real student
};
type ListingFull = Listing & { essays: Essay[] };

type Stage = 'loading' | 'email' | 'console';
type Filter = 'needsReview' | 'autoApproved' | 'awaitingAi' | 'approved' | 'rejected' | 'all';

// A submission the panel flagged and that still needs a human decision.
const needsReview = (l: Listing) => l.aiDecision === 'flagged' && l.status === 'pending';
// The panel cleared this one and pushed it live on its own.
const autoApproved = (l: Listing) => l.aiDecision === 'approved';
// Auto-approved but you haven't personally signed off on it yet.
const unaudited = (l: Listing) => autoApproved(l) && !l.humanReviewedAt;
// Submitted, but the cron hasn't screened it yet.
const awaitingAi = (l: Listing) => l.status === 'pending' && !l.aiReviewedAt;

const TABS: { key: Filter; label: string; match: (l: Listing) => boolean }[] = [
  { key: 'needsReview', label: 'Needs manual review', match: needsReview },
  { key: 'autoApproved', label: 'Auto-approved', match: autoApproved },
  { key: 'awaitingAi', label: 'Awaiting AI', match: awaitingAi },
  { key: 'approved', label: 'Approved', match: (l) => l.status === 'approved' },
  { key: 'rejected', label: 'Rejected', match: (l) => l.status === 'rejected' },
  { key: 'all', label: 'All', match: () => true },
];

// The badge on a tab counts what still wants your attention, not the tab's
// total - on Auto-approved that's the ones you haven't signed off on yet.
function badgeCount(key: Filter, listings: Listing[]): number {
  if (key === 'needsReview') return listings.filter(needsReview).length;
  if (key === 'autoApproved') return listings.filter(unaudited).length;
  if (key === 'awaitingAi') return listings.filter(awaitingAi).length;
  return 0;
}

export default function AdminPage() {
  const [stage, setStage] = useState<Stage>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [listings, setListings] = useState<ListingFull[]>([]);
  // Open on the queue that actually needs a decision.
  const [filter, setFilter] = useState<Filter>('needsReview');
  // Per-listing note drafts, keyed by listing id. These ride along with the
  // decision and land in the seller's email.
  const [notes, setNotes] = useState<Record<string, string>>({});
  // Which listings have their full panel breakdown expanded.
  const [openReview, setOpenReview] = useState<Record<string, boolean>>({});
  // Listing id currently being decided, so we can disable its buttons.
  const [deciding, setDeciding] = useState<string | null>(null);

  const loadListings = useCallback(async (): Promise<boolean> => {
    const r = await fetch('/api/admin/listings', { credentials: 'same-origin' });
    if (r.status === 401) return false;
    const data = await r.json().catch(() => ({ listings: [] }));
    setListings(data.listings || []);
    return true;
  }, []);

  // On mount, check whether we already have a valid admin session.
  useEffect(() => {
    loadListings().then((ok) => setStage(ok ? 'console' : 'email'));
  }, [loadListings]);

  async function passwordLogin() {
    setErr('');
    setBusy(true);
    try {
      const r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(data.error || 'Incorrect email or password.');
        return;
      }
      await loadListings();
      setStage('console');
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, decision: 'approved' | 'rejected') {
    const note = (notes[id] || '').trim() || undefined;
    setDeciding(id);
    try {
      await fetch('/api/admin/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id, decision, note }),
      });
      // Clear the draft so a reloaded card doesn't look like it still has an
      // unsent note pending.
      setNotes((n) => {
        const next = { ...n };
        delete next[id];
        return next;
      });
      await loadListings();
    } finally {
      setDeciding(null);
    }
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
    setListings([]);
    setEmail('');
    setPassword('');
    setStage('email');
  }

  const activeTab = TABS.find((t) => t.key === filter) ?? TABS[TABS.length - 1];
  const shown = listings
    .filter(activeTab.match)
    // Float submissions that need a human decision to the top, then ones you
    // haven't signed off on; the seller grouping below preserves this order, so
    // their groups bubble up too.
    .sort(
      (a, b) =>
        Number(needsReview(b)) - Number(needsReview(a)) ||
        Number(unaudited(b)) - Number(unaudited(a)),
    );

  // Group by seller so it's obvious which submissions belong to the same
  // person (order of first appearance is preserved - newest sellers first).
  const sellerGroups: { email: string; isTest: boolean; items: ListingFull[] }[] = [];
  for (const l of shown) {
    const g = sellerGroups.find((s) => s.email === l.sellerEmail);
    if (g) g.items.push(l);
    else sellerGroups.push({ email: l.sellerEmail, isTest: l.isTest, items: [l] });
  }

  return (
    <div className={styles.page}>
      {stage === 'console' ? (
        <>
          <header className={styles.header}>
            <div className={styles.logo}>
              admitfolio<b>.</b>
              <span className={`${styles.sub} ${styles.serif}`}>review console</span>
            </div>
            <button className={`${styles.btn} ${styles.btnGhost}`} onClick={logout}>
              Log out
            </button>
          </header>
          <div className={styles.wrap}>
            <div className={styles.toolbar}>
              <div className={styles.filters}>
                {TABS.map((t) => {
                  const n = badgeCount(t.key, listings);
                  return (
                    <button
                      key={t.key}
                      className={`${styles.chip} ${filter === t.key ? styles.chipActive : ''}`}
                      onClick={() => setFilter(t.key)}
                    >
                      {t.label}
                      {n > 0 && <span className={styles.chipBadge}>{n}</span>}
                    </button>
                  );
                })}
              </div>
              <span className={styles.count}>
                {shown.length} of {listings.length} submission{listings.length === 1 ? '' : 's'}
              </span>
            </div>

            {shown.length === 0 ? (
              <div className={styles.empty}>
                {filter === 'all'
                  ? 'No submissions yet.'
                  : filter === 'needsReview'
                    ? 'Nothing needs manual review right now. 🎉'
                    : `Nothing in ${activeTab.label.toLowerCase()}.`}
              </div>
            ) : (
              sellerGroups.map((g) => (
                <section key={g.email} className={styles.sellerGroup}>
                  <div className={styles.sellerHead}>
                    <span className={styles.sellerEmail}>
                      {g.isTest && <span className={styles.testBadge}>TEST</span>}
                      {g.email}
                    </span>
                    <span className={styles.sellerCounts}>
                      {g.items.length} listing{g.items.length === 1 ? '' : 's'} ·{' '}
                      {g.items.reduce((n, l) => n + l.essays.length, 0)} essay
                      {g.items.reduce((n, l) => n + l.essays.length, 0) === 1 ? '' : 's'}
                    </span>
                  </div>
                  {g.items.map((l) => (
                <div key={l.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <div>
                      <h3 className={styles.serif}>
                        {l.school}
                        {l.gradYear ? ` · Class of ${l.gradYear}` : ''}
                      </h3>
                      <div className={styles.who}>
                        {l.major ? `${l.major} · ` : ''}{l.anonymity}
                      </div>
                    </div>
                    <span className={`${styles.status} ${styles[l.status] || styles.rejected}`}>{l.status}</span>
                  </div>

                  {!l.aiReviewedAt ? (
                    <div className={styles.aiPending}>Awaiting automated review…</div>
                  ) : (
                    <div className={needsReview(l) ? styles.flagBox : styles.aiBox}>
                      <div className={needsReview(l) ? styles.flagTitle : styles.aiTitle}>
                        {needsReview(l)
                          ? '⚑ Needs your review'
                          : l.aiDecision === 'approved'
                            ? '✓ Auto-approved by the review panel'
                            : 'Reviewed by the panel'}
                        {l.aiConfidence ? ` · confidence: ${l.aiConfidence}` : ''}
                        {needsReview(l) && l.aiSuggestion ? ` · suggests ${l.aiSuggestion}` : ''}
                      </div>
                      {l.aiReasons && <div className={styles.flagReasons}>{l.aiReasons}</div>}

                      {l.aiLenses.length > 0 && (
                        <>
                          <button
                            className={styles.reviewToggle}
                            onClick={() =>
                              setOpenReview((o) => ({ ...o, [l.id]: !o[l.id] }))
                            }
                          >
                            {openReview[l.id] ? '▾' : '▸'} Claude&apos;s full review (
                            {l.aiLenses.length} lenses)
                          </button>
                          {openReview[l.id] && (
                            <div className={styles.lensList}>
                              {l.aiLenses.map((lens) => (
                                <div key={lens.key} className={styles.lensRow}>
                                  <div className={styles.lensHead}>
                                    <span
                                      className={lens.pass ? styles.lensPass : styles.lensFail}
                                    >
                                      {lens.pass ? 'PASS' : 'FAIL'}
                                    </span>
                                    <b>{lens.label}</b>
                                    <span className={styles.lensConf}>
                                      {lens.confidence} confidence
                                    </span>
                                  </div>
                                  {lens.concerns.length > 0 ? (
                                    <ul className={styles.lensConcerns}>
                                      {lens.concerns.map((c, i) => (
                                        <li key={i}>{c}</li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <div className={styles.lensClean}>No concerns raised.</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {l.humanReviewedAt ? (
                        <div className={styles.signedOff}>
                          ✓ You signed off on {new Date(l.humanReviewedAt).toLocaleDateString()}
                        </div>
                      ) : autoApproved(l) ? (
                        <div className={styles.unaudited}>Awaiting your sign-off</div>
                      ) : null}
                    </div>
                  )}

                  <div className={styles.meta}>
                    {l.admitTags.length > 0 && (
                      <span className={styles.tag}>
                        Admits: <b>{l.admitTags.join(', ')}</b>
                      </span>
                    )}
                    {l.appliedMajors && (
                      <span className={styles.tag}>
                        Applied in: <b>{l.appliedMajors}</b>
                      </span>
                    )}
                    <span className={styles.tag}>
                      Pricing: <b>{l.pricingMode}</b>
                      {l.packagePrice != null ? ` ($${l.packagePrice})` : ''}
                    </span>
                    <span className={styles.tag}>
                      Submitted: <b>{new Date(l.createdAt).toLocaleDateString()}</b>
                    </span>
                  </div>

                  <div className={styles.essays}>
                    {l.essays.map((e) => (
                      <div key={e.id} className={styles.essayLine}>
                        <span>📄</span>
                        <span>
                          {e.question || e.prompt}
                          {e.price != null ? ` · $${e.price}` : ''}
                          {e.wordCount ? ` · ${e.wordCount} words` : ''}
                          {e.pdfUrl ? (
                            <>
                              {' · '}
                              <a href={e.pdfUrl} target="_blank" rel="noreferrer">
                                View PDF
                              </a>
                            </>
                          ) : (
                            ' · (no PDF uploaded)'
                          )}
                        </span>
                      </div>
                    ))}
                  </div>

                  {l.sellerNote && (
                    <div className={styles.who} style={{ marginTop: 10 }}>
                      Seller&apos;s note: <b>{l.sellerNote}</b>
                    </div>
                  )}

                  {l.adminNote && (
                    <div className={styles.who} style={{ marginTop: 10 }}>
                      Note: {l.adminNote}
                    </div>
                  )}

                  {/* You always get the final say - including overturning an
                      auto-approval. `removed` is the seller's own take-down, so
                      we leave those alone rather than silently relisting. */}
                  {l.status !== 'removed' && (
                    <div className={styles.decide}>
                      <label className={styles.noteLabel} htmlFor={`note-${l.id}`}>
                        Note to the seller (optional)
                      </label>
                      <textarea
                        id={`note-${l.id}`}
                        className={styles.noteInput}
                        rows={2}
                        placeholder={
                          l.aiSuggestion === 'reject'
                            ? 'e.g. The uploaded PDF is missing the second essay — please re-upload and resubmit.'
                            : 'Anything you want included in their email…'
                        }
                        value={notes[l.id] ?? ''}
                        onChange={(e) =>
                          setNotes((n) => ({ ...n, [l.id]: e.target.value }))
                        }
                      />
                      <div className={styles.noteHint}>
                        Included in the email to <b>{l.sellerEmail}</b>. We only email when the
                        decision changes the listing&apos;s status — confirming the current status
                        just clears it off your queue.
                      </div>
                      <div className={styles.actions}>
                        <button
                          className={`${styles.btn} ${l.aiSuggestion === 'approve' && l.status === 'pending' ? styles.suggested : ''}`}
                          disabled={deciding === l.id}
                          onClick={() => decide(l.id, 'approved')}
                        >
                          {l.status === 'approved' ? 'Confirm approval' : 'Approve & notify'}
                        </button>
                        <button
                          className={`${styles.btn} ${styles.btnReject} ${l.aiSuggestion === 'reject' && l.status === 'pending' ? styles.suggested : ''}`}
                          disabled={deciding === l.id}
                          onClick={() => decide(l.id, 'rejected')}
                        >
                          {l.status === 'rejected' ? 'Confirm rejection' : 'Reject & notify'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                  ))}
                </section>
              ))
            )}
          </div>
        </>
      ) : (
        <div className={styles.gate}>
          <h1 className={styles.serif}>Review console</h1>
          {stage === 'loading' && <p>Checking your session…</p>}

          {stage === 'email' && (
            <>
              <p>Sign in with your admin email and password to review essay submissions.</p>
              <input
                className={styles.input}
                type="email"
                placeholder="you@example.com"
                value={email}
                autoComplete="email"
                spellCheck={false}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                className={styles.input}
                type="password"
                placeholder="Password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !busy && email && password && passwordLogin()}
              />
              <div className={styles.err}>{err}</div>
              <button
                className={`${styles.btn} ${styles.full}`}
                disabled={busy || !email || !password}
                onClick={passwordLogin}
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
