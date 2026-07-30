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
  // Seller profile as they filled it in. `anonymity` decides what buyers see;
  // these are shown to you either way so you can sanity-check the pairing.
  sellerName: string | null;
  sellerBio: string | null;
  sellerTags: string[];
  isT20: boolean; // seller attends a Tier 1 school (lib/pricing schoolTier === 1)
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

// How the seller chose to be credited publicly, in words. The stored value is a
// bare enum ('anonymous' | 'firstName' | 'full') which reads as noise on a card.
const ANONYMITY_LABEL: Record<string, string> = {
  anonymous: 'Anonymous — name hidden from buyers',
  firstName: 'First name only',
  full: 'Full name shown to buyers',
};
const anonymityLabel = (v: string) => ANONYMITY_LABEL[v] ?? v;

// Tabs where you are deciding what to look at next, so T20 sellers are worth
// separating out. Settled tabs (approved/rejected/all) stay a flat list.
const SPLIT_TABS: Filter[] = ['needsReview', 'awaitingAi'];

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

// Dev-only visual preview. `/admin?preview=1` renders this console against the
// mock data below so the UI can be eyeballed without a session, a database, or
// a configured review panel. It is inert in a production build, and even in dev
// it only seeds client state - it never calls an API, so it grants no access to
// anything real. Decisions are no-ops while it's on.
const previewOn = () =>
  process.env.NODE_ENV === 'development' &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('preview') === '1';

// A 568-byte stand-in PDF so preview cards render a working "View PDF"
// link. Inlined rather than served from /public so no demo artifact ends up
// deployed. Real listings get short-lived signed Supabase URLs instead.
const MOCK_PDF = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNjEyIDc5Ml0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+ZW5kb2JqCjQgMCBvYmo8PC9MZW5ndGggNzI+PnN0cmVhbQpCVCAvRjEgMTYgVGYgNzIgNzAwIFRkIChTYW1wbGUgZXNzYXkgLSBhZG1pbiBjb25zb2xlIHByZXZpZXcgb25seSkgVGogRVQKZW5kc3RyZWFtZW5kb2JqCjUgMCBvYmo8PC9UeXBlL0ZvbnQvU3VidHlwZS9UeXBlMS9CYXNlRm9udC9IZWx2ZXRpY2E+PmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1MiAwMDAwMCBuIAowMDAwMDAwMTAxIDAwMDAwIG4gCjAwMDAwMDAyMTEgMDAwMDAgbiAKMDAwMDAwMDMyOCAwMDAwMCBuIAp0cmFpbGVyPDwvU2l6ZSA2L1Jvb3QgMSAwIFI+PgpzdGFydHhyZWYKMzg5CiUlRU9GCg==';

