'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import LogoBadge, { universityLogoSrc } from '@/components/LogoBadge';
import MatchFinder from '@/components/MatchFinder';
import EmbeddedListingCheckout from '@/components/EmbeddedListingCheckout';
import { TIER, admitsTier, packageFloor, perEssayFloor, schoolTier, SELLER_SHARE } from '@/lib/pricing';
import { schoolKey } from '@/lib/admitProof';
import { nationalUniversityRank, SCHOOL_OPTIONS, schoolInfo, schoolShortName, schoolColor, sameSchool } from '@/lib/schools';
import { PROFILE_TAGS } from '@/lib/site';
import type { Anonymity } from '@/lib/anonymity';
import { catalogSchool, listingHeadline as resolveListingHeadline } from '@/lib/listingSchool';
import { spreadRepeatedKeys } from '@/lib/listingOrder';

/* ============================================================================
   Types & static data
   ==========================================================================*/

type Essay = {
  id: number;
  school: string;
  domain: string;
  letter: string;
  color: string;
  year: string;
  major: string;
  prompt: string;
  hook: string;
  price: string;
  rating: string;
  words: number;
  cats: string[];
  sellerTags: string[];
};

// diyShort/agencyShort: one-line variants for the mobile card chart.
type CmpRow = { feature: string; mineText?: string; diy: string; agency: string; diyShort?: string; agencyShort?: string };

type Msg = { text: string; kind: '' | 'ok' | 'err' };

// Launch switch: "1" turns on the real public catalog + Stripe buying.
// Unset/off keeps the pre-launch waitlist experience byte-for-byte.
const LAUNCHED = process.env.NEXT_PUBLIC_LAUNCH === '1';

type BrowseView = 'cards' | 'rows';

type PublicListing = {
  id: string;
  school: string;
  targetSchool?: string | null;
  headlineSchool?: string;
  applicationSystem?: string | null;
  admitTags: string[];
  // The subset of admitTags backed by an acceptance letter a human checked.
  // /api/listings has always computed this; the client never declared it, so
  // buyers have never seen the distinction between a claimed and a proven admit.
  verifiedAdmitTags?: string[];
  price: number | null;
  teaser: string | null;
  // A safe first sentence read from one of this listing's own PDFs. This is the
  // card title; teaser is only a fallback/secondary seller summary.
  openingLine?: string | null;
  appliedMajors: string | null;
  major?: string | null;
  createdAt: string;
  essays: { prompt: string; question: string | null; wordCount: number | null }[];
  seller: { displayName: string; backgroundTags: string[]; anonymity?: Anonymity };
  otherListingIds?: string[];
};

type AnonMode = 'anonymous' | 'reveal' | 'public';
type PricingMode = 'package' | 'separate';

type EssayRow = { prompt: string; question: string; fileName: string; file: File | null; price: string };

async function fileSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Real dashboard data from /api/seller/listings.
type SellerEssay = {
  id: string;
  prompt: string;
  question: string | null;
  price: number | null;
  sales: number;
  gross: number;
  grossCents?: number;
  sellerEarningsCents?: number;
  platformFeeCents?: number;
  stripeProcessingFeeCents?: number;
};
type SellerListing = {
  id: string;
  school: string;
  targetSchool?: string | null;
  applicationSystem?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'removed';
  pricingMode: string;
  packagePrice: number | null;
  admitTags: string[];
  adminNote: string | null;
  createdAt: string;
  sales: number;
  gross: number;
  grossCents?: number;
  sellerEarningsCents?: number;
  platformFeeCents?: number;
  stripeProcessingFeeCents?: number;
  essays: SellerEssay[];
};

type SellerAccounting = {
  allTimeGrossCents: number;
  allTimeSellerEarningsCents: number;
  allTimePlatformFeeCents: number;
  allTimeStripeProcessingFeeCents: number;
  monthGrossCents: number;
  monthSellerEarningsCents: number;
  monthPlatformFeeCents: number;
  monthStripeProcessingFeeCents: number;
};

type SellerPayouts = {
  status: 'not_eligible' | 'setup_required' | 'in_review' | 'ready';
  setupAvailable: boolean;
  liveSaleCount: number;
  pendingCents: number;
  paidCents: number;
  accountingPendingCount?: number;
};

const essays: Essay[] = [
  { id: 1, school: 'Stanford', domain: 'stanford.edu', letter: 'S', color: '#8C1515', year: "'27", major: 'Electrical Engineering', prompt: 'Common App · Personal Statement', hook: "The summer I taught my grandfather's old radio to sing again.", price: '$14', rating: '4.9', words: 648, cats: ['Common App', 'STEM'], sellerTags: ['First-generation', 'Rural hometown'] },
  { id: 2, school: 'Yale', domain: 'yale.edu', letter: 'Y', color: '#00356B', year: "'26", major: 'History', prompt: 'Why Yale · Supplement', hook: 'I found home in the margins of a 200-year-old library book.', price: '$12', rating: '4.8', words: 412, cats: ['Supplements', 'Humanities'], sellerTags: ['Transfer student'] },
  { id: 3, school: 'Princeton', domain: 'princeton.edu', letter: 'P', color: '#E77500', year: "'27", major: 'Public Policy', prompt: 'Activity · Supplement', hook: 'What four years of debate taught me about finally listening.', price: '$11', rating: '4.9', words: 215, cats: ['Supplements', 'Humanities'], sellerTags: [] },
  { id: 4, school: 'Harvard', domain: 'harvard.edu', letter: 'H', color: '#A51C30', year: "'25", major: 'Sociology', prompt: 'Common App · Personal Statement', hook: 'Translating for my mother at the DMV, one form at a time.', price: '$15', rating: '5.0', words: 655, cats: ['Common App', 'Humanities'], sellerTags: ['First-generation', 'Immigrant family'] },
  { id: 5, school: 'MIT', domain: 'mit.edu', letter: 'M', color: '#A31F34', year: "'27", major: 'Mechanical Engineering', prompt: 'MIT · The Pleasure Essay', hook: 'Why I still take apart every vacuum cleaner I can find.', price: '$13', rating: '4.7', words: 248, cats: ['Supplements', 'STEM'], sellerTags: ['Worked through school'] },
  { id: 6, school: 'Columbia', domain: 'columbia.edu', letter: 'C', color: '#1D4F91', year: "'26", major: 'Economics', prompt: 'Why Columbia · Supplement', hook: 'The corner bodega that taught me everything about scarcity.', price: '$12', rating: '4.8', words: 300, cats: ['Supplements', 'Humanities'], sellerTags: ['Low-income background', 'Immigrant family'] },
];

const comparisonRows: CmpRow[] = [
  { feature: 'Every essay from a verified admit', diy: 'Reddit threads, often outdated', diyShort: 'Outdated Reddit threads', agency: "One counselor's experience", agencyShort: 'One counselor' },
  { feature: 'Browse by school, prompt & major', diy: 'Hours of Googling', agency: 'Limited to their network' },
  { feature: 'See exactly why each essay worked', diy: 'Pure guesswork', agency: 'Generic frameworks' },
  { feature: 'Margin notes on voice & structure', diy: 'None', agency: 'Sometimes' },
  { feature: 'Read the full text in minutes', diy: 'n/a', agency: 'Weeks of back-and-forth', agencyShort: 'Weeks of waiting' },
  { feature: 'Cost to get started', mineText: 'Up to 80% cheaper', diy: 'Free, unreliable', agency: '$200+ / hour' },
];

const chipLabels = ['All', 'Common App', 'Supplements', 'STEM', 'Humanities'];

const promptOptions = [
  'Common App · Personal Statement',
  'UC · Personal Insight Question',
  'Why-school · Supplement',
  'Activity / Extracurricular · Supplement',
  'Community / Identity · Supplement',
  'Intellectual vitality · Supplement',
  'Short answer',
  'Other supplement',
];

type ReqInfo = { count: number; name: string; text: string };
const reqMap: Record<string, ReqInfo> = {
  commonapp: { count: 1, name: 'essays', text: 'Common App is used by 900+ schools. Add the <b>personal statement plus every school-specific supplement</b> you wrote for the school(s) you got into.' },
  coalition: { count: 1, name: 'essays', text: 'Coalition App is used by 150+ schools. Add your <b>Coalition essay and every school-specific supplement</b> for the school(s) you got into.' },
  uc: { count: 4, name: 'Personal Insight Questions (PIQs)', text: 'UC applications require exactly <b>4 Personal Insight Questions (PIQs)</b>. Add all 4 so buyers get the complete set.' },
  mit: { count: 5, name: 'short essays', text: "MIT's own portal uses <b>several short essays</b>. None of these overlap with Common App. Add every essay so buyers see the full application." },
  other: { count: 1, name: 'essays', text: "Add every essay from this school's own application: personal statement, short answers, and any supplements." },
};

const appLabels: Record<string, string> = { commonapp: 'Common App', coalition: 'Coalition App', uc: 'UC Application', mit: 'MIT Application', other: 'Other single school' };

// Map the prototype's 3-way anonymity choice onto the API contract. `reveal`
// is "Anonymous until bought", so it must NOT map onto a value that names the
// seller on the public listing - see lib/anonymity.ts.
const anonApiValue: Record<AnonMode, Anonymity> = {
  anonymous: 'anonymous',
  reveal: 'revealOnPurchase',
  public: 'full',
};

/* ---- Smart pricing engine: see lib/pricing.ts (shared with the server) ---- */

/* ---- Dashboard ---- */
// SELLER_SHARE is imported from lib/pricing, not redeclared here. This file and
// the Stripe webhook quote the same seller the same money - the dashboard total
// and the "you earned" line - so they must read one constant, not two copies
// that can drift apart.
const listingPrice = (l: SellerListing) =>
  l.packagePrice ?? l.essays.reduce((sum, e) => sum + (e.price || 0), 0);
const sellerListingSchool = (l: SellerListing) => catalogSchool(l);
const listingTitle = (l: SellerListing) => {
  const titleSchool = resolveListingHeadline({ ...l, essays: l.essays });
  return l.essays.length === 1
    ? `${l.essays[0].question || l.essays[0].prompt} · ${titleSchool}`
    : `${titleSchool} · ${l.essays.length} essays`;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => '$' + round2(n).toFixed(2);

const eduRe = /^[^@\s]+@[^@\s]+\.edu$/i;
const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const isLocalHost = () => typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);

const WAITLIST_MSG_OK_NEW = "You're on the list! We'll email you the moment essays go live. 💌";
const WAITLIST_MSG_OK_DUP = "You're already on the list. We'll be in touch! 💌";

const newEssayRow = (): EssayRow => ({ prompt: '', question: '', fileName: '', file: null, price: '' });

/* ============================================================================
   Page component
   ==========================================================================*/

