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
  // True for a check that only takes notes. It never voted, so a failing
  // advisory row did NOT flag this listing and is not a reason to reject one:
  // it is something to ask the seller to fix (see lib/review.ts). Rendered as a
  // note rather than a FAIL so the two are never read as the same thing.
  advisory: boolean;
};
type Listing = {
  id: string;
  school: string;
  gradYear: string | null;
  major: string | null;
  appliedMajors: string | null;
  admitTags: string[];
  // One row per distinct school claimed. `missing` means no proof row exists at
  // all: the listing predates proof-of-admission, so nobody ever asked.
  admitProofs: {
    id: string | null;
    school: string;
    status: 'missing' | 'pending' | 'verified' | 'rejected';
    adminNote: string | null;
    pdfUrl: string | null;
    // The review panel's read of the letter. Advisory: it never sets `status`.
    aiGenuine: boolean | null;
    aiNote: string | null;
    aiCheckedAt: string | null;
  }[];
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
  savedAt: string | null; // your own shelf marker - invisible to the seller
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
// Three tabs. The first two answer "whose turn is it" - yours, or already
// settled - and the sections inside answer "what was decided". The third is your
// own shelf. The console used to have seven tabs that sliced the same listings
// several ways at once (two of them showed the identical 19), which made it read
// as more state than there is.
type Filter = 'needsReview' | 'reviewed' | 'saved';

// --- What the AI said -------------------------------------------------------
// The panel found nothing wrong. With auto-approve off (AUTO_APPROVE in
// app/api/cron/review/route.ts) this does NOT mean the listing is live; it means
// the panel would have cleared it and is waiting on you.
const aiApproved = (l: Listing) => l.aiDecision === 'approved';
const aiFlagged = (l: Listing) => l.aiDecision === 'flagged';

// What the expand toggle says it holds. Lenses and notes are counted apart
// because they mean different things: a lens can flag the listing, a note
// cannot. Calling six rows "6 lenses" would claim two more things voted than
// actually did.
function lensSummary(lenses: Lens[]): string {
  const notes = lenses.filter((x) => x.advisory).length;
  const voting = lenses.length - notes;
  const parts = [`${voting} lens${voting === 1 ? '' : 'es'}`];
  if (notes > 0) parts.push(`${notes} note${notes === 1 ? '' : 's'}`);
  return parts.join(', ');
}

// --- Whose turn it is -------------------------------------------------------
// Shelved by you. It takes a listing OUT of the other tabs - that's the point of
// saving it, otherwise it sits in the queue you're trying to clear - so every
// other predicate here excludes it and the three tabs stay disjoint.
const saved = (l: Listing) => !!l.savedAt;
// Screened by the panel and still pending: it has had its say, you haven't.
const needsReview = (l: Listing) => !saved(l) && !!l.aiReviewedAt && l.status === 'pending';
// Settled by a human, whichever way it went.
const reviewed = (l: Listing) => !saved(l) && (l.status === 'approved' || l.status === 'rejected');
// Submitted, but the cron hasn't screened it yet. Deliberately NOT a tab: there
// is nothing for you to do with these, you're waiting on the nightly run. It
// renders as a plain count beside the tabs so the number stays visible.
const awaitingAi = (l: Listing) => !saved(l) && l.status === 'pending' && !l.aiReviewedAt;

// How the seller chose to be credited publicly, in words. The stored value is a
// bare enum ('anonymous' | 'firstName' | 'full') which reads as noise on a card.
const ANONYMITY_LABEL: Record<string, string> = {
  anonymous: 'Anonymous — name hidden from buyers',
  firstName: 'First name only',
  full: 'Full name shown to buyers',
};
const anonymityLabel = (v: string) => ANONYMITY_LABEL[v] ?? v;

const TABS: { key: Filter; label: string; match: (l: Listing) => boolean }[] = [
  { key: 'needsReview', label: 'Needs your review', match: needsReview },
  { key: 'reviewed', label: 'Reviewed', match: reviewed },
  { key: 'saved', label: 'Saved for later', match: saved },
];

// The sections inside each tab. Two apiece, and they partition their tab
// exactly - every listing the tab matches lands in one of them, so nothing can
// be in the tab yet invisible inside it.
const SECTIONS: Record<Filter, { key: string; label: string; match: (l: Listing) => boolean }[]> = {
  needsReview: [
    { key: 'aiApproved', label: '✓ Approved by AI', match: aiApproved },
    { key: 'aiFlagged', label: '⚑ Flagged by AI', match: aiFlagged },
  ],
  reviewed: [
    { key: 'accepted', label: 'Accepted', match: (l) => l.status === 'approved' },
    { key: 'rejected', label: 'Rejected', match: (l) => l.status === 'rejected' },
  ],
  // The shelf holds both kinds: something you couldn't call yet, and something
  // you decided but want to come back to. Splitting them says which is which
  // without having to read each card's status badge.
  saved: [
    { key: 'savedOpen', label: 'Still undecided', match: (l) => l.status === 'pending' },
    { key: 'savedDone', label: 'Already decided', match: (l) => l.status !== 'pending' },
  ],
};

// Tab badges are plain totals now. The old badges counted "what still wants your
// attention", which differed from the tab's own contents and meant a tab could
// read 0 while listing rows - one more thing to hold in your head.
const badgeCount = (key: Filter, listings: Listing[]): number =>
  listings.filter(TABS.find((t) => t.key === key)!.match).length;

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
    admitProofs: [
      { id: 'proof-stanford', school: 'Stanford', status: 'verified', adminNote: null, pdfUrl: MOCK_PDF , aiGenuine: null, aiNote: null, aiCheckedAt: null },
      { id: 'proof-mit', school: 'MIT', status: 'pending', adminNote: null, pdfUrl: MOCK_PDF, aiGenuine: true, aiNote: 'Offer of admission on MIT letterhead, names the student, dated 14 March.', aiCheckedAt: '2026-07-24T15:09:00.000Z' },
      { id: 'proof-duke', school: 'Duke', status: 'rejected', adminNote: 'Screenshot shows a portal page with no name or decision date.', pdfUrl: MOCK_PDF, aiGenuine: false, aiNote: 'Portal screenshot names no student and shows no decision text.', aiCheckedAt: '2026-07-24T15:09:00.000Z' },
    ],
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
      '[Policy & safety] The final paragraph includes what appears to be a personal Instagram handle.\n[Anonymity] The header of essay 1 reads "Jordan Rivera, Applicant ID 40118822", but this seller chose to stay anonymous.\n[Quality & fit] Essay 2 runs ~180 words over the claimed word count.\n[Note: Prompt pasted into the PDF] Essay 1 (Write a note to your future roommate.): the question is repeated as a heading above the essay.',
    aiSuggestion: 'reject',
    aiLenses: [
      { key: 'authenticity', label: 'Authenticity', pass: true, confidence: 'high', concerns: [], advisory: false },
      {
        key: 'policy',
        label: 'Policy & safety',
        pass: false,
        confidence: 'medium',
        concerns: ['The final paragraph includes what appears to be a personal Instagram handle.'],
        advisory: false,
      },
      {
        key: 'quality',
        label: 'Quality & fit',
        pass: true,
        confidence: 'medium',
        concerns: ['Essay 2 runs ~180 words over the claimed word count.'],
        advisory: false,
      },
      {
        key: 'anonymity',
        label: 'Anonymity',
        pass: false,
        confidence: 'high',
        concerns: [
          'The header of essay 1 reads "Jordan Rivera, Applicant ID 40118822", but this seller chose to stay anonymous.',
        ],
        advisory: false,
      },
      {
        key: 'promptInBody',
        label: 'Prompt pasted into the PDF',
        pass: false,
        confidence: 'high',
        concerns: [
          'Essay 1 (Write a note to your future roommate.): the question is repeated as a heading above the essay.',
        ],
        advisory: true,
      },
      {
        key: 'oneEssayPerPdf',
        label: 'One essay per PDF',
        pass: true,
        confidence: 'high',
        concerns: [],
        advisory: true,
      },
    ],
    humanReviewedAt: null,
    savedAt: null,
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
    admitProofs: [
      { id: 'proof-yale', school: 'Yale', status: 'verified', adminNote: null, pdfUrl: MOCK_PDF , aiGenuine: null, aiNote: null, aiCheckedAt: null },
      { id: 'proof-brown', school: 'Brown', status: 'verified', adminNote: null, pdfUrl: MOCK_PDF , aiGenuine: null, aiNote: null, aiCheckedAt: null },
    ],
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
    // Approved by the panel, with a packaging note. This is the case the
    // advisory split exists for: nothing here is a reason to reject, and the
    // seller still needs to be asked to split the file.
    aiReasons:
      '[Note: One essay per PDF] Essay 1 (Reflect on a community you belong to.): the file holds two essays, the second under a "Why Yale" heading on page 2.',
    aiSuggestion: 'approve',
    aiLenses: [
      { key: 'authenticity', label: 'Authenticity', pass: true, confidence: 'high', concerns: [], advisory: false },
      { key: 'policy', label: 'Policy & safety', pass: true, confidence: 'high', concerns: [], advisory: false },
      { key: 'quality', label: 'Quality & fit', pass: true, confidence: 'high', concerns: [], advisory: false },
      { key: 'anonymity', label: 'Anonymity', pass: true, confidence: 'high', concerns: [], advisory: false },
      {
        key: 'promptInBody',
        label: 'Prompt pasted into the PDF',
        pass: true,
        confidence: 'high',
        concerns: [],
        advisory: true,
      },
      {
        key: 'oneEssayPerPdf',
        label: 'One essay per PDF',
        pass: false,
        confidence: 'medium',
        concerns: [
          'Essay 1 (Reflect on a community you belong to.): the file holds two essays, the second under a "Why Yale" heading on page 2.',
        ],
        advisory: true,
      },
    ],
    humanReviewedAt: null,
    savedAt: '2026-07-25T10:00:00.000Z',
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
    admitProofs: [
      { id: 'proof-princeton', school: 'Princeton', status: 'verified', adminNote: null, pdfUrl: MOCK_PDF , aiGenuine: null, aiNote: null, aiCheckedAt: null },
    ],
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
      { key: 'authenticity', label: 'Authenticity', pass: true, confidence: 'high', concerns: [], advisory: false },
      { key: 'policy', label: 'Policy & safety', pass: true, confidence: 'high', concerns: [], advisory: false },
      { key: 'quality', label: 'Quality & fit', pass: true, confidence: 'high', concerns: [], advisory: false },
      { key: 'anonymity', label: 'Anonymity', pass: true, confidence: 'high', concerns: [], advisory: false },
      {
        key: 'promptInBody',
        label: 'Prompt pasted into the PDF',
        pass: true,
        confidence: 'high',
        concerns: [],
        advisory: true,
      },
      {
        key: 'oneEssayPerPdf',
        label: 'One essay per PDF',
        pass: true,
        confidence: 'high',
        concerns: [],
        advisory: true,
      },
    ],
    humanReviewedAt: '2026-07-22T11:02:00.000Z',
    savedAt: null,
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
    admitProofs: [
      { id: 'proof-columbia', school: 'Columbia', status: 'pending', adminNote: null, pdfUrl: MOCK_PDF , aiGenuine: null, aiNote: null, aiCheckedAt: null },
      { id: null, school: 'NYU', status: 'missing', adminNote: null, pdfUrl: null , aiGenuine: null, aiNote: null, aiCheckedAt: null },
    ],
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
    savedAt: '2026-07-28T09:30:00.000Z',
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
    admitProofs: [
      { id: null, school: 'Cornell', status: 'missing', adminNote: null, pdfUrl: null , aiGenuine: null, aiNote: null, aiCheckedAt: null },
    ],
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
        advisory: false,
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
        advisory: false,
      },
      {
        key: 'quality',
        label: 'Quality & fit',
        pass: false,
        confidence: 'high',
        concerns: ['Not on-topic for the stated prompt.'],
        advisory: false,
      },
      {
        key: 'anonymity',
        label: 'Anonymity',
        pass: false,
        confidence: 'high',
        concerns: [
          'The document opens with a full name, an email address, and a phone number for the seller.',
        ],
        advisory: false,
      },
      {
        key: 'promptInBody',
        label: 'Prompt pasted into the PDF',
        pass: true,
        confidence: 'low',
        concerns: [],
        advisory: true,
      },
      {
        key: 'oneEssayPerPdf',
        label: 'One essay per PDF',
        pass: true,
        confidence: 'low',
        concerns: [],
        advisory: true,
      },
    ],
    humanReviewedAt: '2026-07-19T17:45:00.000Z',
    savedAt: null,
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

  // Verify or reject one acceptance letter. Separate from decide() below: this
  // says whether an admit CLAIM is proven, not whether the listing is published.
  async function decideProof(proofId: string, status: 'verified' | 'rejected') {
    let note: string | undefined;
    if (status === 'rejected') {
      // The seller is shown this, so the API requires it rather than letting a
      // letter be rejected with no explanation.
      const typed = window.prompt('Why is this letter not accepted? The seller will see this.');
      if (typed == null) return;
      note = typed.trim();
      if (!note) return;
    }
    if (previewOn()) {
      setListings((ls) =>
        ls.map((l) => ({
          ...l,
          admitProofs: l.admitProofs.map((p) =>
            p.id === proofId ? { ...p, status, adminNote: note ?? null } : p,
          ),
        })),
      );
      return;
    }
    const resp = await fetch('/api/admin/admit-proof', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ proofId, status, note }),
    });
    if (!resp.ok) {
      const d = (await resp.json().catch(() => ({}))) as { error?: string };
      window.alert(d.error || 'Could not save that decision.');
      return;
    }
    await loadListings();
  }

  // Put a listing on the shelf, or take it off. Not a decision: nothing is
  // published, unpublished, or emailed. It only moves the card into the "Saved
  // for later" tab so the queue you're working through gets shorter.
  async function toggleSaved(id: string, next: boolean) {
    // Move the card immediately - it's about to leave this tab, and waiting on
    // a round-trip to see that happen makes the button feel broken.
    setListings((ls) =>
      ls.map((l) => (l.id === id ? { ...l, savedAt: next ? new Date().toISOString() : null } : l)),
    );
    if (previewOn()) return;
    const resp = await fetch('/api/admin/save-for-later', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ id, saved: next }),
    });
    // Put it back where it was rather than leaving the screen disagreeing with
    // the database.
    if (!resp.ok) await loadListings();
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

  const activeTab = TABS.find((t) => t.key === filter) ?? TABS[0];
  const shown = listings
    .filter(activeTab.match)
    // T20 sellers first. This used to be a pair of labelled panels, but the
    // decision sections below now occupy that level, and nesting T20 inside them
    // would put three headings between you and a card. As a sort it keeps the
    // prioritisation with nothing extra to read past. The urgency terms that
    // used to lead this comparison are gone: a tab is now one kind of thing, so
    // there is no mixed urgency left inside it to order by.
    .sort((a, b) => Number(b.isT20) - Number(a.isT20));

  // Everything the panel hasn't screened yet. Not a tab - there's nothing to do
  // with these - but the number belongs on screen, so it renders beside the tabs.
  const awaitingCount = listings.filter(awaitingAi).length;

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

  // The two sections inside the active tab. Grouping happens per section, so a
  // seller never straddles both. Empty sections still render their heading -
  // "none right now" is information when you are triaging, and it's how you can
  // tell "the AI approved nothing" apart from "the section isn't there".
  const panels = SECTIONS[filter].map((s) => {
    const items = shown.filter(s.match);
    return { key: s.key, label: s.label, items, groups: groupBySeller(items) };
  });

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
                {awaitingCount > 0
                  ? `${awaitingCount} waiting on the AI`
                  : `${listings.length} submission${listings.length === 1 ? '' : 's'}`}
              </span>
            </div>

            {shown.length === 0 ? (
              <div className={styles.empty}>
                {listings.length === 0
                  ? 'No submissions yet.'
                  : filter === 'needsReview'
                    ? 'Nothing is waiting on you. 🎉'
                    : filter === 'saved'
                      ? 'Nothing saved. Use “Save for later” on a card to park it here.'
                      : 'Nothing reviewed yet.'}
              </div>
            ) : (
              panels.map((panel) => (
                <div key={panel.key}>
                  <div className={styles.panelHead}>
                    <h2 className={styles.panelTitle}>{panel.label}</h2>
                    <span className={styles.panelCount}>
                      {panel.items.length} submission{panel.items.length === 1 ? '' : 's'}
                    </span>
                  </div>
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
                    // Only worth saying while it's still coming. On a listing you
                    // already settled - including the ones decided before the
                    // panel existed - "awaiting review" would be stale, not news.
                    l.status === 'pending' ? (
                      <div className={styles.aiPending}>Awaiting automated review…</div>
                    ) : null
                  ) : (
                    <div className={aiFlagged(l) ? styles.flagBox : styles.aiBox}>
                      <div className={aiFlagged(l) ? styles.flagTitle : styles.aiTitle}>
                        {/* Matches the section heading this card sits under, so
                            the two never appear to disagree. Keyed off the AI's
                            verdict, not the tab - a card keeps its label after
                            you decide, in the Reviewed tab. */}
                        {aiFlagged(l)
                          ? '⚑ Flagged by AI'
                          : aiApproved(l)
                            ? '✓ Approved by AI'
                            : 'Reviewed by the panel'}
                        {l.aiConfidence ? ` · confidence: ${l.aiConfidence}` : ''}
                        {/* Shown on every screened card now. Everything the panel
                            has seen is flagged, so this is the line that actually
                            separates "typo" from "this is not an essay". */}
                        {l.aiSuggestion ? ` · suggests ${l.aiSuggestion}` : ''}
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
                            {lensSummary(l.aiLenses)})
                          </button>
                          {openReview[l.id] && (
                            <div className={styles.lensList}>
                              {l.aiLenses.map((lens) => (
                                <div
                                  key={lens.key}
                                  className={`${styles.lensRow} ${lens.advisory ? styles.lensRowNote : ''}`}
                                >
                                  <div className={styles.lensHead}>
                                    {/* An advisory row never votes, so it never
                                        says FAIL. "NOTE" is the whole point: it
                                        found something worth fixing, and it did
                                        not hold the listing back. */}
                                    <span
                                      className={
                                        lens.advisory
                                          ? lens.pass
                                            ? styles.lensClear
                                            : styles.lensNote
                                          : lens.pass
                                            ? styles.lensPass
                                            : styles.lensFail
                                      }
                                    >
                                      {lens.advisory
                                        ? lens.pass
                                          ? 'CLEAR'
                                          : 'NOTE'
                                        : lens.pass
                                          ? 'PASS'
                                          : 'FAIL'}
                                    </span>
                                    <b>{lens.label}</b>
                                    <span className={styles.lensConf}>
                                      {lens.confidence} confidence
                                      {lens.advisory ? ' · note only, did not flag' : ''}
                                    </span>
                                  </div>
                                  {lens.concerns.length > 0 ? (
                                    <ul className={styles.lensConcerns}>
                                      {lens.concerns.map((c, i) => (
                                        <li key={i}>{c}</li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <div className={styles.lensClean}>
                                      {lens.advisory ? 'Nothing to fix.' : 'No concerns raised.'}
                                    </div>
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
                      ) : l.status === 'pending' ? (
                        // Nothing the panel screens is published until you say
                        // so, whether it approved or flagged it, so this line is
                        // the same for both.
                        <div className={styles.unaudited}>
                          Not published — approve to put it live
                        </div>
                      ) : null}
                    </div>
                  )}

                  {l.admitProofs.length > 0 && (
                    <div className={styles.proofs}>
                      <div className={styles.proofsHead}>
                        Proof of admission
                        <span>
                          {l.admitProofs.filter((p) => p.status === 'verified').length} of{' '}
                          {l.admitProofs.length} verified
                        </span>
                      </div>
                      {l.admitProofs.map((p) => (
                        <div key={p.school} className={styles.proofRow}>
                          <span className={styles.proofSchool}>{p.school}</span>
                          <span className={`${styles.proofStatus} ${styles['proof_' + p.status]}`}>
                            {p.status === 'missing' ? 'never asked' : p.status}
                          </span>
                          {p.pdfUrl && (
                            <a className={styles.proofLink} href={p.pdfUrl} target="_blank" rel="noopener noreferrer">
                              View letter
                            </a>
                          )}
                          {p.id && p.pdfUrl && p.status !== 'verified' && (
                            <button
                              type="button"
                              className={styles.proofOk}
                              onClick={() => decideProof(p.id as string, 'verified')}
                            >
                              Verify
                            </button>
                          )}
                          {p.id && p.pdfUrl && p.status !== 'rejected' && (
                            <button
                              type="button"
                              className={styles.proofNo}
                              onClick={() => decideProof(p.id as string, 'rejected')}
                            >
                              Reject
                            </button>
                          )}
                          {p.aiNote && (
                            <span
                              className={`${styles.proofAi} ${p.aiGenuine ? styles.proofAiOk : styles.proofAiWarn}`}
                            >
                              <b>{p.aiGenuine ? 'AI: looks genuine' : 'AI: questionable'}</b> {p.aiNote}
                            </span>
                          )}
                          {p.adminNote && <span className={styles.proofNote}>Your note: {p.adminNote}</span>}
                        </div>
                      ))}
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

                  {/* Sits outside the decide block on purpose, so it is still
                      reachable on a listing the seller took down - the one card
                      that has no Approve/Reject row to hang off. */}
                  <div className={styles.shelfRow}>
                    <button
                      type="button"
                      className={`${styles.shelfBtn} ${saved(l) ? styles.shelfBtnOn : ''}`}
                      onClick={() => toggleSaved(l.id, !saved(l))}
                    >
                      {saved(l) ? '★ Saved for later' : '☆ Save for later'}
                    </button>
                    {saved(l) && l.savedAt && (
                      <span className={styles.shelfWhen}>
                        Shelved {new Date(l.savedAt).toLocaleDateString()}. Click to put it back.
                      </span>
                    )}
                  </div>
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