const MOCK: ListingFull[] = [
  {
    id: 'mock-1',
    school: 'Stanford University',
    gradYear: '2028',
    major: 'Symbolic Systems',
    appliedMajors: 'Computer Science, Symbolic Systems',
    admitTags: ['Stanford', 'MIT', 'Duke'],
    anonymity: 'anonymous',
    pricingMode: 'package',
    packagePrice: 45,
    status: 'pending',
    adminNote: null,
    sellerNote: 'Happy to answer questions about the roommate essay!',
    createdAt: '2026-07-24T15:04:00.000Z',
    aiReviewedAt: '2026-07-24T15:09:00.000Z',
    aiDecision: 'flagged',
    aiConfidence: 'medium',
    aiReasons:
      '[Policy & safety] The final paragraph includes what appears to be a personal Instagram handle.\n[Quality & fit] Essay 2 runs ~180 words over the claimed word count.',
    aiSuggestion: 'reject',
    aiLenses: [
      { key: 'authenticity', label: 'Authenticity', pass: true, confidence: 'high', concerns: [] },
      {
        key: 'policy',
        label: 'Policy & safety',
        pass: false,
        confidence: 'medium',
        concerns: ['The final paragraph includes what appears to be a personal Instagram handle.'],
      },
      {
        key: 'quality',
        label: 'Quality & fit',
        pass: true,
        confidence: 'medium',
        concerns: ['Essay 2 runs ~180 words over the claimed word count.'],
      },
    ],
    humanReviewedAt: null,
    sellerEmail: 'j.rivera@example.edu',
    isTest: false,
    sellerName: 'Jordan Rivera',
    sellerBio: 'CS major who fell into linguistics by accident. Happy to share what worked.',
    sellerTags: ['First-generation', 'STEM'],
    isT20: true,
    essays: [
      {
        id: 'm1e1',
        prompt: 'Roommate letter',
        question: 'Write a note to your future roommate.',
        price: null,
        wordCount: 250,
        pdfPath: 'mock/1.pdf',
        pdfUrl: MOCK_PDF,
      },
      {
        id: 'm1e2',
        prompt: 'What matters to you',
        question: 'What matters to you, and why?',
        price: null,
        wordCount: 250,
        pdfPath: 'mock/2.pdf',
        pdfUrl: MOCK_PDF,
      },
    ],
  },
  {
    id: 'mock-2',
    school: 'Yale University',
    gradYear: '2027',
    major: 'History',
    appliedMajors: 'History',
    admitTags: ['Yale', 'Brown'],
    anonymity: 'firstName',
    pricingMode: 'separate',
    packagePrice: null,
    status: 'approved',
    adminNote: null,
    sellerNote: null,
    createdAt: '2026-07-23T09:12:00.000Z',
    aiReviewedAt: '2026-07-23T09:15:00.000Z',
    aiDecision: 'approved',
    aiConfidence: 'high',
    aiReasons: null,
    aiSuggestion: 'approve',
    aiLenses: [
      { key: 'authenticity', label: 'Authenticity', pass: true, confidence: 'high', concerns: [] },
      { key: 'policy', label: 'Policy & safety', pass: true, confidence: 'high', concerns: [] },
      { key: 'quality', label: 'Quality & fit', pass: true, confidence: 'high', concerns: [] },
    ],
    humanReviewedAt: null,
    sellerEmail: 'amara.k@example.edu',
    isTest: false,
    sellerName: 'Amara K.',
    sellerBio: 'Wrote about my grandmother\u2019s kitchen and somehow it worked.',
    sellerTags: ['Low-income', 'Humanities'],
    isT20: true,
    essays: [
      {
        id: 'm2e1',
        prompt: 'Community essay',
        question: 'Reflect on a community you belong to.',
        price: 20,
        wordCount: 400,
        pdfPath: 'mock/3.pdf',
        pdfUrl: MOCK_PDF,
      },
    ],
  },
  {
    id: 'mock-3',
    school: 'Princeton University',
    gradYear: '2028',
    major: 'Molecular Biology',
    appliedMajors: 'Molecular Biology',
    admitTags: ['Princeton'],
    anonymity: 'anonymous',
    pricingMode: 'package',
    packagePrice: 35,
    status: 'approved',
    adminNote: 'Looks great — nice work.',
    sellerNote: null,
    createdAt: '2026-07-21T18:40:00.000Z',
    aiReviewedAt: '2026-07-21T18:44:00.000Z',
    aiDecision: 'approved',
    aiConfidence: 'high',
    aiReasons: null,
    aiSuggestion: 'approve',
    aiLenses: [
      { key: 'authenticity', label: 'Authenticity', pass: true, confidence: 'high', concerns: [] },
      { key: 'policy', label: 'Policy & safety', pass: true, confidence: 'high', concerns: [] },
      { key: 'quality', label: 'Quality & fit', pass: true, confidence: 'high', concerns: [] },
    ],
    humanReviewedAt: '2026-07-22T11:02:00.000Z',
    sellerEmail: 'dpatel@example.edu',
    isTest: false,
    sellerName: 'Dev Patel',
    sellerBio: null,
    sellerTags: ['Transfer student'],
    isT20: true,
    essays: [
      {
        id: 'm3e1',
        prompt: 'Extracurricular',
        question: null,
        price: null,
        wordCount: 150,
        pdfPath: 'mock/4.pdf',
        pdfUrl: MOCK_PDF,
      },
    ],
  },
  {
    id: 'mock-4',
    school: 'Arizona State University',
    gradYear: '2029',
    major: null,
    appliedMajors: 'Undecided',
    admitTags: ['Columbia', 'NYU'],
    anonymity: 'anonymous',
    pricingMode: 'package',
    packagePrice: 30,
    status: 'pending',
    adminNote: null,
    sellerNote: null,
    createdAt: '2026-07-27T08:02:00.000Z',
    aiReviewedAt: null,
    aiDecision: null,
    aiConfidence: null,
    aiReasons: null,
    aiSuggestion: null,
    aiLenses: [],
    humanReviewedAt: null,
    sellerEmail: 'sofia.l@example.edu',
    isTest: false,
    sellerName: 'Sofia L.',
    sellerBio: 'Debate kid turned public-health nerd.',
    sellerTags: ['First-generation'],
    isT20: false,
    essays: [
      {
        id: 'm4e1',
        prompt: 'Why Columbia',
        question: null,
        price: null,
        wordCount: 200,
        pdfPath: 'mock/5.pdf',
        pdfUrl: MOCK_PDF,
      },
    ],
  },
  {
    id: 'mock-5',
    school: 'Boston University',
    gradYear: '2027',
    major: 'Hotel Administration',
    appliedMajors: 'Hotel Administration',
    admitTags: ['Cornell'],
    anonymity: 'anonymous',
    pricingMode: 'package',
    packagePrice: 25,
    status: 'rejected',
    adminNote: 'The uploaded file was a resume, not an essay. Please re-upload.',
    sellerNote: null,
    createdAt: '2026-07-19T13:20:00.000Z',
    aiReviewedAt: '2026-07-19T13:25:00.000Z',
    aiDecision: 'flagged',
    aiConfidence: 'high',
    aiReasons: '[Policy & safety] The attached PDF is a résumé, not a college-admission essay.',
    aiSuggestion: 'reject',
    aiLenses: [
      {
        key: 'authenticity',
        label: 'Authenticity',
        pass: false,
        confidence: 'high',
        concerns: ['Document is not a first-person narrative essay.'],
      },
      {
        key: 'policy',
        label: 'Policy & safety',
        pass: false,
        confidence: 'high',
        concerns: [
          'The attached PDF is a résumé, not a college-admission essay.',
          'Contains a home address and phone number.',
        ],
      },
      {
        key: 'quality',
        label: 'Quality & fit',
        pass: false,
        confidence: 'high',
        concerns: ['Not on-topic for the stated prompt.'],
      },
    ],
    humanReviewedAt: '2026-07-19T17:45:00.000Z',
    sellerEmail: 'mchen@example.edu',
    isTest: false,
    sellerName: null,
    sellerBio: null,
    sellerTags: [],
    isT20: false,
    essays: [
      {
        id: 'm5e1',
        prompt: 'Why this major',
        question: null,
        price: null,
        wordCount: 300,
        pdfPath: 'mock/6.pdf',
        pdfUrl: MOCK_PDF,
      },
    ],
  },
];

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

  // On mount, check whether we already have a valid admin session. In dev
  // preview mode, skip the session entirely and render the mock data instead.
  useEffect(() => {
    if (previewOn()) {
      setListings(MOCK);
      setStage('console');
      return;
    }
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
    // Preview renders against mock data with no backend - never post a decision.
    if (previewOn()) {
      setListings((ls) =>
        ls.map((l) =>
          l.id === id
            ? {
                ...l,
                status: decision,
                adminNote: (notes[id] || '').trim() || null,
                humanReviewedAt: new Date().toISOString(),
              }
            : l,
        ),
      );
      return;
    }
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
    // haven't signed off on, then sellers at a T20; the seller grouping below
    // preserves this order, so their groups bubble up too. T20 is last so it
    // orders within equal urgency rather than pushing a T20 that is already
    // settled above something that actually needs a decision.
    .sort(
      (a, b) =>
        Number(needsReview(b)) - Number(needsReview(a)) ||
        Number(unaudited(b)) - Number(unaudited(a)) ||
        Number(b.isT20) - Number(a.isT20),
    );

  // Group by seller so it's obvious which submissions belong to the same
  // person (order of first appearance is preserved - newest sellers first).
  function groupBySeller(items: ListingFull[]) {
    const groups: { email: string; isTest: boolean; items: ListingFull[] }[] = [];
    for (const l of items) {
      const g = groups.find((s) => s.email === l.sellerEmail);
      if (g) g.items.push(l);
      else groups.push({ email: l.sellerEmail, isTest: l.isTest, items: [l] });
    }
    return groups;
  }

  // On the review tabs, split into two panels so T20 sellers are the first
  // thing you work through. Grouping happens per panel, so a seller never
  // straddles both. Empty panels still render their heading - "none right now"
  // is information when you are triaging.
  const panels = SPLIT_TABS.includes(filter)
    ? [
        { key: 't20', label: 'Going to a T20 school', items: shown.filter((l) => l.isT20) },
        { key: 'other', label: 'Not going to a T20 school', items: shown.filter((l) => !l.isT20) },
      ].map((p) => ({ ...p, groups: groupBySeller(p.items) }))
    : [{ key: 'all', label: null, items: shown, groups: groupBySeller(shown) }];

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
              panels.map((panel) => (
                <div key={panel.key}>
                  {panel.label && (
                    <div className={styles.panelHead}>
                      <h2 className={styles.panelTitle}>
                        {panel.key === 't20' && <span className={styles.t20Badge}>T20</span>}
                        {panel.label}
                      </h2>
                      <span className={styles.panelCount}>
                        {panel.items.length} submission{panel.items.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  )}
                  {panel.items.length === 0 ? (
                    <div className={styles.panelEmpty}>None right now.</div>
                  ) : (
                    panel.groups.map((g) => (
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
                        {l.isT20 && <span className={styles.t20Badge}>T20</span>}
                        {l.school}
                        {l.gradYear ? ` · Class of ${l.gradYear}` : ''}
                      </h3>
                      <div className={styles.who}>
                        {l.major ? `${l.major} · ` : ''}
                        <span className={styles.anonTag}>{anonymityLabel(l.anonymity)}</span>
                      </div>
                      {/* What the seller wrote about themselves. Shown to you no
                          matter their anonymity choice - that choice governs the
                          public listing, not your review. */}
                      {(l.sellerName || l.sellerBio || l.sellerTags.length > 0) && (
                        <div className={styles.profile}>
                          {l.sellerName && (
                            <div className={styles.profileName}>{l.sellerName}</div>
                          )}
                          {l.sellerTags.length > 0 && (
                            <div className={styles.profileTags}>
                              {l.sellerTags.map((t) => (
                                <span key={t} className={styles.profileTag}>
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                          {l.sellerBio && <div className={styles.profileBio}>{l.sellerBio}</div>}
                        </div>
                      )}
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