export default function Page() {
  /* ---- Featured grid filter (chips are hidden but state preserved) ---- */
  const [filter, setFilter] = useState('All');
  const gridEssays = filter === 'All' ? essays : essays.filter((e) => e.cats.includes(filter));

  /* ---- Public catalog (only fetched in launch mode) ---- */
  const [pubListings, setPubListings] = useState<PublicListing[]>([]);
  const [pubState, setPubState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [browseView, setBrowseView] = useState<BrowseView>('cards');
  const [searchQuery, setSearchQuery] = useState('');
  const [pageView, setPageView] = useState<'home' | 'browse'>('home');
  const [matcherOpen, setMatcherOpen] = useState(false);
  const [matchIds, setMatchIds] = useState<string[] | null>(null);
  const [matchLabel, setMatchLabel] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // A tab that stays open through a Vercel deployment keeps its old JavaScript
  // until it reloads. Check the currently deployed commit on focus and surface
  // that state explicitly instead of letting an old card design look live.
  useEffect(() => {
    const loadedVersion = document
      .querySelector<HTMLMetaElement>('meta[name="admitfolio-build"]')
      ?.content;
    if (!loadedVersion || loadedVersion === 'local') return;
    let stopped = false;

    const checkVersion = async () => {
      try {
        const response = await fetch(`/api/version?t=${Date.now()}`, { cache: 'no-store' });
        const data = (await response.json()) as { version?: string };
        if (!stopped && data.version && data.version !== 'local' && data.version !== loadedVersion) {
          setUpdateAvailable(true);
        }
      } catch {
        // An update check must never interrupt browsing or checkout.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkVersion();
    };
    void checkVersion();
    window.addEventListener('focus', checkVersion);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(checkVersion, 5 * 60 * 1000);
    return () => {
      stopped = true;
      window.removeEventListener('focus', checkVersion);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, []);

  /* ---- Paging ----
     24 at a time: a whole number of rows at all three breakpoints (3 columns,
     2 and 1), so a page never ends on a ragged half-row. The API sends the whole
     catalogue in one 19 KB response, so this is purely about how much is put in
     front of a buyer at once, not about network cost. */
  const PAGE_SIZE = 24;
  const [shown, setShown] = useState(PAGE_SIZE);
  const moreRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<number | null>(null);

  // Reordering the grid invalidates how far down it you had read.
  useEffect(() => setShown(PAGE_SIZE), [searchQuery, matchIds]);

  const loadMore = useCallback(() => {
    anchorRef.current = moreRef.current?.getBoundingClientRect().top ?? null;
    setShown((s) => s + PAGE_SIZE);
  }, []);

  // Keep the first newly revealed card where the button just was, so the page
  // does not jump and you carry on reading from the same place.
  useEffect(() => {
    if (anchorRef.current == null) return;
    const cards = document.querySelectorAll('.public-grid .catalog-card');
    const first = cards[shown - PAGE_SIZE] as HTMLElement | undefined;
    if (first) window.scrollBy(0, first.getBoundingClientRect().top - anchorRef.current);
    anchorRef.current = null;
  }, [shown]);

  /* ---- Listing detail sheet ----
     Kept in the URL as ?listing=<id> so a listing can be linked and the back
     button closes the sheet. Same trick the ?login deep-link already uses, and
     it means this works without a route while the catalogue lives in client
     state. If it ever needs server rendering, ListingDetail is pure and can move
     to /listing/[id] unchanged. */
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailListing = useMemo(
    () => pubListings.find((l) => l.id === detailId) || null,
    [pubListings, detailId],
  );

  const openDetail = useCallback((id: string) => {
    setDetailId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('listing', id);
    window.history.pushState({ listing: id }, '', url);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('listing');
    window.history.pushState({}, '', url);
  }, []);

  // Open from the URL once the catalogue has arrived, so a shared link lands on
  // the right listing rather than an empty sheet.
  useEffect(() => {
    if (!LAUNCHED || !pubListings.length) return;
    const id = new URLSearchParams(window.location.search).get('listing');
    if (id && pubListings.some((l) => l.id === id)) setDetailId(id);
  }, [pubListings]);

  useEffect(() => {
    function onPop() {
      setDetailId(new URLSearchParams(window.location.search).get('listing'));
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Browse starts with the exact 2026 National Universities rank when
  // available. Schools outside that top 50 retain the broader pricing tier as
  // a fallback. The ranked results are then spread so one university cannot
  // monopolize the opening rows; order within one university stays stable.
  const matchingListings = useMemo(() => {
    const candidates = matchIds ? pubListings.filter((listing) => matchIds.includes(listing.id)) : pubListings;
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return candidates;
    return candidates.filter((listing) => {
      const searchable = [
        headlineSchool(listing),
        listing.school,
        listing.applicationSystem,
        listing.appliedMajors,
        listing.major,
        listing.teaser,
        listing.openingLine,
        ...listing.admitTags,
        ...listing.seller.backgroundTags,
        ...listing.essays.flatMap((essay) => [essay.prompt, essay.question]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();
      return searchable.includes(query);
    });
  }, [pubListings, searchQuery, matchIds]);

  const sortedListings = useMemo(() => {
    const ranked = [...matchingListings].sort(compareListingRank);
    return spreadRepeatedKeys(ranked, listingSchoolKey);
  }, [matchingListings]);
  const featuredListings = useMemo(() => {
    const priorityDomains = ['harvard.edu', 'stanford.edu', 'yale.edu', 'columbia.edu', 'upenn.edu', 'uchicago.edu'];
    const ranked = [...pubListings].sort(compareListingRank);
    const picked: PublicListing[] = [];
    const usedSchools = new Set<string>();
    const add = (listing: PublicListing | undefined) => {
      if (!listing) return;
      const school = headlineSchool(listing);
      const key = schoolInfo(school)?.domain || school.toLowerCase().trim();
      if (usedSchools.has(key)) return;
      usedSchools.add(key);
      picked.push(listing);
    };
    priorityDomains.forEach((domain) => add(ranked.find((listing) => schoolInfo(headlineSchool(listing))?.domain === domain)));
    ranked.forEach((listing) => { if (picked.length < 6) add(listing); });
    return picked.slice(0, 6);
  }, [pubListings]);
  useEffect(() => {
    if (!LAUNCHED) return;
    fetch('/api/listings')
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as { listings?: PublicListing[] };
        if (!r.ok || !d.listings) throw new Error('bad response');
        setPubListings(d.listings);
        setPubState('ready');
      })
      .catch(() => setPubState('error'));
  }, []);

  useEffect(() => {
    if (!LAUNCHED) return;
    const syncPage = () => setPageView(window.location.hash === '#browse' ? 'browse' : 'home');
    syncPage();
    window.addEventListener('hashchange', syncPage);
    window.addEventListener('popstate', syncPage);
    return () => {
      window.removeEventListener('hashchange', syncPage);
      window.removeEventListener('popstate', syncPage);
    };
  }, []);

  const openBrowse = useCallback(() => {
    setPageView('browse');
    if (window.location.hash !== '#browse') window.history.pushState(window.history.state, '', '#browse');
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }, []);

  const openFeatured = useCallback(() => {
    setMatchIds(null);
    setMatchLabel('');
    setSearchQuery('');
    setPageView('home');
    if (window.location.hash !== '#featured') window.history.pushState(window.history.state, '', '#featured');
    requestAnimationFrame(() => document.getElementById('featured')?.scrollIntoView({ behavior: 'smooth' }));
  }, []);

  const openMatcher = useCallback(() => {
    setPageView('browse');
    if (window.location.hash !== '#browse') window.history.pushState(window.history.state, '', '#browse');
    setMatcherOpen(true);
  }, []);

  /* ---- Which overlays are open (drives body scroll lock) ---- */
  const [sellOpen, setSellOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [wlOpen, setWlOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [dashOpen, setDashOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  /* ============================ Sell onboarding ============================ */
  const [sellStep, setSellStep] = useState(1);
  const [eduEmail, setEduEmail] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [codeErr, setCodeErr] = useState('');
  const [emailToken, setEmailToken] = useState('');
  const [signupPw, setSignupPw] = useState('');
  const [signupPw2, setSignupPw2] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [currentUni, setCurrentUni] = useState('');
  const [currentMajor, setCurrentMajor] = useState('');
  const [uniErr, setUniErr] = useState('');
  const [anonMode, setAnonMode] = useState<AnonMode>('public');
  const [applicationType, setApplicationType] = useState('');
  const [listingSchool, setListingSchool] = useState('');
  const [admits, setAdmits] = useState<string[]>([]);
  const [admitInput, setAdmitInput] = useState('');
  const [admitFocus, setAdmitFocus] = useState(false);
  const [essayRows, setEssayRows] = useState<EssayRow[]>([newEssayRow()]);
  // One acceptance letter per school claimed in `admits`, keyed by the same
  // normalised key the server uses, so "Tufts" and "Tufts University" ask once.
  const [admitFiles, setAdmitFiles] = useState<Record<string, File | null>>({});
  // Distinct schools needing a letter, in the order the seller typed them.
  const admitProofRows = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; label: string }[] = [];
    for (const label of admits) {
      const key = schoolKey(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ key, label });
    }
    return out;
  }, [admits]);
  useEffect(() => {
    if (listingSchool && admits.some((school) => sameSchool(school, listingSchool))) return;
    setListingSchool('');
  }, [admits, listingSchool]);
  // Pricing toggle removed: every listing has one price for the whole set.
  // 'separate' support stays in the API/dashboard for existing data.
  const pricingMode: PricingMode = 'package';
  const [packagePrice, setPackagePrice] = useState('');
  const [teaser, setTeaser] = useState('');
  const [appliedMajors, setAppliedMajors] = useState('');
  const [sellerNote, setSellerNote] = useState('');
  const [detailsErr, setDetailsErr] = useState('');
  const [listingCount, setListingCount] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitLabel, setSubmitLabel] = useState('');

  const eduEmailRef = useRef<HTMLInputElement>(null);
  const signupPwRef = useRef<HTMLInputElement>(null);
  const uniRef = useRef<HTMLInputElement>(null);
  const codeRefs = useRef<Array<HTMLInputElement | null>>([]);
  const admitInputRef = useRef<HTMLInputElement>(null);

  // The tier is fixed - derived from the seller's admits, no manual override.
  const suggestedTier: 1 | 2 | 3 | null = useMemo(
    () => (listingSchool ? schoolTier(listingSchool) : null),
    [listingSchool],
  );

  // Auto-apply the tier floor to prices (mirrors applyTierToPrices).
  useEffect(() => {
    if (!suggestedTier) return;
    const pf = packageFloor(suggestedTier, essayRows.length);
    setPackagePrice((prev) => {
      const cur = parseFloat(prev);
      if (!prev || isNaN(cur) || cur < pf) return String(pf);
      return prev;
    });
    const ef = perEssayFloor(suggestedTier);
    setEssayRows((prev) =>
      prev.map((row) => {
        const c = parseFloat(row.price);
        if (!row.price || isNaN(c) || c < ef) return { ...row, price: String(ef) };
        return row;
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedTier, essayRows.length]);

  const resetListingForm = useCallback(() => {
    setApplicationType('');
    setListingSchool('');
    setPackagePrice('');
    setAdmits([]);
    setAdmitInput('');
    setEssayRows([newEssayRow()]);
    setTeaser('');
    setAppliedMajors('');
    setSellerNote('');
    setDetailsErr('');
  }, []);

  const fullResetSell = useCallback(() => {
    setEduEmail('');
    setEmailErr('');
    setCode(['', '', '', '', '', '']);
    setCodeErr('');
    setEmailToken('');
    setSignupPw('');
    setSignupPw2('');
    setPwErr('');
    setCurrentUni('');
    setCurrentMajor('');
    setUniErr('');
    setAnonMode('public');
    setListingCount(0);
    resetListingForm();
  }, [resetListingForm]);

  const openSell = useCallback(() => {
    setLoginOpen(false);
    setDashOpen(false);
    fullResetSell();
    setSellStep(1);
    setSellOpen(true);
    setTimeout(() => eduEmailRef.current?.focus(), 60);
  }, [fullResetSell]);

  const closeSell = useCallback(() => {
    setSellOpen(false);
    fullResetSell();
  }, [fullResetSell]);

  // From the dashboard the seller is already authenticated (session cookie),
  // so skip email/OTP/password and start at the school step. The server
  // accepts the session in place of an email token.
  const openSellFromDashboard = useCallback((email: string, lastSchool: string) => {
    setDashOpen(false);
    fullResetSell();
    setVerifiedEmail(email);
    setCurrentUni(lastSchool);
    setSellStep(4);
    setSellOpen(true);
    setTimeout(() => uniRef.current?.focus(), 60);
  }, [fullResetSell]);

  const emailAllowed = (e: string) => eduRe.test(e) || isLocalHost();

  async function handleSendCode() {
    const val = eduEmail.trim();
    if (!emailAllowed(val)) {
      setEmailErr('Please enter a valid .edu email address.');
      eduEmailRef.current?.focus();
      return;
    }
    setEmailErr('');
    setSendingCode(true);
    try {
      const resp = await fetch('/api/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: val }),
      });
      const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!resp.ok || data.ok === false) throw new Error(data.error || 'Could not send a code. Please try again.');
      setVerifiedEmail(val);
      setSellStep(2);
      setTimeout(() => codeRefs.current[0]?.focus(), 60);
    } catch (err) {
      setEmailErr(err instanceof Error ? err.message : 'Could not send a code. Please try again.');
    } finally {
      setSendingCode(false);
    }
  }

  function handleCodeChange(i: number, raw: string) {
    const v = raw.replace(/\D/g, '').slice(0, 1);
    setCode((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
    setCodeErr('');
    if (v && i < 5) codeRefs.current[i + 1]?.focus();
  }
  function handleCodeKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !code[i] && i > 0) codeRefs.current[i - 1]?.focus();
    if (e.key === 'Enter') handleVerifyCode();
  }
  function handleCodePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6).split('');
    setCode((prev) => {
      const next = [...prev];
      digits.forEach((d, j) => {
        if (j < 6) next[j] = d;
      });
      return next;
    });
    setTimeout(() => (codeRefs.current[Math.min(digits.length, 5)] || codeRefs.current[0])?.focus(), 0);
  }

  async function handleVerifyCode() {
    const joined = code.join('');
    if (joined.length < 6) {
      setCodeErr('Please enter all 6 digits.');
      return;
    }
    setCodeErr('');
    try {
      const resp = await fetch('/api/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verifiedEmail, code: joined }),
      });
      const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string; emailToken?: string };
      if (!resp.ok || data.ok === false) throw new Error(data.error || 'That code is incorrect. Please try again.');
      setEmailToken(data.emailToken || '');
    } catch (err) {
      setCodeErr(err instanceof Error ? err.message : 'That code is incorrect. Please try again.');
      return;
    }
    setSellStep(3);
    setTimeout(() => signupPwRef.current?.focus(), 60);
  }

  // Password creation now happens on its own step, after the OTP is verified.
  function handlePasswordNext() {
    if (signupPw.length < 8) {
      setPwErr('Password must be at least 8 characters.');
      return;
    }
    if (signupPw !== signupPw2) {
      setPwErr("Passwords don't match.");
      return;
    }
    setPwErr('');
    setSellStep(4);
    setTimeout(() => uniRef.current?.focus(), 60);
  }

  function handleUniNext() {
    if (currentUni.trim() === '') {
      setUniErr('Please enter the university you’re attending.');
      uniRef.current?.focus();
      return;
    }
    setUniErr('');
    setEssayRows((prev) => (prev.length ? prev : [newEssayRow()]));
    setSellStep(5);
  }

  /* ---- admit tags ---- */
  function addAdmit() {
    const v = admitInput.trim().replace(/,$/, '').trim();
    if (v && !admits.some((a) => sameSchool(a, v))) {
      setAdmits((prev) => [...prev, v]);
    }
    setAdmitInput('');
  }
  function handleAdmitKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addAdmit();
    } else if (e.key === 'Backspace' && !admitInput && admits.length) {
      setAdmits((prev) => prev.slice(0, -1));
    }
  }

  /* ---- essay rows ---- */
  function updateEssayRow(i: number, patch: Partial<EssayRow>) {
    setEssayRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setDetailsErr('');
  }
  function addEssayRow() {
    setEssayRows((prev) => [...prev, newEssayRow()]);
  }
  function removeEssayRow(i: number) {
    setEssayRows((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
    setDetailsErr('');
  }

  const reqHint = useMemo(() => {
    const req = reqMap[applicationType];
    if (!req) return '';
    let html = req.text;
    if (req.count > 1) {
      html += `<br>You've added <b>${essayRows.length} of ${req.count}</b> ${req.name}.`;
    }
    return html;
  }, [applicationType, essayRows.length]);

  const admitNames = admits.slice(0, 3).join(', ') + (admits.length > 3 ? '…' : '');

  function handlePackagePriceBlur() {
    if (!suggestedTier) return;
    const pf = packageFloor(suggestedTier, essayRows.length);
    const cur = parseFloat(packagePrice);
    if (isNaN(cur) || cur < pf) setPackagePrice(String(pf));
  }

  async function handleSubmitListing() {
    const rows = essayRows;
    const separate = pricingMode === 'separate';
    let msg = '';
    if (!applicationType) msg = 'Pick the application type for these essays.';
    else if (admits.length === 0) msg = 'Add at least one school you got into.';
    else if (!listingSchool || !admits.some((school) => sameSchool(school, listingSchool))) msg = 'Choose which college this listing is for.';
    else if (admitProofRows.some((a) => !admitFiles[a.key])) msg = 'Upload proof for every school you got into.';
    else if (admitProofRows.some((a) => (admitFiles[a.key] as File).size > 4 * 1024 * 1024)) msg = 'Each proof file must be 4MB or smaller.';
    else if (admitProofRows.some((a) => {
      const file = admitFiles[a.key] as File;
      return !['application/pdf', 'image/png', 'image/jpeg'].includes(file.type) && !/\.(pdf|png|jpe?g)$/i.test(file.name);
    })) msg = 'Proof must be a PDF, PNG, or JPG.';
    else if (rows.some((r) => !r.prompt)) msg = 'Choose a prompt type for every essay.';
    else if (rows.some((r) => /^other/i.test(r.prompt) && !r.question.trim())) msg = 'Type the essay question for every "Other" essay.';
    else if (rows.some((r) => !r.file)) msg = 'Upload a PDF for every essay.';
    else if (rows.some((r) => r.file && r.file.size > 4 * 1024 * 1024)) msg = 'Each PDF must be 4MB or smaller.';
    else if (rows.some((r) => r.file && !/\.pdf$/i.test(r.file.name) && r.file.type !== 'application/pdf')) msg = 'Essays must be PDF files.';
    else if (separate && rows.some((r) => !r.price.trim())) msg = 'Set a price for every essay.';
    else if (!separate && !packagePrice.trim()) msg = 'Set a package price.';
    else if (suggestedTier && !separate && parseFloat(packagePrice) < packageFloor(suggestedTier, rows.length)) msg = `Your ${TIER[suggestedTier].label} floor is $${packageFloor(suggestedTier, rows.length)}. You can charge that or more.`;
    else if (suggestedTier && separate && rows.some((r) => parseFloat(r.price) < perEssayFloor(suggestedTier))) msg = `Each essay's floor at ${TIER[suggestedTier].label} is $${perEssayFloor(suggestedTier)}. You can charge that or more.`;

    if (msg) {
      setDetailsErr(msg);
      return;
    }
    setDetailsErr('');

    let contentHashes: string[];
    try {
      contentHashes = await Promise.all(rows.map((row) => fileSha256(row.file as File)));
    } catch {
      setDetailsErr('Could not check the essay files for duplicates. Please choose the files again.');
      return;
    }

    const payload = {
      email: verifiedEmail,
      emailToken,
      password: signupPw || undefined,
      school: currentUni.trim(),
      targetSchool: listingSchool,
      admitTags: admits,
      anonymity: anonApiValue[anonMode],
      applicationSystem: appLabels[applicationType] || applicationType,
      pricingMode,
      packagePrice: separate ? undefined : Number(packagePrice) || undefined,
      major: currentMajor.trim() || undefined,
      appliedMajors: appliedMajors.trim() || undefined,
      teaser: teaser.trim() || undefined,
      sellerNote: sellerNote.trim() || undefined,
      essays: rows.map((r, index) => ({
        prompt: r.prompt,
        question: /^other/i.test(r.prompt) ? r.question.trim() || undefined : undefined,
        price: separate ? Number(r.price) || undefined : undefined,
        contentHash: contentHashes[index],
      })),
    };

    setSubmitting(true);
    try {
      const resp = await fetch('/api/submit-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        essays?: { id: string }[];
        uploadToken?: string;
        admitProofs?: { id: string; school: string; status: string; needsUpload: boolean }[];
      };
      if (!resp.ok || data.ok === false) throw new Error(data.error || 'Could not submit your listing. Please try again.');
      if (!data.essays || !data.uploadToken || data.essays.length !== rows.length) {
        throw new Error('Could not submit your listing. Please try again.');
      }

      // Acceptance letters first: they gate whether the admit claims can ever be
      // shown as verified, and a listing without them is not reviewable. The
      // server tells us which it still needs, so a returning seller whose letter
      // is already on file is not asked to re-send it.
      const needed = (data.admitProofs ?? []).filter((p) => p.needsUpload);
      for (let i = 0; i < needed.length; i++) {
        const file = admitFiles[schoolKey(needed[i].school)];
        if (!file) continue;
        setSubmitLabel(`Uploading admission proof ${i + 1} of ${needed.length}…`);
        const fd = new FormData();
        fd.append('token', data.uploadToken);
        fd.append('proofId', needed[i].id);
        fd.append('file', file);
        const up = await fetch('/api/upload-admit-proof', { method: 'POST', body: fd });
        const upData = (await up.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!up.ok || upData.ok === false) {
          throw new Error(upData.error || 'Could not upload one of your proof files. Please try again.');
        }
      }

      // Listing created - now upload each PDF (one request per file).
      for (let i = 0; i < rows.length; i++) {
        setSubmitLabel(`Uploading essay ${i + 1} of ${rows.length}…`);
        const fd = new FormData();
        fd.append('token', data.uploadToken);
        fd.append('essayId', data.essays[i].id);
        fd.append('file', rows[i].file as File);
        const up = await fetch('/api/upload-essay', { method: 'POST', body: fd });
        const upData = (await up.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!up.ok || upData.ok === false) {
          throw new Error(upData.error || 'Could not upload one of your PDFs. Please try again.');
        }
      }
    } catch (err) {
      setDetailsErr(err instanceof Error ? err.message : 'Could not submit your listing. Please try again.');
      setSubmitting(false);
      setSubmitLabel('');
      return;
    }
    setSubmitting(false);
    setSubmitLabel('');
    setListingCount((c) => c + 1);
    setSellStep(6);
  }

  const successTitle = listingCount <= 1 ? 'Listing submitted!' : `Listing #${listingCount} submitted!`;

  /* ============================ Buyer checkout ============================ */
  // Stripe securely renders Checkout inside this modal. Card details never
  // enter Admitfolio's React state or touch our servers.
  const [curItem, setCurItem] = useState<{ listingId?: string; school?: string; price?: number; summary?: string | null; essayCount?: number }>({});
  const [buyErr, setBuyErr] = useState('');

  const openBuy = useCallback((item: { listingId: string; school: string; price: number; summary?: string | null; essayCount?: number }) => {
    setCurItem(item);
    setBuyErr('');
    setBuyOpen(true);
  }, []);
  const closeBuy = useCallback(() => setBuyOpen(false), []);

  function handleUnlock(essay: Essay) {
    // Sample cards are teasers - they are not purchasable.
    void essay;
  }

  /* ============================ Waitlist (notify) ============================ */
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notifyMsg, setNotifyMsg] = useState<Msg>({ text: '', kind: '' });
  const [notifyBusy, setNotifyBusy] = useState(false);

  const [wlEmail, setWlEmail] = useState('');
  const [wlMsg, setWlMsg] = useState<Msg>({ text: '', kind: '' });
  const [wlBusy, setWlBusy] = useState(false);
  const [fabShow, setFabShow] = useState(false);
  const wlEmailRef = useRef<HTMLInputElement>(null);
  const autoShownRef = useRef(false);
  // Live view of "is any popup open" for timers whose closures would go stale.
  const overlayOpenRef = useRef(false);

  const hasJoined = () => {
    try {
      return localStorage.getItem('admitly_waitlist_joined') === '1';
    } catch {
      return false;
    }
  };
  const markJoined = useCallback(() => {
    try {
      localStorage.setItem('admitly_waitlist_joined', '1');
    } catch {
      /* ignore */
    }
    autoShownRef.current = true;
    setFabShow(false);
  }, []);

  async function submitWaitlist(email: string): Promise<{ ok: boolean; already?: boolean; error?: string }> {
    const resp = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; already?: boolean; error?: string };
    if (!resp.ok || data.ok === false) throw new Error(data.error || 'Something went wrong.');
    return { ok: true, already: data.already };
  }

  async function handleNotifySubmit(e: React.FormEvent) {
    e.preventDefault();
    const email = notifyEmail.trim();
    if (!emailRe.test(email)) {
      setNotifyMsg({ text: 'Please enter a valid email address.', kind: 'err' });
      return;
    }
    setNotifyBusy(true);
    try {
      const { already } = await submitWaitlist(email);
      setNotifyMsg({ text: already ? WAITLIST_MSG_OK_DUP : WAITLIST_MSG_OK_NEW, kind: 'ok' });
      setNotifyEmail('');
      markJoined();
    } catch (err) {
      setNotifyMsg({ text: err instanceof Error ? err.message : 'Could not sign you up right now. Please try again.', kind: 'err' });
    } finally {
      setNotifyBusy(false);
    }
  }

  const openWaitlist = useCallback(() => {
    setWlOpen(true);
    setTimeout(() => wlEmailRef.current?.focus(), 60);
  }, []);

  async function handleWlSubmit(e: React.FormEvent) {
    e.preventDefault();
    const email = wlEmail.trim();
    if (!emailRe.test(email)) {
      setWlMsg({ text: 'Please enter a valid email address.', kind: 'err' });
      return;
    }
    setWlBusy(true);
    try {
      const { already } = await submitWaitlist(email);
      setWlMsg({ text: already ? WAITLIST_MSG_OK_DUP : WAITLIST_MSG_OK_NEW, kind: 'ok' });
      setWlEmail('');
      markJoined();
      setTimeout(() => setWlOpen(false), 1900);
    } catch (err) {
      setWlMsg({ text: err instanceof Error ? err.message : 'Could not sign you up right now. Please try again.', kind: 'err' });
    } finally {
      setWlBusy(false);
    }
  }

  // Sticky FAB + scroll-triggered popup.
  //
  // Both belong to the pre-launch page. Once the catalogue is live there is
  // nothing to wait for, so a "Be first to read the essays" popup over a page
  // full of buyable essays is just wrong. The featured section already branches
  // on LAUNCHED; this timer did not, so it fired regardless.
  useEffect(() => {
    if (LAUNCHED) return;
    function onScroll() {
      if (hasJoined()) {
        setFabShow(false);
        return;
      }
      const scrolled = window.scrollY;
      setFabShow(scrolled > 360);
      if (!autoShownRef.current && scrolled > 450) {
        autoShownRef.current = true;
        setTimeout(() => {
          if (hasJoined()) return;
          // Never pop over an open modal/menu; re-arm so it can still
          // appear once the user has closed it and scrolls again.
          if (overlayOpenRef.current) {
            autoShownRef.current = false;
            return;
          }
          openWaitlist();
        }, 15000);
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [openWaitlist]);

  /* ============================ Seller login (email + password) ============================ */
  const [slPane, setSlPane] = useState(1);
  const [slEmail, setSlEmail] = useState('');
  const [slPassword, setSlPassword] = useState('');
  const [slLoginErr, setSlLoginErr] = useState('');
  const [slCode, setSlCode] = useState('');
  const [slNewPw, setSlNewPw] = useState('');
  const [slResetErr, setSlResetErr] = useState('');
  const [slSending, setSlSending] = useState(false);
  const [slBusy, setSlBusy] = useState(false);
  const slEmailRef = useRef<HTMLInputElement>(null);
  const slPwRef = useRef<HTMLInputElement>(null);
  const slCodeRef = useRef<HTMLInputElement>(null);

  const openLogin = useCallback(() => {
    setSlPane(1);
    setSlEmail('');
    setSlPassword('');
    setSlLoginErr('');
    setSlCode('');
    setSlNewPw('');
    setSlResetErr('');
    setLoginOpen(true);
    setTimeout(() => slEmailRef.current?.focus(), 60);
  }, []);
  const closeLogin = useCallback(() => setLoginOpen(false), []);

  const openDashboard = useCallback((email: string) => {
    setSellerEmail(email || '');
    setListings([]);
    setMonthGross(0);
    setSellerAccounting(null);
    setSellerPayouts(null);
    setPayoutSetupError('');
    setDashErr('');
    setDashLoading(true);
    setDashOpen(true);
    setProfMsg({ text: '', kind: '' });
    fetch('/api/seller/profile')
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as { name?: string | null; bio?: string | null; backgroundTags?: string[] };
        if (!r.ok) return;
        setProfName(d.name || '');
        setProfBio(d.bio || '');
        setProfTags(Array.isArray(d.backgroundTags) ? d.backgroundTags : []);
      })
      .catch(() => {});
    fetch('/api/seller/listings')
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as {
          listings?: SellerListing[];
          monthGross?: number;
          allTimeGrossCents?: number;
          allTimeSellerEarningsCents?: number;
          allTimePlatformFeeCents?: number;
          allTimeStripeProcessingFeeCents?: number;
          monthGrossCents?: number;
          monthSellerEarningsCents?: number;
          monthPlatformFeeCents?: number;
          monthStripeProcessingFeeCents?: number;
          payouts?: SellerPayouts | null;
          error?: string;
        };
        if (!r.ok || !d.listings) throw new Error(d.error || 'Could not load your listings.');
        setListings(d.listings);
        setMonthGross(d.monthGross || 0);
        setSellerPayouts(d.payouts || null);
        if (
          typeof d.allTimeGrossCents === 'number' &&
          typeof d.allTimeSellerEarningsCents === 'number' &&
          typeof d.allTimePlatformFeeCents === 'number' &&
          typeof d.allTimeStripeProcessingFeeCents === 'number' &&
          typeof d.monthGrossCents === 'number' &&
          typeof d.monthSellerEarningsCents === 'number' &&
          typeof d.monthPlatformFeeCents === 'number' &&
          typeof d.monthStripeProcessingFeeCents === 'number'
        ) {
          setSellerAccounting({
            allTimeGrossCents: d.allTimeGrossCents,
            allTimeSellerEarningsCents: d.allTimeSellerEarningsCents,
            allTimePlatformFeeCents: d.allTimePlatformFeeCents,
            allTimeStripeProcessingFeeCents: d.allTimeStripeProcessingFeeCents,
            monthGrossCents: d.monthGrossCents,
            monthSellerEarningsCents: d.monthSellerEarningsCents,
            monthPlatformFeeCents: d.monthPlatformFeeCents,
            monthStripeProcessingFeeCents: d.monthStripeProcessingFeeCents,
          });
        }
      })
      .catch((err) => setDashErr(err instanceof Error ? err.message : 'Could not load your listings.'))
      .finally(() => setDashLoading(false));
  }, []);

  async function handleLogin() {
    const email = slEmail.trim();
    if (!email || !slPassword) {
      setSlLoginErr('Enter your email and password.');
      return;
    }
    setSlLoginErr('');
    setSlBusy(true);
    try {
      const resp = await fetch('/api/seller-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: slPassword }) });
      const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!resp.ok || data.ok === false) throw new Error(data.error || 'Incorrect email or password.');
    } catch (err) {
      setSlLoginErr(err instanceof Error ? err.message : 'Incorrect email or password.');
      setSlBusy(false);
      return;
    }
    setSlBusy(false);
    setSlPassword('');
    setLoginOpen(false);
    openDashboard(email);
  }

  function goForgot() {
    setSlResetErr('');
    setSlPane(2);
  }

  async function handleSlSendCode() {
    const val = slEmail.trim();
    if (!emailRe.test(val)) {
      setSlResetErr('Please enter a valid .edu email address.');
      return;
    }
    setSlResetErr('');
    setSlSending(true);
    try {
      const resp = await fetch('/api/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: val }) });
      const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!resp.ok || data.ok === false) throw new Error(data.error || 'Could not send the code. Please try again.');
    } catch (err) {
      setSlResetErr(err instanceof Error ? err.message : 'Could not send the code. Please try again.');
      setSlSending(false);
      return;
    }
    setSlSending(false);
    setSlPane(3);
    setTimeout(() => slCodeRef.current?.focus(), 60);
  }

  async function handleSlReset() {
    const email = slEmail.trim();
    const codeVal = slCode.trim();
    if (codeVal.length < 6) {
      setSlResetErr('Enter the 6-digit code.');
      return;
    }
    if (slNewPw.length < 8) {
      setSlResetErr('Password must be at least 8 characters.');
      return;
    }
    setSlResetErr('');
    setSlBusy(true);
    try {
      const vResp = await fetch('/api/verify-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code: codeVal }) });
      const vData = (await vResp.json().catch(() => ({}))) as { ok?: boolean; error?: string; emailToken?: string };
      if (!vResp.ok || vData.ok === false || !vData.emailToken) throw new Error(vData.error || 'That code is incorrect. Please try again.');
      const rResp = await fetch('/api/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, emailToken: vData.emailToken, newPassword: slNewPw }) });
      const rData = (await rResp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!rResp.ok || rData.ok === false) throw new Error(rData.error || 'Could not reset your password. Please try again.');
    } catch (err) {
      setSlResetErr(err instanceof Error ? err.message : 'Could not reset your password. Please try again.');
      setSlBusy(false);
      return;
    }
    setSlBusy(false);
    setSlNewPw('');
    setLoginOpen(false);
    openDashboard(email);
  }

  /* ============================ Seller dashboard ============================ */
  const [sellerEmail, setSellerEmail] = useState('');
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [monthGross, setMonthGross] = useState(0);
  const [sellerAccounting, setSellerAccounting] = useState<SellerAccounting | null>(null);
  const [sellerPayouts, setSellerPayouts] = useState<SellerPayouts | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashErr, setDashErr] = useState('');
  const [payoutSetupBusy, setPayoutSetupBusy] = useState(false);
  const [payoutSetupError, setPayoutSetupError] = useState('');

  /* ---- Seller profile (name, bio, background tags; avatar = initials) ---- */
  const [profName, setProfName] = useState('');
  const [profBio, setProfBio] = useState('');
  const [profTags, setProfTags] = useState<string[]>([]);
  const [profMsg, setProfMsg] = useState<Msg>({ text: '', kind: '' });
  const [profBusy, setProfBusy] = useState(false);

  function toggleProfTag(tag: string) {
    setProfMsg({ text: '', kind: '' });
    setProfTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function saveProfile() {
    setProfBusy(true);
    setProfMsg({ text: '', kind: '' });
    try {
      const resp = await fetch('/api/seller/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profName, bio: profBio, backgroundTags: profTags }),
      });
      const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!resp.ok || data.ok === false) throw new Error(data.error || 'Could not save your profile.');
      setProfMsg({ text: 'Profile saved!', kind: 'ok' });
    } catch (err) {
      setProfMsg({ text: err instanceof Error ? err.message : 'Could not save your profile.', kind: 'err' });
    } finally {
      setProfBusy(false);
    }
  }

  const earnings = useMemo(() => {
    const fallbackGross = listings.reduce((sum, l) => sum + l.gross, 0);
    const totalGross = sellerAccounting ? sellerAccounting.allTimeGrossCents / 100 : fallbackGross;
    const totalSales = listings.reduce((sum, l) => sum + l.sales, 0);
    return {
      totalGross,
      totalNet: sellerAccounting
        ? sellerAccounting.allTimeSellerEarningsCents / 100
        : round2(totalGross * SELLER_SHARE),
      totalFee: sellerAccounting
        ? sellerAccounting.allTimePlatformFeeCents / 100
        : round2(totalGross * (1 - SELLER_SHARE)),
      totalStripeFee: sellerAccounting
        ? sellerAccounting.allTimeStripeProcessingFeeCents / 100
        : 0,
      monthGross: sellerAccounting ? sellerAccounting.monthGrossCents / 100 : monthGross,
      monthNet: sellerAccounting
        ? sellerAccounting.monthSellerEarningsCents / 100
        : round2(monthGross * SELLER_SHARE),
      totalSales,
      pendingPayout: sellerAccounting
        ? (sellerPayouts?.pendingCents ?? sellerAccounting.allTimeSellerEarningsCents) / 100
        : round2(totalGross * SELLER_SHARE),
    };
  }, [listings, monthGross, sellerAccounting, sellerPayouts]);

  async function handlePayoutSetup() {
    setPayoutSetupBusy(true);
    setPayoutSetupError('');
    try {
      const resp = await fetch('/api/seller/connect/start', { method: 'POST' });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        alreadyReady?: boolean;
        error?: string;
      };
      if (!resp.ok || !data.ok) throw new Error(data.error || 'Could not start payout setup.');
      if (data.alreadyReady) {
        setSellerPayouts((current) => current ? { ...current, status: 'ready' } : current);
        return;
      }
      if (!data.url) throw new Error('Stripe did not return a payout setup link.');
      window.location.assign(data.url);
    } catch (error) {
      setPayoutSetupError(error instanceof Error ? error.message : 'Could not start payout setup.');
    } finally {
      setPayoutSetupBusy(false);
    }
  }

  const publishedListings = listings.filter((l) => l.status === 'approved');
  const publishedCount = publishedListings.length;

  async function listingAction(id: string, action: 'takedown' | 'resubmit') {
    try {
      const resp = await fetch('/api/seller/listing-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: id, action }),
      });
      const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; status?: string; error?: string };
      if (!resp.ok || !data.ok || !data.status) throw new Error(data.error || 'Could not update the listing.');
      setListings((prev) => prev.map((l) => (l.id === id ? { ...l, status: data.status as SellerListing['status'] } : l)));
    } catch (err) {
      setDashErr(err instanceof Error ? err.message : 'Could not update the listing.');
    }
  }

  function priceSaved(id: string, data: { packagePrice?: number; essayPrices?: Record<string, number> }) {
    setListings((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        if (data.packagePrice != null) return { ...l, packagePrice: data.packagePrice };
        if (data.essayPrices) {
          return { ...l, essays: l.essays.map((e) => (data.essayPrices![e.id] != null ? { ...e, price: data.essayPrices![e.id] } : e)) };
        }
        return l;
      }),
    );
  }

  const closeDashboard = useCallback(() => {
    setDashOpen(false);
    setSellerEmail('');
  }, []);

  const handleSellerLogout = useCallback(() => {
    fetch('/api/seller/logout', { method: 'POST' }).catch(() => {});
    setDashOpen(false);
    setSellerEmail('');
    setListings([]);
  }, []);

  /* ============================ Global effects ============================ */

  // Lock body scroll while any overlay is open; keep the ref in sync so the
  // waitlist auto-popup timer can check it (the hamburger menu counts as a
  // popup for that purpose, but shouldn't lock scroll).
  useEffect(() => {
    const anyOpen = sellOpen || buyOpen || wlOpen || loginOpen || dashOpen || detailId !== null;
    overlayOpenRef.current = anyOpen || menuOpen;
    document.body.style.overflow = anyOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sellOpen, buyOpen, wlOpen, loginOpen, dashOpen, menuOpen, detailId]);

  // Layout variant body classes + ?login deep-link (mirrors the original IIFEs).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    document.body.classList.add(q.get('layout') === 'backdrop' ? 'layout-backdrop' : 'layout-frame');
    if (q.get('bg') === 'soft') document.body.classList.add('bg-soft');
    let t: ReturnType<typeof setTimeout> | undefined;
    if (q.get('payouts')) {
      t = setTimeout(() => {
        fetch('/api/seller/session')
          .then(async (response) => {
            const data = (await response.json().catch(() => ({}))) as { email?: string };
            if (!response.ok || !data.email) throw new Error('login required');
            openDashboard(data.email);
          })
          .catch(() => openLogin());
      }, 200);
    } else if (q.get('login')) {
      t = setTimeout(() => openLogin(), 300);
    }
    return () => {
      document.body.classList.remove('layout-frame', 'layout-backdrop', 'bg-soft');
      if (t) clearTimeout(t);
    };
  }, [openDashboard, openLogin]);

  // Escape closes the top-most overlay.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (matcherOpen) setMatcherOpen(false);
      else if (menuOpen) setMenuOpen(false);
      else if (dashOpen) closeDashboard();
      // Buy sits above detail: opening it closes the sheet first, so the two
      // are never stacked, but check it first anyway in case that ever changes.
      else if (buyOpen) closeBuy();
      else if (detailId) closeDetail();
      else if (sellOpen) closeSell();
      else if (loginOpen) closeLogin();
      else if (wlOpen) setWlOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [matcherOpen, menuOpen, dashOpen, buyOpen, detailId, sellOpen, loginOpen, wlOpen, closeDashboard, closeBuy, closeSell, closeLogin, closeDetail]);

  // Scroll-reveal animations.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.18 },
    );
    document.querySelectorAll('.reveal, .steps-path').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const stepClass = (n: number) => `step-pane${sellStep === n ? ' active' : ''}`;
  const slClass = (n: number) => `step-pane${slPane === n ? ' active' : ''}`;

  /* ============================ Render ============================ */
  return (
    <>
      {updateAvailable && (
        <div className="site-update" role="status">
          <span>Admitfolio was updated.</span>
          <button type="button" onClick={() => window.location.reload()}>Refresh</button>
        </div>
      )}
      <nav className="nav">
        <a className="logo" href="#home" onClick={() => setPageView('home')}>
          <div className="logo-word">Admitfolio</div>
          <div className="logo-dot"></div>
        </a>
        <div className="nav-links">
          <a href="#browse" onClick={(event) => { event.preventDefault(); openBrowse(); }}>Browse essays</a>
          <a href="#featured" onClick={(event) => { event.preventDefault(); openFeatured(); }}>Featured</a>
          <a onClick={openSell}>Sell your essays</a>
        </div>
        <div className="nav-cta">
          <a className="login" onClick={openLogin}><span className="login-prefix">Seller </span>login</a>
          {LAUNCHED && <button className="btn-primary" type="button" onClick={openMatcher}>Find my matches</button>}
          {!LAUNCHED && <a className="btn-primary" onClick={openSell}>Sell your essay</a>}
          <button type="button" className={`nav-burger${menuOpen ? ' open' : ''}`} aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            <span></span><span></span>
          </button>
        </div>
        {menuOpen && (
          <>
            <div className="nav-menu-backdrop" onClick={() => setMenuOpen(false)}></div>
            <div className="nav-menu">
              <a href="#browse" onClick={(event) => { event.preventDefault(); setMenuOpen(false); openBrowse(); }}>Browse essays</a>
              <a href="#featured" onClick={(event) => { event.preventDefault(); setMenuOpen(false); openFeatured(); }}>Featured</a>
              {LAUNCHED && <a onClick={() => { setMenuOpen(false); openMatcher(); }}>Find my matches</a>}
              <a onClick={() => { setMenuOpen(false); openLogin(); }}>Seller login</a>
            </div>
          </>
        )}
      </nav>

      {/* ===== Hero ===== */}
      <section className="hero" id="home" style={{ display: LAUNCHED && pageView === 'browse' ? 'none' : undefined }}>
        <div>
          <div className="pill"><span className="dot"></span>For inspiration, never to copy</div>
          <h1>Read the essays that <em>got them in</em>.</h1>
          <p>
            <span className="hero-sub-long">Admitfolio is a marketplace of real college admissions essays, written by the students who got accepted. Browse by school and prompt, see why each one worked, and find the angle only you can write.</span>
            <span className="hero-sub-short">Real admissions essays from the students who got accepted. See why each one worked, and find the angle only you can write.</span>
          </p>
          <div className="hero-actions">
            <a className="btn-primary" href="#browse" onClick={(event) => { if (LAUNCHED) { event.preventDefault(); openBrowse(); } }}>Browse essays</a>
            <a className="btn-ghost" onClick={openSell}>Sell your essay</a>
          </div>
          <div className="hero-stats">
            <div><div className="stat-num">100%</div><div className="stat-lbl">verified admits</div></div>
          </div>
        </div>

        <div className="hero-art">
          <div className="float-card fc-top">
            <div className="fc-head">
              <LogoBadge domain="stanford.edu" letter="S" color="#8C1515" school="Stanford" size={38} fontSize={18} />
              <div style={{ flex: 1, minWidth: 0 }}><div className="fc-school">Stanford</div><div className="fc-year">Class of &apos;27</div></div>
              <div className="fc-rating"><span className="star">★</span> 4.9</div>
            </div>
            <div className="fc-prompt">Common App</div>
            <div className="fc-hook">The summer I taught my grandfather&apos;s old radio to sing again.</div>
            <div className="skel"><div style={{ width: '100%' }}></div><div style={{ width: '84%', opacity: 0.6 }}></div></div>
            <div className="fc-foot"><span className="unlock-pill">Unlock</span></div>
          </div>

          <div className="float-card fc-mid">
            <div className="fc-head">
              <LogoBadge domain="harvard.edu" letter="H" color="#A51C30" school="Harvard" size={38} fontSize={18} />
              <div style={{ flex: 1, minWidth: 0 }}><div className="fc-school">Harvard</div><div className="fc-year">Class of &apos;25</div></div>
              <div className="fc-rating"><span className="star">★</span> 5.0</div>
            </div>
            <div className="fc-prompt">Personal Statement</div>
            <div className="fc-hook">Translating for my mother at the DMV, one form at a time.</div>
            <div className="skel"><div style={{ width: '100%' }}></div><div style={{ width: '72%', opacity: 0.6 }}></div></div>
            <div className="fc-foot"><span className="unlock-pill">Unlock</span></div>
          </div>

          <div className="float-card fc-bot">
            <div className="fc-head">
              <LogoBadge domain="yale.edu" letter="Y" color="#00356B" school="Yale" size={36} fontSize={17} />
              <div style={{ flex: 1, minWidth: 0 }}><div className="fc-school">Yale</div><div className="fc-year">Class of &apos;26</div></div>
              <div className="fc-rating"><span className="star">★</span> 4.8</div>
            </div>
            <div className="fc-prompt">Why Yale</div>
            <div className="fc-hook" style={{ fontSize: '15px' }}>I found home in the margins of a 200-year-old library book.</div>
          </div>
        </div>
      </section>

      {/* ===== Trust bar (marquee on mobile) ===== */}
      <section className="trust" style={{ display: LAUNCHED && pageView === 'browse' ? 'none' : undefined }}>
        <div className="trust-label">Real essays from students now at</div>
        <div className="trust-marquee">
          <div className="trust-row">
            {[0, 1].map((copy) => (
              <div key={copy} className="trust-set" aria-hidden={copy === 1 || undefined}>
                {[
                  ['Harvard', 'harvard.edu'],
                  ['Stanford', 'stanford.edu'],
                  ['Yale', 'yale.edu'],
                  ['Princeton', 'princeton.edu'],
                  ['MIT', 'mit.edu'],
                  ['Columbia', 'columbia.edu'],
                  ['Brown', 'brown.edu'],
                  ['Penn', 'upenn.edu'],
                ].map(([name, domain]) => (
                  <span key={domain} className="trust-school">
                    <img
                      src={universityLogoSrc(domain)}
                      alt={`${name} logo`}
                      loading="lazy"
                      onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                    />
                    {name}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Featured ===== */}
      <section className={`featured${LAUNCHED ? ' catalog-section' : ''}${LAUNCHED && pageView === 'home' ? ' home-featured' : ''}`} id={LAUNCHED && pageView === 'home' ? 'featured' : 'browse'}>
        {LAUNCHED && pageView === 'home' ? (
          <>
            <div className="featured-head home-featured-head">
              <div>
                <h2>Featured essays</h2>
                <p>Six standout schools to start with. The full catalogue stays one click away.</p>
              </div>
            </div>
            {pubState === 'loading' && <div className="pub-empty">Loading essays&hellip;</div>}
            {pubState === 'error' && <div className="pub-empty">Could not load essays right now. Refresh to try again.</div>}
            {featuredListings.length > 0 && (
              <div className="grid public-grid home-featured-grid">
                {featuredListings.map((listing) => (
                  <PublicListingCard
                    key={listing.id}
                    listing={listing}
                    onUnlock={() => openBuy({
                      listingId: listing.id,
                      school: schoolShortName(headlineSchool(listing)),
                      price: listing.price || 0,
                      summary: publicListingTitle(listing),
                      essayCount: listing.essays.length,
                    })}
                    onOpen={() => openDetail(listing.id)}
                  />
                ))}
              </div>
            )}
            <div className="home-see-wrap">
              <a className="home-see-more" href="#browse" onClick={(event) => { event.preventDefault(); openBrowse(); }}>See all essays</a>
            </div>
          </>
        ) : LAUNCHED ? (
          <>
            <div className="featured-head">
              <div>
                <h2>Browse essays</h2>
                <p>Shop by the school you want to get into. Every listing is from a verified admit, with the essays that got them in.</p>
              </div>
              <div className="browse-controls">
                <label className="pub-search">
                  <svg className="pub-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
                  </svg>
                  <span className="sr-only">Search essays</span>
                  <input
                    type="search"
                    placeholder="Search school, major, prompt…"
                    spellCheck={false}
                    autoComplete="off"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="pub-search-clear"
                      aria-label="Clear search"
                      onClick={() => setSearchQuery('')}
                    >
                      ×
                    </button>
                  )}
                </label>
                <div className="view-toggle" role="group" aria-label="Choose browse layout">
                  <button
                    className="view-option"
                    type="button"
                    aria-pressed={browseView === 'rows'}
                    onClick={() => setBrowseView('rows')}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <rect x="2" y="3" width="16" height="3" rx="1" />
                      <rect x="2" y="8.5" width="16" height="3" rx="1" />
                      <rect x="2" y="14" width="16" height="3" rx="1" />
                    </svg>
                    Rows
                  </button>
                  <button
                    className="view-option"
                    type="button"
                    aria-pressed={browseView === 'cards'}
                    onClick={() => setBrowseView('cards')}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <rect x="2" y="2" width="7" height="7" rx="1.4" />
                      <rect x="11" y="2" width="7" height="7" rx="1.4" />
                      <rect x="2" y="11" width="7" height="7" rx="1.4" />
                      <rect x="11" y="11" width="7" height="7" rx="1.4" />
                    </svg>
                    Cards
                  </button>
                </div>
              </div>
            </div>
            {pubState === 'loading' && <div className="pub-empty">Loading essays&hellip;</div>}
            {pubState === 'error' && <div className="pub-empty">Could not load essays right now. Refresh to try again.</div>}
            {pubState === 'ready' && pubListings.length === 0 && (
              <div className="pub-empty">The first essays are being reviewed. Check back very soon!</div>
            )}
            {pubListings.length > 0 && (
              <div className="pub-count">
                <span>
                  Showing {Math.min(shown, sortedListings.length)} of {sortedListings.length} listing
                  {sortedListings.length === 1 ? '' : 's'}
                  {searchQuery ? ` matching “${searchQuery.trim()}”` : ''}
                  {matchIds ? ` · ${matchLabel}` : ''}
                </span>
                {matchIds && <button type="button" className="pub-count-reset" onClick={() => { setMatchIds(null); setMatchLabel(''); }}>Show all listings</button>}
              </div>
            )}
            {pubListings.length > 0 && sortedListings.length === 0 && (
              <div className="pub-empty">
                Nothing matches that search.{' '}
                <button type="button" className="pub-count-reset" onClick={() => setSearchQuery('')}>Clear search</button>
              </div>
            )}
            {sortedListings.length > 0 && browseView === 'rows' && (
              <div className="row-head" aria-hidden="true">
                <span>Listing</span>
                <span>Opening and background</span>
                <span>College results</span>
                <span>Price</span>
              </div>
            )}
            {sortedListings.length > 0 && (
              <div className={`grid public-grid${browseView === 'rows' ? ' rows' : ''}`}>
                {sortedListings.slice(0, shown).map((l) => (
                  <PublicListingCard
                    key={l.id}
                    listing={l}
                    onUnlock={() =>
                      openBuy({
                        listingId: l.id,
                        // The same headline the card shows and the same one the
                        // Stripe product name is built from, so all three agree.
                        school: schoolShortName(headlineSchool(l)),
                        price: l.price || 0,
                        summary: publicListingTitle(l),
                        essayCount: l.essays.length,
                      })
                    }
                    onOpen={() => openDetail(l.id)}
                  />
                ))}
              </div>
            )}
            {shown < sortedListings.length && (
              <div className="pub-more" ref={moreRef}>
                <button className="pub-more-btn" type="button" onClick={loadMore}>
                  Load more ({sortedListings.length - shown} left)
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="featured-head">
              <div>
                <h2>Releasing soon</h2>
                <p>We&apos;re collecting verified essays from this year&apos;s admits right now. Be the first to read them the moment they go live.</p>
              </div>
            </div>

            <div className="chips" id="chips" style={{ display: 'none' }}>
              {chipLabels.map((label) => (
                <div key={label} className={`chip${label === filter ? ' active' : ''}`} onClick={() => setFilter(label)}>{label}</div>
              ))}
            </div>

            {/* Combined stage: blurred essays + the "Releasing soon" dark card */}
            <div className="release-stage">
              <div className="release-essays">
                <div className="grid coming-soon" id="grid" aria-hidden="true">
                  {gridEssays.map((e) => (
                    <EssayCard key={e.id} essay={e} onUnlock={() => handleUnlock(e)} />
                  ))}
                </div>
              </div>
              <div className="release-overlay">
                <div className="notify-banner">
                  <div className="notify-glow"></div>
                  <div className="notify-text">
                    <div className="notify-eyebrow"><span className="dot"></span>Coming soon</div>
                    <h3>Real admit essays are on the way.</h3>
                    <p>Drop your email and we&apos;ll tell you the moment essays become public. No spam, just one heads-up when they&apos;re live.</p>
                  </div>
                  <form className="notify-form" autoComplete="on" onSubmit={handleNotifySubmit}>
                    <div className="notify-row">
                      <input type="email" placeholder="you@email.com" autoComplete="email" spellCheck={false} aria-label="Email address" value={notifyEmail} onChange={(e) => { setNotifyEmail(e.target.value); if (notifyMsg.text) setNotifyMsg({ text: '', kind: '' }); }} />
                      <button type="submit" className="btn-primary" disabled={notifyBusy}>{notifyBusy ? 'Adding…' : 'Notify me'}</button>
                    </div>
                    <div className={`notify-msg${notifyMsg.kind ? ' ' + notifyMsg.kind : ''}`}>{notifyMsg.text}</div>
                  </form>
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {LAUNCHED && pageView === 'browse' && (
        <MatchFinder
          listings={pubListings}
          open={matcherOpen}
          onOpenChange={setMatcherOpen}
          onOpenListing={(id) => { setMatcherOpen(false); openDetail(id); }}
          onShowMatches={(ids, query) => {
            setMatchIds(ids);
            setMatchLabel(`matches for “${query}”`);
            setSearchQuery('');
            requestAnimationFrame(() => document.getElementById('browse')?.scrollIntoView({ behavior: 'smooth' }));
          }}
        />
      )}

      {/* ===== How it works ===== */}
      <section className="how" id="how" style={{ display: LAUNCHED && pageView === 'browse' ? 'none' : undefined }}>
        <div className="how-inner">
          <div className="eyebrow">How it works</div>
          <h2 className="reveal">From locked to admitted, in four steps</h2>
          <p className="how-sub">Every listing is from a verified admit. Find what worked, then write something that&apos;s unmistakably yours.</p>

          <div className="steps-wrap">
            <svg className="steps-line" viewBox="0 0 1000 100" preserveAspectRatio="none">
              <path className="steps-path" d="M0,50 C125,8 220,92 333,50 C446,8 553,92 666,50 C780,8 875,92 1000,50" fill="none" stroke="color-mix(in srgb, var(--accent) 32%, #fff)" strokeWidth="2.5" strokeLinecap="round"></path>
            </svg>

            <div className="steps">
              <div className="step reveal">
                <div className="step-card" aria-hidden="true">
                  <svg viewBox="0 0 200 140" fill="none">
                    <rect x="16" y="14" width="112" height="96" rx="12" fill="rgba(125,29,45,0.05)" stroke="var(--accent)" strokeWidth="2" strokeDasharray="6 6" />
                    <line x1="32" y1="38" x2="92" y2="38" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" opacity="0.75" />
                    <line x1="32" y1="54" x2="112" y2="54" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
                    <line x1="32" y1="68" x2="104" y2="68" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
                    <line x1="32" y1="82" x2="86" y2="82" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
                    <circle cx="146" cy="80" r="27" fill="#fff" stroke="var(--accent)" strokeWidth="3" />
                    <path d="M138 76h16M138 86h11" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
                    <line x1="165" y1="99" x2="180" y2="114" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" />
                    <circle cx="176" cy="28" r="4" fill="rgba(125,29,45,0.25)" />
                  </svg>
                  <div className="step-num">1</div>
                </div>
                <div className="step-icon-wrap">
                  <div className="step-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line></svg>
                  </div>
                  <div className="step-num">1</div>
                </div>
                <div className="step-connector"><span className="dot"></span></div>
                <div className="step-title">Browse essays</div>
                <p>Filter by school, prompt, or major. Every listing is from a verified admit.</p>
              </div>

              <div className="step reveal">
                <div className="step-card" aria-hidden="true">
                  <svg viewBox="0 0 200 140" fill="none">
                    <rect x="22" y="12" width="94" height="112" rx="10" fill="#fff" stroke="var(--accent)" strokeWidth="2" />
                    <line x1="36" y1="34" x2="100" y2="34" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
                    <line x1="36" y1="48" x2="94" y2="48" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
                    <rect x="32" y="56" width="74" height="13" rx="6.5" fill="rgba(125,29,45,0.10)" />
                    <line x1="36" y1="62" x2="102" y2="62" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" opacity="0.85" />
                    <line x1="36" y1="78" x2="96" y2="78" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
                    <line x1="36" y1="92" x2="88" y2="92" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
                    <rect x="130" y="34" width="56" height="46" rx="10" fill="rgba(125,29,45,0.06)" stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 5" />
                    <line x1="142" y1="52" x2="174" y2="52" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
                    <line x1="142" y1="64" x2="168" y2="64" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
                    <path d="M130 62L108 62" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 4" />
                    <circle cx="158" cy="102" r="12" fill="#fff" stroke="var(--accent)" strokeWidth="2.5" />
                    <path d="M152 102l4 4 8-8" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="step-num">2</div>
                </div>
                <div className="step-icon-wrap">
                  <div className="step-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  </div>
                  <div className="step-num">2</div>
                </div>
                <div className="step-connector"><span className="dot"></span></div>
                <div className="step-title">See why it worked</div>
                <p>Each essay shows the schools it got into, the prompt, and margin notes.</p>
              </div>

              <div className="step reveal">
                <div className="step-card" aria-hidden="true">
                  <svg viewBox="0 0 200 140" fill="none">
                    <line x1="16" y1="66" x2="52" y2="66" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 7" opacity="0.4" />
                    <line x1="16" y1="82" x2="46" y2="82" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 7" opacity="0.4" />
                    <line x1="152" y1="66" x2="184" y2="66" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 7" opacity="0.4" />
                    <line x1="156" y1="82" x2="184" y2="82" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 7" opacity="0.4" />
                    <path d="M76 58V44a24 24 0 0 1 47-7" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
                    <rect x="62" y="58" width="76" height="60" rx="12" fill="#fff" stroke="var(--accent)" strokeWidth="2.5" />
                    <circle cx="100" cy="84" r="8" fill="rgba(125,29,45,0.08)" stroke="var(--accent)" strokeWidth="2.5" />
                    <line x1="100" y1="92" x2="100" y2="103" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
                    <path d="M40 22v12M34 28h12" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" opacity="0.55" />
                    <circle cx="164" cy="30" r="4" fill="rgba(125,29,45,0.25)" />
                  </svg>
                  <div className="step-num">3</div>
                </div>
                <div className="step-icon-wrap">
                  <div className="step-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 7.8-1.3"></path></svg>
                  </div>
                  <div className="step-num">3</div>
                </div>
                <div className="step-connector"><span className="dot"></span></div>
                <div className="step-title">Unlock &amp; read</div>
                <p>Buy a single essay, the full text reveals instantly after checkout.</p>
              </div>

              <div className="step reveal">
                <div className="step-card" aria-hidden="true">
                  <svg viewBox="0 0 200 140" fill="none">
                    <rect x="26" y="14" width="92" height="110" rx="10" fill="#fff" stroke="var(--accent)" strokeWidth="2" />
                    <line x1="40" y1="36" x2="104" y2="36" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
                    <line x1="40" y1="52" x2="98" y2="52" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
                    <line x1="40" y1="68" x2="102" y2="68" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
                    <line x1="40" y1="100" x2="66" y2="100" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" opacity="0.8" />
                    <path d="M146 22l20 20-72 72-26 6 6-26z" fill="rgba(125,29,45,0.07)" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
                    <path d="M138 30l20 20" stroke="var(--accent)" strokeWidth="2" opacity="0.6" />
                    <circle cx="170" cy="84" r="14" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 5" opacity="0.5" />
                    <circle cx="176" cy="116" r="4" fill="rgba(125,29,45,0.25)" />
                  </svg>
                  <div className="step-num">4</div>
                </div>
                <div className="step-icon-wrap">
                  <div className="step-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                  </div>
                  <div className="step-num">4</div>
                </div>
                <div className="step-connector"><span className="dot"></span></div>
                <div className="step-title">Write your own</div>
                <p>Study the voice and structure to write something unmistakably you.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Why admitfolio / comparison ===== */}
      <section className="why" style={{ display: LAUNCHED && pageView === 'browse' ? 'none' : undefined }}>
        <div className="why-inner">
          <div style={{ textAlign: 'center' }}>
            <div className="eyebrow">Why admitfolio</div>
            <h2 className="reveal">The smarter way to start your essay</h2>
            <p className="why-sub">A verified essay costs less than lunch, and shows you exactly what worked.</p>
          </div>

          <div className="compare reveal" id="compare">
            <div className="cmp-spacer"></div>
            <div className="cmp-mine-head">
              <div className="cmp-mine-logo"><span className="w">admitfolio</span><span className="d"></span></div>
            </div>
            <div className="cmp-col-head">Going it alone</div>
            <div className="cmp-col-head">Hiring a counselor</div>
            {comparisonRows.map((r, i) => (
              <Fragment key={i}>
                <div className="cmp-label">{r.feature}</div>
                <div className="cmp-mine">
                  {r.mineText ? (
                    <span className="txt">{r.mineText}</span>
                  ) : (
                    <div className="cmp-check">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                  )}
                </div>
                <div className="cmp-alt"><AltValue v={r.diy} /></div>
                <div className="cmp-alt"><AltValue v={r.agency} /></div>
              </Fragment>
            ))}
            <div className="cmp-foot-spacer"></div>
            <div className="cmp-foot-mine">
              <a className="btn-primary" href="#browse">Browse essays</a>
              <a className="btn-ghost" onClick={openSell}>Sell your essay</a>
            </div>
            <div className="cmp-foot-spacer"></div>
            <div className="cmp-foot-spacer"></div>
          </div>

          {/* Mobile-only card version of the chart (SideShift-style) */}
          <div className="compare-cards reveal">
            <div className="cc-head">
              <span className="cc-brand">admitfolio<i></i></span>
              <span>Going it alone</span>
              <span>Hiring a counselor</span>
            </div>
            {comparisonRows.map((r, i) => (
              <div key={i} className="cc-card">
                <div className="cc-feature">{r.feature}</div>
                <div className="cc-cells">
                  <div className="cc-mine">
                    {r.mineText ? (
                      <span className="txt">{r.mineText}</span>
                    ) : (
                      <div className="cmp-check">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      </div>
                    )}
                  </div>
                  <div className="cc-alt"><AltValue v={r.diyShort ?? r.diy} /></div>
                  <div className="cc-alt"><AltValue v={r.agencyShort ?? r.agency} /></div>
                </div>
              </div>
            ))}
            <div className="cc-actions">
              <a className="btn-primary" href="#browse">Browse essays</a>
              <a className="btn-ghost" onClick={openSell}>Sell your essay</a>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Seller band ===== */}
      <section className="seller" id="sell" style={{ display: LAUNCHED && pageView === 'browse' ? 'none' : undefined }}>
        <div className="seller-card">
          <div className="seller-glow"></div>
          <div className="seller-text">
            <div className="seller-eyebrow">For college students</div>
            <h2>Got in somewhere great? Get paid for it.</h2>
            <p>List the Common App and college essays that worked, and earn every time a student learns from your story.</p>
          </div>
          <div className="seller-actions">
            <a onClick={openSell}>Sell your essay</a>
            <span className="note">Free to list · You set the price · Paid out weekly</span>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer>
        <div className="foot-inner">
          <div className="foot-grid">
            <div>
              <div className="foot-logo"><span className="w">admitfolio</span><span className="d"></span></div>
              <p className="foot-tag">Read the essays that got them in.</p>
            </div>
            <div>
              <div className="foot-col-title">Product</div>
              <div className="foot-links"><a href="#browse">Browse essays</a><a href="#how">How it works</a><a onClick={openSell}>Sell your essay</a></div>
            </div>
            <div>
              <div className="foot-col-title">Legal</div>
              <div className="foot-links"><a href="/guides">Blog</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 Admitfolio. For inspiration, never to copy.</span>
            <span>Made for the overwhelmed applicant.</span>
          </div>
        </div>
      </footer>

      {/* ===== Sell-your-essay onboarding modal ===== */}
      <div className={`modal-overlay${sellOpen ? ' open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="sellTitle" onClick={(e) => { if (e.target === e.currentTarget) closeSell(); }}>
        <div className="modal">
          <button className="modal-close" aria-label="Close" onClick={closeSell}>&times;</button>
          <div className="modal-logo"><span className="w">admitfolio</span><span className="d"></span></div>
          <div className="modal-steps">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`seg${i < Math.min(sellStep, 4) ? ' done' : ''}`}></div>
            ))}
          </div>

          {/* Step 1: email */}
          <div className={stepClass(1)}>
            <div className="modal-eyebrow">Step 1 of 5 · Verify you&apos;re a student</div>
            <h3 id="sellTitle">Sell your essay</h3>
            <p className="sub">Only verified college students can list essays. Enter your school email, it must end in <strong>.edu</strong>.</p>
            <div className="field">
              <label htmlFor="eduEmail">School email</label>
              <input ref={eduEmailRef} type="email" id="eduEmail" placeholder="you@university.edu" autoComplete="email" spellCheck={false} value={eduEmail} onChange={(e) => { setEduEmail(e.target.value); setEmailErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') handleSendCode(); }} />
              <div className={`field-error${emailErr ? ' show' : ''}`}>{emailErr || 'Please enter a valid .edu email address.'}</div>
              <div className="field-hint">We&apos;ll send a 6-digit verification code.</div>
            </div>
            <button className="modal-btn" onClick={handleSendCode} disabled={sendingCode}>{sendingCode ? 'Sending…' : 'Send code'}</button>
          </div>

          {/* Step 2: code */}
          <div className={stepClass(2)}>
            <div className="modal-eyebrow">Step 2 of 5 · Confirm your email</div>
            <h3>Enter your code</h3>
            <p className="sub">We sent a 6-digit code to <strong>{verifiedEmail || 'your email'}</strong>.</p>
            <p className="sub" style={{ fontSize: 13 }}>Don&apos;t see it? Check your spam or junk folder — school inboxes often filter new senders.</p>
            <div className="code-inputs">
              {code.map((c, i) => (
                <input
                  key={i}
                  ref={(el) => { codeRefs.current[i] = el; }}
                  maxLength={1}
                  inputMode="numeric"
                  pattern="[0-9]"
                  value={c}
                  onChange={(e) => handleCodeChange(i, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(i, e)}
                  onPaste={handleCodePaste}
                />
              ))}
            </div>
            <div className={`field-error${codeErr ? ' show' : ''}`}>{codeErr || 'Please enter all 6 digits.'}</div>
            <button className="modal-btn" onClick={handleVerifyCode}>Verify &amp; continue</button>
            <button className="modal-back" onClick={() => setSellStep(1)}>← Use a different email</button>
          </div>

          {/* Step 3: create password (after the OTP is verified) */}
          <div className={stepClass(3)}>
            <div className="modal-eyebrow">Step 3 of 5 · Set a password</div>
            <h3>Create your password</h3>
            <div className="verified-pill"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Email verified</div>
            <p className="sub">You&apos;ll log in with <strong>{verifiedEmail || 'your email'}</strong> and this password next time.</p>
            <div className="field">
              <label htmlFor="signupPassword">Create a password</label>
              <input ref={signupPwRef} type="password" id="signupPassword" placeholder="At least 8 characters" autoComplete="new-password" value={signupPw} onChange={(e) => { setSignupPw(e.target.value); setPwErr(''); }} />
            </div>
            <div className="field">
              <label htmlFor="signupPassword2">Confirm password</label>
              <input type="password" id="signupPassword2" placeholder="Re-enter your password" autoComplete="new-password" value={signupPw2} onChange={(e) => { setSignupPw2(e.target.value); setPwErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordNext(); }} />
              <div className={`field-error${pwErr ? ' show' : ''}`}>{pwErr || 'Passwords must match and be at least 8 characters.'}</div>
            </div>
            <button className="modal-btn" onClick={handlePasswordNext}>Continue</button>
          </div>

          {/* Step 4: current university */}
          <div className={stepClass(4)}>
            <div className="modal-eyebrow">Step 4 of 5 · Your school</div>
            <h3>Where do you go?</h3>
            <div className="verified-pill"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Student verified</div>
            <p className="sub">The school you&apos;re currently enrolled at, this shows on your seller profile.</p>
            <div className="field">
              <label htmlFor="currentUni">Current university</label>
              <input ref={uniRef} type="text" id="currentUni" placeholder="Stanford University" value={currentUni} onChange={(e) => { setCurrentUni(e.target.value); setUniErr(''); }} />
              <div className={`field-error${uniErr ? ' show' : ''}`}>{uniErr || 'Please enter the university you’re attending.'}</div>
            </div>

            <div className="field">
              <label htmlFor="currentMajor">Your major there <span className="floor-hint">(optional)</span></label>
              <input type="text" id="currentMajor" maxLength={80} placeholder="Electrical Engineering" value={currentMajor} onChange={(e) => setCurrentMajor(e.target.value)} />
              <div className="field-hint">Helps applicants find essays from people on their path.</div>
            </div>

            <div className="field">
              <label>How should your name appear on listings?</label>
              <div className="anon-toggle">
                {([
                  { value: 'anonymous', title: 'Always anonymous', sub: 'Your name is never shown, not even after a purchase.' },
                  { value: 'reveal', title: 'Anonymous until bought', sub: 'Anonymous on the listing; buyers see your real name once they’ve bought.' },
                  { value: 'public', title: 'Show my name publicly', sub: 'Your name appears on the listing for everyone to see.' },
                ] as const).map((opt) => (
                  <label key={opt.value} className={`anon-opt${anonMode === opt.value ? ' active' : ''}`}>
                    <input type="radio" name="anonMode" value={opt.value} checked={anonMode === opt.value} onChange={() => setAnonMode(opt.value)} />
                    <div className="anon-opt-body"><span className="ao-title">{opt.title}</span><small>{opt.sub}</small></div>
                  </label>
                ))}
              </div>
              <div className="field-hint">Showing your real name adds credibility. Buyers tend to trust named sellers more. Anonymous listings sell well too.</div>
            </div>

            <button className="modal-btn" onClick={handleUniNext}>Continue</button>
            <button className="modal-back" onClick={() => setSellStep(3)}>← Back</button>
          </div>

          {/* Step 5: listing builder */}
          <div className={`${stepClass(5)} mode-${pricingMode}`} data-step="4">
            <div className="modal-eyebrow">Step 5 of 5 · Build a listing</div>
            <h3>Add your essays</h3>
            <p className="sub">Pick the application system your essays came from, then add every essay in that application so buyers get the complete set.</p>

            <div className="field">
              <label htmlFor="applicationType">Which application are these essays from?</label>
              <select id="applicationType" value={applicationType} onChange={(e) => { setApplicationType(e.target.value); setDetailsErr(''); }}>
                <option value="">Pick an application type…</option>
                <optgroup label="Multi-school platforms">
                  <option value="commonapp">Common App</option>
                  <option value="coalition">Coalition App</option>
                </optgroup>
                <optgroup label="School-specific portals">
                  <option value="uc">UC Application (University of California)</option>
                  <option value="mit">MIT Application</option>
                  <option value="other">Other single school</option>
                </optgroup>
              </select>
              <div className={`req-hint${reqHint ? ' show' : ''}`} dangerouslySetInnerHTML={{ __html: reqHint }} />
            </div>

            <div className="field">
              <label htmlFor="admitInput">Schools you got into with these essays</label>
              <div className={`tag-input-wrap${admitFocus ? ' focus' : ''}`} onClick={() => admitInputRef.current?.focus()}>
                {admits.map((name, i) => (
                  <span key={i} className="tag">
                    {name} <button type="button" aria-label="Remove" onClick={(e) => { e.stopPropagation(); setAdmits((prev) => prev.filter((_, idx) => idx !== i)); }}>&times;</button>
                  </span>
                ))}
                <input ref={admitInputRef} type="text" id="admitInput" list="schoolOptions" placeholder="Choose a school, press Enter" autoComplete="off" value={admitInput} onChange={(e) => setAdmitInput(e.target.value)} onKeyDown={handleAdmitKeyDown} onFocus={() => setAdmitFocus(true)} onBlur={() => { setAdmitFocus(false); addAdmit(); }} />
              </div>
              <datalist id="schoolOptions">
                {SCHOOL_OPTIONS.map((school) => <option key={school} value={school} />)}
              </datalist>
              <div className="field-hint">Choose the exact campus when a university has several.</div>
            </div>

            <div className="field">
              <label htmlFor="listingSchool">Of the schools above, which college is this listing for?</label>
              <select id="listingSchool" value={listingSchool} disabled={admits.length === 0} onChange={(e) => { setListingSchool(e.target.value); setDetailsErr(''); }}>
                <option value="">{admits.length ? 'Choose the main college…' : 'Add a school above first'}</option>
                {admits.map((school) => <option key={school} value={school}>{school}</option>)}
              </select>
              <div className="field-hint">We use this as the card title. Your full list still appears under “Accepted in.”</div>
            </div>

            {/* Always rendered, even with no schools added yet. This is a required
                step, and hiding it until the seller happens to fill in the field
                above meant the requirement was invisible until Submit refused. */}
            <div className="field">
              <label>Proof of admission <span className="floor-hint">(required)</span></label>
              <div>
                {admitProofRows.length === 0 ? (
                  <div className="proof-empty">
                    Add a school above and we&apos;ll ask for proof here.
                  </div>
                ) : (
                  admitProofRows.map((a) => {
                    const f = admitFiles[a.key];
                    return (
                      <label key={a.key} className={`proof-row${f ? ' has-file' : ''}`}>
                        <span className="proof-school">{a.label}</span>
                        <input
                          type="file"
                          accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
                          hidden
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            setAdmitFiles((prev) => ({ ...prev, [a.key]: file }));
                            setDetailsErr('');
                          }}
                        />
                        <span className="proof-file">{f ? f.name : 'Letter, portal, or email proof'}</span>
                      </label>
                    );
                  })
                )}
              </div>
              <div className="field-hint">
                Upload an acceptance letter, admitted-student portal screenshot, or acceptance email for each school.
                PDF, PNG, and JPG files work. Buyers choose an essay by where it got in, so we check every school before a listing goes
                live. Proof files are seen only by our review team, never by buyers, and you can black out anything
                that isn&apos;t your name, the school, and the decision.
              </div>
            </div>

            <div className="field">
              <label htmlFor="appliedMajors">Major(s) you applied to with these essays <span className="floor-hint">(optional)</span></label>
              <input type="text" id="appliedMajors" maxLength={120} placeholder="Electrical Engineering, Computer Science" value={appliedMajors} onChange={(e) => { setAppliedMajors(e.target.value); setDetailsErr(''); }} />
              <div className="field-hint">The intended major(s) on this application. Buyers aiming for the same field will look for this.</div>
            </div>

            <div className="field">
              <label>Essays in this application</label>
              <div>
                {essayRows.map((row, i) => {
                  const isOther = /^other/i.test(row.prompt);
                  return (
                    <div className="essay-row" key={i}>
                      <div className="essay-row-head">
                        <span className="essay-row-title">Essay {i + 1}</span>
                        <button type="button" className="essay-remove" style={{ visibility: essayRows.length > 1 ? 'visible' : 'hidden' }} onClick={() => removeEssayRow(i)}>Remove</button>
                      </div>
                      <select className="essay-prompt" value={row.prompt} onChange={(e) => updateEssayRow(i, { prompt: e.target.value, question: /^other/i.test(e.target.value) ? row.question : '' })}>
                        <option value="">Prompt / essay type…</option>
                        {promptOptions.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                      <input type="text" className={`essay-question${isOther ? ' show' : ''}`} placeholder="Type the exact essay question being answered" value={row.question} onChange={(e) => updateEssayRow(i, { question: e.target.value })} />
                      <label className={`file-drop${row.fileName ? ' has-file' : ''}`} data-tip="Please include the essay question, the essay itself, and the word count after each essay.">
                        <input type="file" accept="application/pdf,.pdf" className="essay-file" hidden onChange={(e) => { const f = e.target.files?.[0] ?? null; updateEssayRow(i, { fileName: f?.name ?? '', file: f }); }} />
                        <span className="fname">{row.fileName || 'Upload essay PDF'}</span>
                      </label>
                      <div className="price-wrap essay-price-wrap"><span>$</span><input type="number" className="essay-price" min={1} max={99} placeholder="13" value={row.price} onChange={(e) => updateEssayRow(i, { price: e.target.value })} /></div>
                    </div>
                  );
                })}
              </div>
              <button className="add-btn" type="button" onClick={addEssayRow}>+ Add another essay</button>
            </div>

            <div className="field">
              <label htmlFor="listingTeaser">One line that captures your essays <span className="floor-hint">(optional)</span></label>
              <input
                type="text"
                id="listingTeaser"
                maxLength={90}
                placeholder="The summer I taught my grandfather's old radio to sing again."
                value={teaser}
                onChange={(e) => { setTeaser(e.target.value); setDetailsErr(''); }}
              />
              <div className="field-hint">Shown on your public listing card to draw readers in. You can skip it.</div>
            </div>

            {/* Smart pricing: the tier is fixed by the admits, not chosen */}
            <div className="field">
              <label>Your price tier</label>
              {suggestedTier ? (
                <div className="tier-fixed">
                  <div className="tf-row">
                    <span className="tf-badge">{TIER[suggestedTier].label}</span>
                    <span className="tf-floor">price floor: ${packageFloor(suggestedTier, essayRows.length)}</span>
                  </div>
                  <div className="field-hint">
                    We suggest <b>{TIER[suggestedTier].label}</b> based on your admits (<b>{admitNames}</b>).
                    Your tier is set automatically and fixes the minimum price above. You can always charge more.
                  </div>
                </div>
              ) : (
                <div className="tier-fixed">
                  <div className="field-hint">💡 Add the schools you got into above and we&apos;ll set your tier and price floor automatically.</div>
                </div>
              )}
            </div>

            <div className="field" id="packagePriceField">
              <label htmlFor="packagePrice">
                {essayRows.length > 1 ? `Your price (all ${essayRows.length} essays)` : 'Your price'}{' '}
                <span className="floor-hint">{suggestedTier ? `(min $${packageFloor(suggestedTier, essayRows.length)})` : ''}</span>
              </label>
              <div className="price-wrap"><span>$</span><input type="number" id="packagePrice" min={1} max={399} placeholder="29" value={packagePrice} onChange={(e) => { setPackagePrice(e.target.value); setDetailsErr(''); }} onBlur={handlePackagePriceBlur} /></div>
              <div className="field-hint">One price covers this whole listing. Buyers get every essay in it.</div>
            </div>

            <div className="field">
              <label htmlFor="sellerNote">Notes for our review team <span className="floor-hint">(optional)</span></label>
              <textarea
                id="sellerNote"
                rows={3}
                maxLength={500}
                placeholder="Anything you'd like the reviewer to know about your essays or admits."
                value={sellerNote}
                onChange={(e) => setSellerNote(e.target.value)}
              />
              <div className="field-hint">Shared only with the admin who reviews your listing. Never shown to buyers.</div>
            </div>

            <div className={`field-error${detailsErr ? ' show' : ''}`}>{detailsErr || 'Please complete every field and upload a PDF for each essay.'}</div>
            <div className="submit-note">
              <b>One listing = one application.</b> This submission covers just the application above (for example, your UC app or one school&apos;s essays). Have essays from other applications? You can submit another listing right after this one.
            </div>
            <button className="modal-btn" onClick={handleSubmitListing} disabled={submitting}>{submitting ? submitLabel || 'Submitting…' : 'Submit for review'}</button>
            <button className="modal-back" onClick={() => setSellStep(4)}>← Back</button>
          </div>

          {/* Step 6: success */}
          <div className={`${stepClass(6)} modal-center`}>
            <div className="success-check">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h3>{successTitle}</h3>
            <p className="sub">Thanks! Every essay is <strong>manually reviewed</strong> by our team to keep quality high. We&apos;ll email <strong>{verifiedEmail || 'you'}</strong> as soon as it&apos;s approved, usually within 2 business days.</p>
            <p className="sub">While you wait, this is your chance to <strong>create your seller profile</strong>: your name, a short bio, and your background. Buyers trust sellers with a story.</p>
            <button className="modal-btn" onClick={() => { const email = verifiedEmail; closeSell(); openDashboard(email); }}>Create your seller profile</button>
            <button className="modal-btn modal-btn-secondary" onClick={() => { resetListingForm(); setSellStep(5); }}>Submit another essay</button>
            <button className="modal-back" onClick={closeSell}>Done for now</button>
          </div>
        </div>
      </div>

      {/* ===== Listing detail sheet ===== */}
      {detailListing && (
        <ListingDetail
          key={detailListing.id}
          listing={detailListing}
          allListings={pubListings}
          onClose={closeDetail}
          onOpenListing={openDetail}
          onUnlock={() => {
            // Close first so the two overlays never stack: the scroll lock and
            // the Escape chain both stay trivially correct that way.
            const l = detailListing;
            closeDetail();
            openBuy({
              listingId: l.id,
              school: schoolShortName(headlineSchool(l)),
              price: l.price || 0,
              summary: publicListingTitle(l),
              essayCount: l.essays.length,
            });
          }}
        />
      )}

      {/* ===== Buyer checkout modal ===== */}
      <div className={`modal-overlay${buyOpen ? ' open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="buyTitle" onClick={(e) => { if (e.target === e.currentTarget) closeBuy(); }}>
        <div className="modal buy-modal">
          <button className="modal-close" aria-label="Close" onClick={closeBuy}>&times;</button>
          <section className="buy-order">
            <div className="buy-order-logo"><span>admitfolio</span><i /></div>
            <button className="buy-back" type="button" onClick={closeBuy}>← Back to listing</button>
            <div className="modal-eyebrow">Checkout · No account needed</div>
            <h3 id="buyTitle">Unlock this listing</h3>
            <p className="buy-intro">Read the full listing immediately after checkout.</p>
            <div className="buy-summary">
              <div className="buy-summary-essay">
                <div className="buy-summary-school">{curItem.school || 'This listing'}</div>
                <div className="buy-summary-hook">
                  {curItem.summary || `${curItem.essayCount || 1} essay${(curItem.essayCount || 1) === 1 ? '' : 's'} from a verified admit.`}
                </div>
              </div>
              <div className="buy-summary-price">{curItem.price != null ? `$${curItem.price}` : ''}</div>
            </div>
            <div className="buy-total"><span>Total</span><i /><strong>{curItem.price != null ? `$${curItem.price}` : ''}</strong></div>
            <div className="buy-delivery">
              <div><b>✓</b><span>Instant private access after payment</span></div>
              <div><b>✓</b><span>Secure reading link sent to your email</span></div>
              <div><b>✓</b><span>For inspiration only, never for copying</span></div>
            </div>
          </section>

          <section className="buy-payment">
            <div className="modal-eyebrow">Secure checkout</div>
            <h4>Pay without leaving Admitfolio</h4>
            <p>Stripe shows Link, Apple Pay, or card when each option is available on your device.</p>
            <div className={`field-error${buyErr ? ' show' : ''}`}>{buyErr || ''}</div>
            <div className="buy-stripe-card">
              <div className="buy-stripe-head">
                <div className="buy-stripe-head-main">
                  <span className="buy-stripe-shield" aria-hidden="true">✓</span>
                  <span><strong>Secure payment</strong><small>Encrypted from end to end</small></span>
                </div>
                <span className="buy-stripe-brand">Powered by Stripe</span>
              </div>
              {buyOpen && curItem.listingId && (
                <EmbeddedListingCheckout
                  key={curItem.listingId}
                  listingId={curItem.listingId}
                  onError={setBuyErr}
                />
              )}
            </div>
            <div className="buy-secure">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>
              Payments handled by Stripe · Card details never touch our servers
            </div>
          </section>
        </div>
      </div>

      {/* ===== Sticky floating waitlist button ===== */}
      <button className={`wl-fab${fabShow ? ' show' : ''}`} type="button" aria-label="Join the waitlist" onClick={openWaitlist}>
        <span className="wl-fab-pulse"></span>Join the waitlist
      </button>

      {/* ===== Scroll-triggered waitlist modal ===== */}
      <div className={`modal-overlay${wlOpen ? ' open' : ''}`} id="waitlistModal" role="dialog" aria-modal="true" aria-labelledby="wlTitle" onClick={(e) => { if (e.target === e.currentTarget) setWlOpen(false); }}>
        <div className="modal">
          <button className="modal-close" aria-label="Close" onClick={() => setWlOpen(false)}>&times;</button>
          <div className="modal-logo"><span className="w">admitfolio</span><span className="d"></span></div>
          <div className="modal-eyebrow"><span className="wl-dot"></span>Coming soon</div>
          <h3 id="wlTitle">Be first to read the essays that got them in.</h3>
          <p className="sub">We&apos;re collecting verified admit essays right now. Drop your email and we&apos;ll tell you the moment they go live. No spam, just one heads-up.</p>
          <form autoComplete="on" onSubmit={handleWlSubmit}>
            <div className="field">
              <input ref={wlEmailRef} type="email" placeholder="you@email.com" autoComplete="email" spellCheck={false} aria-label="Email address" value={wlEmail} onChange={(e) => { setWlEmail(e.target.value); if (wlMsg.text) setWlMsg({ text: '', kind: '' }); }} />
            </div>
            <button type="submit" className="modal-btn" disabled={wlBusy}>{wlBusy ? 'Adding…' : 'Notify me when essays drop'}</button>
            <div className={`notify-msg wl-msg${wlMsg.kind ? ' ' + wlMsg.kind : ''}`}>{wlMsg.text}</div>
          </form>
        </div>
      </div>

      {/* ===== Seller login modal ===== */}
      <div className={`modal-overlay${loginOpen ? ' open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="slTitle" onClick={(e) => { if (e.target === e.currentTarget) closeLogin(); }}>
        <div className="modal">
          <button className="modal-close" aria-label="Close" onClick={closeLogin}>&times;</button>
          <div className="modal-logo"><span className="w">admitfolio</span><span className="d"></span></div>

          <div className={slClass(1)}>
            <div className="modal-eyebrow">Welcome back</div>
            <h3 id="slTitle">Seller login</h3>
            <p className="sub">Log in with your verified .edu email and password.</p>
            <div className="field">
              <label htmlFor="slEmail">School email</label>
              <input ref={slEmailRef} type="email" id="slEmail" placeholder="you@university.edu" autoComplete="email" spellCheck={false} value={slEmail} onChange={(e) => { setSlEmail(e.target.value); setSlLoginErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') slPwRef.current?.focus(); }} />
            </div>
            <div className="field">
              <label htmlFor="slPassword">Password</label>
              <input ref={slPwRef} type="password" id="slPassword" placeholder="Your password" autoComplete="current-password" value={slPassword} onChange={(e) => { setSlPassword(e.target.value); setSlLoginErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }} />
              <div className={`field-error${slLoginErr ? ' show' : ''}`}>{slLoginErr || "That email and password don't match."}</div>
            </div>
            <button className="modal-btn" onClick={handleLogin} disabled={slBusy}>{slBusy ? 'Logging in…' : 'Log in'}</button>
            <div className="sl-links">
              <a className="sl-forgot-link" tabIndex={0} role="button" onClick={goForgot}>Forgot password?</a>
            </div>
            <div className="sl-signup-nudge">
              First time? <a className="sl-signup-link" tabIndex={0} role="button" onClick={openSell}>Sign up to sell your essays →</a>
            </div>
          </div>

          <div className={slClass(2)}>
            <div className="modal-eyebrow">Reset password</div>
            <h3>Forgot your password?</h3>
            <p className="sub">Enter your .edu email and we&apos;ll send a 6-digit code to reset it.</p>
            <div className="field">
              <label htmlFor="slResetEmail">School email</label>
              <input type="email" id="slResetEmail" placeholder="you@university.edu" autoComplete="email" spellCheck={false} value={slEmail} onChange={(e) => { setSlEmail(e.target.value); setSlResetErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') handleSlSendCode(); }} />
              <div className={`field-error${slResetErr ? ' show' : ''}`}>{slResetErr || 'Please enter a valid .edu email address.'}</div>
            </div>
            <button className="modal-btn" onClick={handleSlSendCode} disabled={slSending}>{slSending ? 'Sending…' : 'Send reset code'}</button>
            <button className="modal-back" onClick={() => setSlPane(1)}>← Back to login</button>
          </div>

          <div className={slClass(3)}>
            <div className="modal-eyebrow">Reset password</div>
            <h3>Set a new password</h3>
            <p className="sub">We sent a 6-digit code to <strong>{slEmail || 'your email'}</strong>. Enter it and choose a new password. Don&apos;t see it? Check your spam folder.</p>
            <div className="field">
              <label htmlFor="slCode">6-digit code</label>
              <input ref={slCodeRef} type="text" id="slCode" inputMode="numeric" maxLength={6} placeholder="123456" autoComplete="one-time-code" value={slCode} onChange={(e) => { setSlCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setSlResetErr(''); }} />
            </div>
            <div className="field">
              <label htmlFor="slNewPassword">New password</label>
              <input type="password" id="slNewPassword" placeholder="At least 8 characters" autoComplete="new-password" value={slNewPw} onChange={(e) => { setSlNewPw(e.target.value); setSlResetErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') handleSlReset(); }} />
              <div className={`field-error${slResetErr ? ' show' : ''}`}>{slResetErr || 'Please check the code and password.'}</div>
            </div>
            <button className="modal-btn" onClick={handleSlReset} disabled={slBusy}>{slBusy ? 'Resetting…' : 'Reset password & log in'}</button>
            <button className="modal-back" onClick={() => setSlPane(2)}>← Back</button>
          </div>
        </div>
      </div>

      {/* ===== Seller dashboard overlay ===== */}
      <div className={`dash-overlay${dashOpen ? ' open' : ''}`} role="main" aria-label="Seller dashboard">
        <nav className="dash-nav">
          <div className="dash-nav-logo">
            <div className="logo-word">admitfolio</div>
            <div className="logo-dot"></div>
          </div>
          <div className="dash-nav-center">Seller Dashboard</div>
          <div className="dash-nav-right">
            <span className="dash-seller-email">{sellerEmail}</span>
          </div>
        </nav>

        <div className="dash-body">
          {dashLoading && <div className="dash-empty-state" style={{ marginBottom: 16 }}>Loading your listings…</div>}
          {dashErr && <div className="dash-empty-state" style={{ marginBottom: 16, color: '#b3261e' }}>{dashErr}</div>}
          {/* Earnings overview */}
          <section className="dash-section">
            <div className="dash-section-head">
              <h2 className="dash-h2">Earnings overview</h2>
            </div>
            <div className="dash-stats-row">
              <div className="dash-stat-card">
                <div className="dash-stat-label">Total net earnings</div>
                <div className="dash-stat-value">{fmt(earnings.totalNet)}</div>
                <div className="dash-stat-sub">After platform and transaction fees · all time</div>
              </div>
              <div className="dash-stat-card">
                <div className="dash-stat-label">This month (net)</div>
                <div className="dash-stat-value">{fmt(earnings.monthNet)}</div>
                <div className="dash-stat-sub">Gross {fmt(earnings.monthGross)} · {new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</div>
              </div>
              <div className="dash-stat-card">
                <div className="dash-stat-label">Pending payout</div>
                <div className="dash-stat-value">{fmt(earnings.pendingPayout)}</div>
                <div className="dash-stat-sub">
                  {sellerPayouts?.status === 'setup_required'
                    ? sellerPayouts.accountingPendingCount
                      ? 'Finalizing Stripe transaction fee'
                      : 'Payout setup needed'
                    : sellerPayouts?.status === 'in_review'
                      ? 'Stripe verification in progress'
                      : sellerPayouts?.status === 'ready' && earnings.pendingPayout > 0
                        ? 'Processing automatically through Stripe'
                        : earnings.pendingPayout > 0
                          ? 'Recorded and waiting safely'
                          : 'No unpaid earnings'}
                </div>
              </div>
              <div className="dash-stat-card">
                <div className="dash-stat-label">Total sales</div>
                <div className="dash-stat-value">{earnings.totalSales}</div>
                <div className="dash-stat-sub">Across {publishedCount} live listing{publishedCount === 1 ? '' : 's'}</div>
              </div>
            </div>
            {sellerPayouts?.status === 'setup_required' && (
              <div className="dash-payout-setup" role="region" aria-label="Set up seller payouts">
                <div className="dash-payout-copy">
                  <div className="dash-payout-kicker">Your first sale</div>
                  <div className="dash-payout-title">Congrats, you made your first sale!</div>
                  {sellerPayouts.accountingPendingCount ? (
                    <p>Stripe is finalizing the transaction fee for your sale. Your exact payout will appear here shortly.</p>
                  ) : (
                    <p>
                      You have <strong>{fmt(sellerPayouts.pendingCents / 100)}</strong> waiting.
                      Set up your payout once so Stripe can send this and future earnings to your bank.
                    </p>
                  )}
                  <div className="dash-payout-privacy">Identity and bank details go directly to Stripe. Admitfolio never stores them.</div>
                  {payoutSetupError && <div className="dash-payout-error" role="alert">{payoutSetupError}</div>}
                </div>
                <button className="modal-btn dash-payout-button" type="button" onClick={handlePayoutSetup} disabled={payoutSetupBusy}>
                  {payoutSetupBusy ? 'Opening Stripe…' : 'Set up my payout'}
                </button>
              </div>
            )}
            {sellerPayouts?.status === 'in_review' && (
              <div className="dash-payout-review" role="status">
                <strong>Stripe is reviewing your payout details.</strong>
                <span>Your earnings stay recorded and will be released when Stripe enables payouts.</span>
                <button className="secondary-btn" type="button" onClick={handlePayoutSetup} disabled={payoutSetupBusy}>
                  {payoutSetupBusy ? 'Opening Stripe…' : 'Continue payout setup'}
                </button>
              </div>
            )}
            <div className="dash-revenue-card">
              <div className="dash-revenue-title">All-time revenue breakdown</div>
              <div className="dash-rev-row">
                <span className="dash-rev-label">Gross sales</span>
                <span className="dash-rev-value">{fmt(earnings.totalGross)}</span>
              </div>
              <div className="dash-rev-row fee">
                <span className="dash-rev-label">Admitfolio fee (40%)</span>
                <span className="dash-rev-value">− {fmt(earnings.totalFee)}</span>
              </div>
              <div className="dash-rev-row fee">
                <span className="dash-rev-label">Stripe transaction fee</span>
                <span className="dash-rev-value">− {fmt(earnings.totalStripeFee)}</span>
              </div>
              <div className="dash-rev-row net">
                <span className="dash-rev-label">Your payout</span>
                <span className="dash-rev-value">{fmt(earnings.totalNet)}</span>
              </div>
            </div>
          </section>

          {/* Seller profile: photo, bio, background tags */}
          <section className="dash-section">
            <div className="dash-section-head">
              <h2 className="dash-h2">Your seller profile</h2>
            </div>
            <div className="dash-profile-card">
              <div className="dash-profile-row">
                {/* Avatar is always the seller's initials - no photo uploads */}
                <div className="prof-photo">
                  <span>
                    {(profName.trim()
                      ? profName.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('')
                      : sellerEmail[0] || 'A'
                    ).toUpperCase()}
                  </span>
                </div>
                <div className="prof-photo-copy">
                  <div className="prof-photo-title">Add your name &amp; background</div>
                  <div className="field-hint" style={{ marginTop: 2 }}>Buyers connect with real stories. A name and a couple of sentences build trust.</div>
                </div>
              </div>

              <div className="field" style={{ marginTop: 18 }}>
                <label htmlFor="profName">Your name <span className="floor-hint">(optional)</span></label>
                <input
                  type="text"
                  id="profName"
                  maxLength={80}
                  placeholder="Sarah Chen"
                  autoComplete="name"
                  value={profName}
                  onChange={(e) => { setProfName(e.target.value); setProfMsg({ text: '', kind: '' }); }}
                />
                <div className="field-hint">Shown on your listings according to your display choice: full name, first name only, or hidden.</div>
              </div>

              <div className="field">
                <label htmlFor="profBio">Short bio</label>
                <textarea
                  id="profBio"
                  rows={3}
                  maxLength={300}
                  placeholder="A couple of sentences about you: where you're from, what you study, what your essays are about."
                  value={profBio}
                  onChange={(e) => { setProfBio(e.target.value); setProfMsg({ text: '', kind: '' }); }}
                />
              </div>

              <div className="field">
                <label>Your background <span className="floor-hint">(pick any that apply)</span></label>
                <div className="prof-tags">
                  {PROFILE_TAGS.map((tag) => (
                    <button key={tag} type="button" className={`ptag${profTags.includes(tag) ? ' on' : ''}`} onClick={() => toggleProfTag(tag)}>
                      {tag}
                    </button>
                  ))}
                </div>
                <div className="field-hint">Optional. Shown on your seller profile so applicants with similar journeys can find essays that speak to them.</div>
              </div>

              <div className="prof-actions">
                <button className="modal-btn" style={{ width: 'auto', margin: 0, padding: '11px 26px', fontSize: '14.5px' }} disabled={profBusy} onClick={saveProfile}>
                  {profBusy ? 'Saving…' : 'Save profile'}
                </button>
                <span className={`notify-msg ${profMsg.kind}`} style={{ marginTop: 0 }}>{profMsg.text}</span>
              </div>
            </div>
          </section>

          {/* Per-essay performance */}
          <section className="dash-section">
            <div className="dash-section-head">
              <h2 className="dash-h2">Per-essay performance</h2>
            </div>
            <div className="dash-table">
              {publishedListings.length === 0 ? (
                <div className="dash-empty-state">No published essays yet. Your net revenue will appear here once your first listing goes live.</div>
              ) : (
                <>
                  <div className="dash-table-head">
                    <div>Essay</div><div>Sales</div><div>Price</div><div>Your payout</div>
                  </div>
                  {publishedListings.flatMap((l) =>
                    l.essays.map((e) => (
                      <div className="dash-table-row" key={e.id}>
                        <div>
                          <div className="dash-table-essay">{e.question || e.prompt}</div>
                          <div className="dash-table-school">{resolveListingHeadline({ ...l, essays: l.essays })}{e.price == null && l.packagePrice != null ? ' · package' : ''}</div>
                        </div>
                        <div className="dash-table-num">{e.sales}</div>
                        <div className="dash-table-num">{fmt(e.price ?? l.packagePrice ?? 0)}</div>
                        <div className="dash-table-rev">
                          {fmt(e.sellerEarningsCents != null ? e.sellerEarningsCents / 100 : round2(e.gross * SELLER_SHARE))}
                        </div>
                      </div>
                    )),
                  )}
                </>
              )}
            </div>
          </section>

          {/* Listings management */}
          <section className="dash-section">
            <div className="dash-section-head">
              <h2 className="dash-h2">My listings</h2>
              <button className="modal-btn" style={{ width: 'auto', margin: 0, padding: '10px 22px', fontSize: '14px' }} onClick={() => openSellFromDashboard(sellerEmail, listings[0]?.school || '')}>+ Add new essay</button>
            </div>
            <div>
              {([
                { key: 'approved', label: 'Published', dot: 'published', statuses: ['approved'] },
                { key: 'pending', label: 'Pending review', dot: 'pending', statuses: ['pending'] },
                { key: 'draft', label: 'Rejected / Removed', dot: 'draft', statuses: ['rejected', 'removed'] },
              ] as const).map((g) => {
                const items = listings.filter((l) => (g.statuses as readonly string[]).includes(l.status));
                return (
                  <div className="dash-status-group" key={g.key}>
                    <div className="dash-status-label">
                      <span className={`dash-status-dot ${g.dot}`}></span>
                      {g.label}
                      <span style={{ color: 'var(--faint)', fontWeight: 500 }}>({items.length})</span>
                    </div>
                    {items.length === 0 ? (
                      <div className="dash-empty-state">None yet.</div>
                    ) : (
                      items.map((l) => <ListingCard key={l.id} listing={l} onAction={listingAction} onPriceSaved={priceSaved} />)
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="dash-footer">
            <button className="dash-logout" onClick={handleSellerLogout}>Log out</button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================================================================
   Small presentational helpers
   ==========================================================================*/

/* Comparison cell value: "n/a" renders as an X mark instead of text. */
function AltValue({ v }: { v: string }) {
  if (/^n\/a$/i.test(v.trim())) {
    return (
      <svg className="cc-x" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-label="Not available"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>
    );
  }
  return <>{v}</>;
}

/* Real, purchasable listing card (launch mode). */

// The card leads with the school a buyer is shopping FOR, not the one the
// seller currently attends.
//
// `Listing.school` is the seller's current university, so a student who sold
// their UC essays, their Common App essays and their MIT essays produced three
// cards all titled with the same university. Measured on the live catalogue:
// 88 of 144 cards belong to a seller with more than one listing, and every one
// of those sellers had an identical headline on all of their cards.
//
// New listings store this explicitly. Older multi-admit listings use the
// application name because the old form saved accepted schools, not a single
// listing college. Never guess from the first admit or current university.
function headlineSchool(l: PublicListing): string {
  return l.headlineSchool || resolveListingHeadline({ ...l, essays: l.essays });
}

function listingRankTier(l: PublicListing): number {
  const exactSchool = catalogSchool(l);
  if (exactSchool) return schoolTier(exactSchool);
  return l.admitTags.length > 0
    ? Math.min(...l.admitTags.map((school) => schoolTier(school)))
    : 3;
}

function compareListingRank(a: PublicListing, b: PublicListing): number {
  const schoolA = headlineSchool(a);
  const schoolB = headlineSchool(b);
  const rankA = nationalUniversityRank(schoolA);
  const rankB = nationalUniversityRank(schoolB);
  if (rankA != null || rankB != null) {
    if (rankA == null) return 1;
    if (rankB == null) return -1;
    if (rankA !== rankB) return rankA - rankB;
  }
  const tierDifference = listingRankTier(a) - listingRankTier(b);
  if (tierDifference) return tierDifference;
  return schoolShortName(schoolA).localeCompare(schoolShortName(schoolB));
}

function listingSchoolKey(listing: PublicListing): string {
  const school = headlineSchool(listing);
  return schoolInfo(school)?.domain || schoolShortName(school).toLocaleLowerCase();
}

// The package pill already shows the essay count. Keep this line for the
// contents only, matching the approved browse mockup without repeating the
// same number twice on one card.
//
// This is what actually differs between one seller's listings, and it used to
// read "Verified admit · 4 essays" on every card, which is why the grid looked
// like duplicates.
function contentsLine(l: PublicListing): string {
  // De-duplicated: four UC Personal Insight Questions would otherwise print the
  // same label four times. Labels already contain ' · ', so the separator
  // between them has to be a comma or the whole line reads as one chain.
  const labels: string[] = [];
  for (const e of l.essays) {
    const label = essayLabel(e);
    if (label && !labels.includes(label)) labels.push(label);
  }
  const head = labels.slice(0, 2).join(', ') + (labels.length > 2 ? `, +${labels.length - 2} more` : '');
  return head;
}

function majorsOf(l: PublicListing): string[] {
  return (l.appliedMajors || l.major || '').split(',').map((m) => m.trim()).filter(Boolean);
}

// The first five schools, then a count. Five is a fixed number rather than a
// width budget so every card lists the same amount, and .admit-names reserves
// the height whether or not it is used.
const MAX_ADMIT_NAMES = 5;
function admitNameLine(list: string[]): string {
  const names = list.map((n) => schoolShortName(n));
  const shown = names.slice(0, MAX_ADMIT_NAMES);
  const rest = names.length - shown.length;
  return shown.join(', ') + (rest > 0 ? `, +${rest} more` : '');
}

function isQuestBridgeTag(value: string): boolean {
  return schoolInfo(value)?.domain === 'questbridge.org';
}

function collegeAdmitTags(listing: PublicListing): string[] {
  return listing.admitTags.filter((tag) => !isQuestBridgeTag(tag));
}

function questBridgeLabel(listing: PublicListing): string | null {
  const tags = listing.admitTags.map((tag) => tag.toLowerCase().trim());
  if (tags.includes('questbridge scholar')) return 'QuestBridge Scholar';
  if (tags.includes('questbridge finalist')) return 'QuestBridge Finalist';
  if (tags.includes('questbridge')) return 'QuestBridge';
  return null;
}

// What a browse card calls an essay.
//
// `question` is the seller's free-text box, filled in when they pick "Other",
// and it holds the college's prompt verbatim - some run past 300 characters.
// Printed raw into `.ecard-prompt` (uppercase, letter-spaced) it stopped being
// a label and became the loudest thing on the card, six lines of shouting
// above the essay it was meant to caption.
const OTHER_PROMPT = /^other/i;
const PROMPT_MAX = 52;

// Cut at a word boundary so a label never ends mid-word. If the last space is
// too early to be worth keeping, cut hard instead of leaving a stub.
function truncateWords(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(' ');
  const kept = space > max * 0.6 ? cut.slice(0, space) : cut;
  return kept.replace(/[\s,;:.–—-]+$/, '') + '…';
}

// A preset prompt is already a label ("Why-school · Supplement"), so it wins.
// The seller's own wording is only the better name when there is no preset,
// which is exactly the "Other" case it was added for.
function essayLabel(e: { prompt: string; question: string | null }): string {
  const custom = (e.question || '').trim();
  const preset = (e.prompt || '').trim();
  const raw = !preset || OTHER_PROMPT.test(preset) ? custom || preset : preset;
  return truncateWords(raw, PROMPT_MAX);
}

// Every card gets one accurate title from an essay in this exact listing.
// `openingLine` is extractor-approved and seller-name checks run before it is
// stored. Seller-written marketing copy is only a fallback. A prompt label is
// the last resort for scans or short answers with no safe prose to extract.
function publicListingTitle(listing: PublicListing): string {
  const written = (listing.openingLine || listing.teaser || '').trim();
  if (written) return truncateWords(written, 120);
  const prompt = listing.essays[0] ? essayLabel(listing.essays[0]) : '';
  if (prompt) return prompt;
  const school = schoolShortName(headlineSchool(listing));
  return `${school} admission essay${listing.essays.length === 1 ? '' : ' collection'}`;
}

function sameTitleText(a: string | null | undefined, b: string | null | undefined): boolean {
  const normalize = (value: string | null | undefined) =>
    (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const left = normalize(a);
  const right = normalize(b);
  return Boolean(left && right && left.slice(0, 60) === right.slice(0, 60));
}

// Two shortened labels joined can still run past 100 characters, which is what
// made cards in the same row different heights. So the line gets its own budget:
// the first label always shows, a second only if it fits, and whatever is left
// becomes a count. "+3 more" reads better than a wall of prompt text anyway.
const LINE_MAX = 64;

// Essays are separated by a bullet, not a middle dot, because the preset labels
// contain middle dots themselves ("Why-school · Supplement"). Joined with the
// same character, two essays read as four things.
const BETWEEN = ' • ';

// A listing with four UC essays has four identical labels, and printing them in
// a row ("UC · Personal Insight Question · UC · Personal Insight Question") looks
// like a bug. Collapse repeats into a count and keep the original order.
function tallyLabels(labels: string[]): { label: string; n: number }[] {
  const out: { label: string; n: number }[] = [];
  for (const label of labels) {
    const hit = out.find((x) => x.label === label);
    if (hit) hit.n += 1;
    else out.push({ label, n: 1 });
  }
  return out;
}

function promptLineOf(labels: string[]): string {
  const shown: string[] = [];
  let len = 0;
  let covered = 0;
  for (const { label, n } of tallyLabels(labels)) {
    const text = n > 1 ? `${label} ×${n}` : label;
    const cost = shown.length ? text.length + BETWEEN.length : text.length;
    if (shown.length && (len + cost > LINE_MAX || shown.length === 2)) break;
    shown.push(text);
    len += cost;
    covered += n;
  }
  // The count is of essays left over, not of labels, so it still adds up when a
  // repeat above was collapsed into "×4".
  const rest = labels.length - covered;
  return shown.join(BETWEEN) + (rest > 0 ? `${BETWEEN}+${rest} more` : '');
}

function PublicListingCard({
  listing,
  onUnlock,
  onOpen,
}: {
  listing: PublicListing;
  onUnlock: () => void;
  onOpen: () => void;
}) {
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
    // The whole card opens the detail sheet. It has had `cursor: pointer` since
    // launch while doing nothing, which is why clicking a card felt broken.
    <div
      className={`ecard catalog-card${count > 1 ? ' is-set' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
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
          <span className="ecard-admits-label">Accepted in:</span>
          <span className="admit-names multi" title={admittedColleges.join(', ')}>
            {admittedColleges.length ? admitNameLine(admittedColleges) : 'Not listed'}
          </span>
        </div>
      </div>
      <div className="ecard-foot">
        <div className="ecard-price">
          <span className="p">{listing.price != null ? `$${listing.price}` : ''}</span>
          <span className="w">{count > 1 ? `${count}-essay set` : 'full essay'}</span>
        </div>
        {/* Decided buyers keep the one-click path; stopPropagation so it does
            not also open the sheet behind the buy modal. */}
        <div
          className="ecard-unlock"
          onClick={(e) => {
            e.stopPropagation();
            onUnlock();
          }}
        >
          Unlock
        </div>
      </div>
    </div>
  );
}

function cardTagLabel(tag: string): string {
  if (tag === 'First-generation' || tag === 'First generation') return 'First gen';
  if (tag === 'Low-income background') return 'Low-income';
  return tag;
}

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
function ListingDetail({
  listing,
  allListings,
  onClose,
  onOpenListing,
  onUnlock,
}: {
  listing: PublicListing;
  allListings: PublicListing[];
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
      aria-label={`${label} listing`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet">
        <button className="sheet-x" type="button" aria-label="Close" onClick={onClose}>
          &times;
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
            {listing.price != null ? `$${listing.price}` : 'Free'}
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
          <h4>What you get</h4>
          <ul className="d-essays">
            {listing.essays.map((e, i) => (
              <li key={i}>
                <div className="p">{e.prompt}</div>
                {e.question && <div className="q">{e.question}</div>}
                {e.wordCount ? <div className="q">{e.wordCount} words</div> : null}
              </li>
            ))}
          </ul>
        </div>

        {admittedColleges.length > 0 && (
          <div className="d-sec">
            <h4>Admitted to</h4>
            <div className="d-schools">
              {admittedColleges.map((t) => (
                <SchoolChip key={t} name={t} verified={verified.has(t)} />
              ))}
            </div>
          </div>
        )}

        <div className="d-sec">
          <h4>Now attends</h4>
          <div className="d-schools">
            <SchoolChip name={listing.school} />
          </div>
        </div>

        {majors.length > 0 && (
          <div className="d-sec">
            <h4>Applied as</h4>
            <div className="d-schools">
              {majors.map((m) => (
                <span key={m} className="etag">{m}</span>
              ))}
            </div>
          </div>
        )}

        <div className="d-sec">
          <h4>Seller</h4>
          <div className="d-profile">
            <div className="d-profile-row">
              <LogoBadge letter="V" color="#4a1d6b" school={listing.seller.displayName} size={40} fontSize={16} />
              <div>
                <div className="d-profile-name">{listing.seller.displayName}</div>
                <div className="d-profile-note">
                  {anonymityNote(listing.seller.anonymity)} Listed {listed}.
                </div>
              </div>
            </div>
            {sellerTags.length > 0 && (
              <div className="ecard-tags">
                {sellerTags.map((t) => (
                  <span key={t} className={`etag${isQuestBridgeTag(t) ? ' questbridge' : ''}`}>{cardTagLabel(t)}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {otherListings.length > 0 && (
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
                      {other.price != null ? ` · $${other.price}` : ''}
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

function EssayCard({ essay, onUnlock }: { essay: Essay; onUnlock: () => void }) {
  return (
    <div className="ecard" data-school={essay.school} data-price={essay.price} data-hook={essay.hook}>
      <div className="ecard-head">
        <LogoBadge domain={essay.domain} letter={essay.letter} color={essay.color} school={essay.school} size={42} fontSize={19} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ecard-school">{essay.school}</div>
          <div className="ecard-meta">Class of {essay.year} · {essay.major}</div>
        </div>
        <div className="ecard-rating"><span className="star">★</span>{essay.rating}</div>
      </div>
      <div className="ecard-prompt">{essay.prompt}</div>
      <div className="ecard-hook">{essay.hook}</div>
      {essay.sellerTags.length > 0 && (
        <div className="ecard-tags">
          {essay.sellerTags.map((t) => (
            <span key={t} className="etag">{cardTagLabel(t)}</span>
          ))}
        </div>
      )}
      <div className="ecard-body">
        <div className="ecard-skel"><div style={{ width: '100%' }}></div><div style={{ width: '93%' }}></div><div style={{ width: '74%', opacity: 0.55 }}></div></div>
        <div className="ecard-lock">Unlock to read</div>
      </div>
      <div className="ecard-foot">
        <div className="ecard-price"><span className="p">{essay.price}</span><span className="w">{essay.words} words</span></div>
        <div className="ecard-unlock" onClick={onUnlock}>Unlock</div>
      </div>
    </div>
  );
}

function ListingCard({ listing: l, onAction, onPriceSaved }: {
  listing: SellerListing;
  onAction: (id: string, action: 'takedown' | 'resubmit') => void;
  onPriceSaved: (id: string, data: { packagePrice?: number; essayPrices?: Record<string, number> }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pkgInput, setPkgInput] = useState('');
  const [essayInputs, setEssayInputs] = useState<Record<string, string>>({});
  const [saveErr, setSaveErr] = useState('');
  const [saving, setSaving] = useState(false);

  const isPackage = l.pricingMode === 'package';
  const exactSchool = sellerListingSchool(l);
  const tier = exactSchool
    ? schoolTier(exactSchool)
    : admitsTier(l.admitTags) ?? 3;
  const floor = isPackage ? packageFloor(tier, l.essays.length) : perEssayFloor(tier);

  const metaParts = [`${fmt(listingPrice(l))}/sale`];
  if (l.sales) metaParts.push(`${l.sales} sale${l.sales > 1 ? 's' : ''}`);
  metaParts.push(`Added ${new Date(l.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`);
  const statusLabel = ({ approved: 'Published', pending: 'Pending review', rejected: 'Rejected', removed: 'Removed' }[l.status] || l.status);
  const statusClass = ({ approved: 'published', pending: 'pending', rejected: 'draft', removed: 'draft' }[l.status] || 'draft');

  function startEdit() {
    setPkgInput(l.packagePrice != null ? String(l.packagePrice) : '');
    setEssayInputs(Object.fromEntries(l.essays.map((e) => [e.id, e.price != null ? String(e.price) : ''])));
    setSaveErr('');
    setEditing(true);
  }

  async function savePrice() {
    const payload: { listingId: string; packagePrice?: number; essayPrices?: Record<string, number> } = { listingId: l.id };
    if (isPackage) {
      const p = parseFloat(pkgInput);
      if (isNaN(p) || p < floor) {
        setSaveErr(`Minimum for your tier is $${floor}.`);
        return;
      }
      payload.packagePrice = p;
    } else {
      const prices: Record<string, number> = {};
      for (const e of l.essays) {
        const p = parseFloat(essayInputs[e.id]);
        if (isNaN(p) || p < floor) {
          setSaveErr(`Each essay needs a price of at least $${floor}.`);
          return;
        }
        prices[e.id] = p;
      }
      payload.essayPrices = prices;
    }
    setSaveErr('');
    setSaving(true);
    try {
      const resp = await fetch('/api/seller/listing-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string; packagePrice?: number; essayPrices?: Record<string, number> };
      if (!resp.ok || !data.ok) throw new Error(data.error || 'Could not save the price.');
      onPriceSaved(l.id, { packagePrice: data.packagePrice, essayPrices: data.essayPrices });
      setEditing(false);
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Could not save the price.');
    }
    setSaving(false);
  }

  return (
    <div className="dash-listing-card">
      <div className="dash-listing-info">
        <div className="dash-listing-title">{listingTitle(l)}</div>
        <div className="dash-listing-meta">{metaParts.join(' · ')}</div>
        {l.status === 'rejected' && l.adminNote && <div className="dash-listing-meta">Reviewer note: {l.adminNote}</div>}
        {editing && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {isPackage ? (
              <label className="dash-listing-meta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Package price ($)
                <input type="number" min={floor} value={pkgInput} onChange={(e) => { setPkgInput(e.target.value); setSaveErr(''); }} style={{ width: 90, padding: '4px 8px' }} />
                <span>min ${floor}</span>
              </label>
            ) : (
              l.essays.map((e) => (
                <label key={e.id} className="dash-listing-meta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {(e.question || e.prompt).slice(0, 40)} ($)
                  <input type="number" min={floor} value={essayInputs[e.id] || ''} onChange={(ev) => { setEssayInputs((prev) => ({ ...prev, [e.id]: ev.target.value })); setSaveErr(''); }} style={{ width: 90, padding: '4px 8px' }} />
                  <span>min ${floor}</span>
                </label>
              ))
            )}
            {saveErr && <div className="dash-listing-meta" style={{ color: '#b3261e' }}>{saveErr}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="dash-action-btn" onClick={savePrice} disabled={saving}>{saving ? 'Saving…' : 'Save price'}</button>
              <button className="dash-action-btn" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      <div className="dash-listing-actions">
        <span className={`dash-listing-status ${statusClass}`}>{statusLabel}</span>
        {!editing && <button className="dash-action-btn" onClick={startEdit}>Edit price</button>}
        {l.status === 'approved' && <button className="dash-action-btn danger" onClick={() => onAction(l.id, 'takedown')}>Take down</button>}
        {(l.status === 'removed' || l.status === 'rejected') && <button className="dash-action-btn" onClick={() => onAction(l.id, 'resubmit')}>Resubmit for review</button>}
      </div>
    </div>
  );
}
