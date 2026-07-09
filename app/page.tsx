'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import LogoBadge from '@/components/LogoBadge';
import { schoolTier, TIER, packageFloor, perEssayFloor, admitsTier } from '@/lib/pricing';

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
};

type CmpRow = { feature: string; mineText?: string; diy: string; agency: string };

type Msg = { text: string; kind: '' | 'ok' | 'err' };

type AnonMode = 'anonymous' | 'reveal' | 'public';
type PricingMode = 'package' | 'separate';

type EssayRow = { prompt: string; question: string; fileName: string; file: File | null; price: string };

// Real dashboard data from /api/seller/listings.
type SellerEssay = {
  id: string;
  prompt: string;
  question: string | null;
  price: number | null;
  sales: number;
  gross: number;
};
type SellerListing = {
  id: string;
  school: string;
  status: 'pending' | 'approved' | 'rejected' | 'removed';
  pricingMode: string;
  packagePrice: number | null;
  admitTags: string[];
  adminNote: string | null;
  createdAt: string;
  sales: number;
  gross: number;
  essays: SellerEssay[];
};

const essays: Essay[] = [
  { id: 1, school: 'Stanford', domain: 'stanford.edu', letter: 'S', color: '#8C1515', year: "'27", major: 'Electrical Engineering', prompt: 'Common App · Personal Statement', hook: "The summer I taught my grandfather's old radio to sing again.", price: '$14', rating: '4.9', words: 648, cats: ['Common App', 'STEM'] },
  { id: 2, school: 'Yale', domain: 'yale.edu', letter: 'Y', color: '#00356B', year: "'26", major: 'History', prompt: 'Why Yale · Supplement', hook: 'I found home in the margins of a 200-year-old library book.', price: '$12', rating: '4.8', words: 412, cats: ['Supplements', 'Humanities'] },
  { id: 3, school: 'Princeton', domain: 'princeton.edu', letter: 'P', color: '#E77500', year: "'27", major: 'Public Policy', prompt: 'Activity · Supplement', hook: 'What four years of debate taught me about finally listening.', price: '$11', rating: '4.9', words: 215, cats: ['Supplements', 'Humanities'] },
  { id: 4, school: 'Harvard', domain: 'harvard.edu', letter: 'H', color: '#A51C30', year: "'25", major: 'Sociology', prompt: 'Common App · Personal Statement', hook: 'Translating for my mother at the DMV, one form at a time.', price: '$15', rating: '5.0', words: 655, cats: ['Common App', 'Humanities'] },
  { id: 5, school: 'MIT', domain: 'mit.edu', letter: 'M', color: '#A31F34', year: "'27", major: 'Mechanical Engineering', prompt: 'MIT · The Pleasure Essay', hook: 'Why I still take apart every vacuum cleaner I can find.', price: '$13', rating: '4.7', words: 248, cats: ['Supplements', 'STEM'] },
  { id: 6, school: 'Columbia', domain: 'columbia.edu', letter: 'C', color: '#1D4F91', year: "'26", major: 'Economics', prompt: 'Why Columbia · Supplement', hook: 'The corner bodega that taught me everything about scarcity.', price: '$12', rating: '4.8', words: 300, cats: ['Supplements', 'Humanities'] },
];

const comparisonRows: CmpRow[] = [
  { feature: '2,400+ essays from verified admits', diy: 'Reddit threads, often outdated', agency: "One counselor's experience" },
  { feature: 'Browse by school, prompt & major', diy: 'Hours of Googling', agency: 'Limited to their network' },
  { feature: 'See exactly why each essay worked', diy: 'Pure guesswork', agency: 'Generic frameworks' },
  { feature: 'Margin notes on voice & structure', diy: 'None', agency: 'Sometimes' },
  { feature: 'Read the full text in minutes', diy: 'n/a', agency: 'Weeks of back-and-forth' },
  { feature: 'Cost to get started', mineText: '$11–15 once', diy: 'Free, unreliable', agency: '$200+ / hour' },
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
  mit: { count: 5, name: 'short essays', text: "MIT's own portal uses <b>several short essays</b> — none of these overlap with Common App. Add every essay so buyers see the full application." },
  other: { count: 1, name: 'essays', text: "Add every essay from this school's own application — personal statement, short answers, and any supplements." },
};

const appLabels: Record<string, string> = { commonapp: 'Common App', coalition: 'Coalition App', uc: 'UC Application', mit: 'MIT Application', other: 'Other single school' };

// Map the prototype's 3-way anonymity choice onto the API contract.
const anonApiValue: Record<AnonMode, 'anonymous' | 'firstName' | 'full'> = {
  anonymous: 'anonymous',
  reveal: 'firstName',
  public: 'full',
};

/* ---- Smart pricing engine: see lib/pricing.ts (shared with the server) ---- */

/* ---- Dashboard ---- */
const SELLER_SHARE = 0.7;
const listingPrice = (l: SellerListing) =>
  l.packagePrice ?? l.essays.reduce((sum, e) => sum + (e.price || 0), 0);
const listingTitle = (l: SellerListing) =>
  l.essays.length === 1
    ? `${l.essays[0].question || l.essays[0].prompt} — ${l.school}`
    : `${l.school} · ${l.essays.length} essays`;

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => '$' + round2(n).toFixed(2);
const priceToNumber = (p: string) => parseFloat(String(p).replace(/[^0-9.]/g, '')) || 0;

const eduRe = /^[^@\s]+@[^@\s]+\.edu$/i;
const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const isLocalHost = () => typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);

const WAITLIST_MSG_OK_NEW = "You're on the list! We'll email you the moment essays go live. 💌";
const WAITLIST_MSG_OK_DUP = "You're already on the list — we'll be in touch! 💌";

const newEssayRow = (): EssayRow => ({ prompt: '', question: '', fileName: '', file: null, price: '' });

/* ============================================================================
   Page component
   ==========================================================================*/

export default function Page() {
  /* ---- Featured grid filter (chips are hidden but state preserved) ---- */
  const [filter, setFilter] = useState('All');
  const gridEssays = filter === 'All' ? essays : essays.filter((e) => e.cats.includes(filter));

  /* ---- Which overlays are open (drives body scroll lock) ---- */
  const [sellOpen, setSellOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [wlOpen, setWlOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [dashOpen, setDashOpen] = useState(false);

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
  const [uniErr, setUniErr] = useState('');
  const [anonMode, setAnonMode] = useState<AnonMode>('public');
  const [targetSchool, setTargetSchool] = useState('');
  const [admits, setAdmits] = useState<string[]>([]);
  const [admitInput, setAdmitInput] = useState('');
  const [admitFocus, setAdmitFocus] = useState(false);
  const [essayRows, setEssayRows] = useState<EssayRow[]>([newEssayRow()]);
  const [pricingMode, setPricingMode] = useState<PricingMode>('package');
  const [packagePrice, setPackagePrice] = useState('');
  const [selectedTier, setSelectedTier] = useState<1 | 2 | 3 | null>(null);
  const [tierOverridden, setTierOverridden] = useState(false);
  const [detailsErr, setDetailsErr] = useState('');
  const [listingCount, setListingCount] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitLabel, setSubmitLabel] = useState('');

  const eduEmailRef = useRef<HTMLInputElement>(null);
  const uniRef = useRef<HTMLInputElement>(null);
  const codeRefs = useRef<Array<HTMLInputElement | null>>([]);
  const admitInputRef = useRef<HTMLInputElement>(null);

  const suggestedTier: 1 | 2 | 3 | null = useMemo(() => admitsTier(admits), [admits]);
  const effectiveTier: 1 | 2 | 3 | null = tierOverridden ? selectedTier : suggestedTier;

  // Auto-apply the tier floor to prices (mirrors applyTierToPrices).
  useEffect(() => {
    if (!effectiveTier) return;
    const pf = packageFloor(effectiveTier, essayRows.length);
    setPackagePrice((prev) => {
      const cur = parseFloat(prev);
      if (!prev || isNaN(cur) || cur < pf) return String(pf);
      return prev;
    });
    const ef = perEssayFloor(effectiveTier);
    setEssayRows((prev) =>
      prev.map((row) => {
        const c = parseFloat(row.price);
        if (!row.price || isNaN(c) || c < ef) return { ...row, price: String(ef) };
        return row;
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTier, essayRows.length]);

  const resetListingForm = useCallback(() => {
    setTargetSchool('');
    setPackagePrice('');
    setAdmits([]);
    setAdmitInput('');
    setPricingMode('package');
    setEssayRows([newEssayRow()]);
    setSelectedTier(null);
    setTierOverridden(false);
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
    // Validate the password BEFORE verifying — verification consumes the code,
    // so failing afterwards would strand the user with a dead code.
    if (signupPw.length < 8) {
      setPwErr('Password must be at least 8 characters.');
      return;
    }
    if (signupPw !== signupPw2) {
      setPwErr("Passwords don't match.");
      return;
    }
    setPwErr('');
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
    setSellStep(4);
  }

  /* ---- admit tags ---- */
  function addAdmit() {
    const v = admitInput.trim().replace(/,$/, '').trim();
    if (v && !admits.some((a) => a.toLowerCase() === v.toLowerCase())) {
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
    const req = reqMap[targetSchool];
    if (!req) return '';
    let html = req.text;
    if (req.count > 1) {
      html += `<br>You've added <b>${essayRows.length} of ${req.count}</b> ${req.name}.`;
    }
    return html;
  }, [targetSchool, essayRows.length]);

  const tierSuggestHtml = useMemo(() => {
    if (!admits.length) return "💡 Add the schools you got into above and we'll suggest your tier automatically.";
    const names = admits.slice(0, 3).join(', ') + (admits.length > 3 ? '…' : '');
    const label = suggestedTier ? TIER[suggestedTier].label : '';
    return `💡 Based on your admits (<b>${names}</b>), we suggest <b>${label}</b>. This sets your price floor — charge that or more.`;
  }, [admits, suggestedTier]);

  const tierWarn = tierOverridden && suggestedTier && selectedTier && selectedTier < suggestedTier
    ? 'Heads up: this is a higher tier than your admits suggest. Pricing above your profile can mean fewer sales — you can change it anytime.'
    : '';

  function pickTier(t: 1 | 2 | 3) {
    setSelectedTier(t);
    setTierOverridden(true);
  }
  function handlePackagePriceBlur() {
    if (!effectiveTier) return;
    const pf = packageFloor(effectiveTier, essayRows.length);
    const cur = parseFloat(packagePrice);
    if (isNaN(cur) || cur < pf) setPackagePrice(String(pf));
  }

  async function handleSubmitListing() {
    const rows = essayRows;
    const separate = pricingMode === 'separate';
    let msg = '';
    if (!targetSchool) msg = 'Pick the application type for these essays.';
    else if (admits.length === 0) msg = 'Add at least one school you got into.';
    else if (rows.some((r) => !r.prompt)) msg = 'Choose a prompt type for every essay.';
    else if (rows.some((r) => /^other/i.test(r.prompt) && !r.question.trim())) msg = 'Type the essay question for every "Other" essay.';
    else if (rows.some((r) => !r.file)) msg = 'Upload a PDF for every essay.';
    else if (rows.some((r) => r.file && r.file.size > 4 * 1024 * 1024)) msg = 'Each PDF must be 4MB or smaller.';
    else if (rows.some((r) => r.file && !/\.pdf$/i.test(r.file.name) && r.file.type !== 'application/pdf')) msg = 'Essays must be PDF files.';
    else if (separate && rows.some((r) => !r.price.trim())) msg = 'Set a price for every essay.';
    else if (!separate && !packagePrice.trim()) msg = 'Set a package price.';
    else if (effectiveTier && !separate && parseFloat(packagePrice) < packageFloor(effectiveTier, rows.length)) msg = `Your ${TIER[effectiveTier].label} floor is $${packageFloor(effectiveTier, rows.length)}. You can charge that or more.`;
    else if (effectiveTier && separate && rows.some((r) => parseFloat(r.price) < perEssayFloor(effectiveTier))) msg = `Each essay's floor at ${TIER[effectiveTier].label} is $${perEssayFloor(effectiveTier)}. You can charge that or more.`;

    if (msg) {
      setDetailsErr(msg);
      return;
    }
    setDetailsErr('');

    const payload = {
      email: verifiedEmail,
      emailToken,
      password: signupPw || undefined,
      school: currentUni.trim(),
      admitTags: admits,
      anonymity: anonApiValue[anonMode],
      applicationSystem: appLabels[targetSchool] || targetSchool,
      pricingMode,
      packagePrice: separate ? undefined : Number(packagePrice) || undefined,
      essays: rows.map((r) => ({
        prompt: r.prompt,
        question: /^other/i.test(r.prompt) ? r.question.trim() || undefined : undefined,
        price: separate ? Number(r.price) || undefined : undefined,
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
      };
      if (!resp.ok || data.ok === false) throw new Error(data.error || 'Could not submit your listing. Please try again.');
      if (!data.essays || !data.uploadToken || data.essays.length !== rows.length) {
        throw new Error('Could not submit your listing. Please try again.');
      }

      // Listing created — now upload each PDF (one request per file).
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
    setSellStep(5);
  }

  const successTitle = listingCount <= 1 ? 'Listing submitted!' : `Listing #${listingCount} submitted!`;

  /* ============================ Buyer checkout ============================ */
  const BUYING_ENABLED = false;
  const [buyPane, setBuyPane] = useState(1);
  const [curEssay, setCurEssay] = useState<{ school?: string; price?: string; hook?: string; id?: number }>({});
  const [buyEmail, setBuyEmail] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardZip, setCardZip] = useState('');
  const [buyErr, setBuyErr] = useState('');
  const [buySentTo, setBuySentTo] = useState('your inbox');
  const [paying, setPaying] = useState(false);
  const buyEmailRef = useRef<HTMLInputElement>(null);

  const openBuy = useCallback((essay: { school?: string; price?: string; hook?: string; id?: number }) => {
    setCurEssay(essay || {});
    setBuyEmail('');
    setCardName('');
    setCardNumber('');
    setCardExpiry('');
    setCardCvc('');
    setCardZip('');
    setBuyErr('');
    setBuyPane(1);
    setBuyOpen(true);
    setTimeout(() => buyEmailRef.current?.focus(), 60);
  }, []);
  const closeBuy = useCallback(() => setBuyOpen(false), []);

  // Console helper preserved: admitlyOpenCheckout({ school, price, hook })
  useEffect(() => {
    (window as unknown as { admitlyOpenCheckout?: typeof openBuy }).admitlyOpenCheckout = openBuy;
  }, [openBuy]);

  function handleUnlock(essay: Essay) {
    if (!BUYING_ENABLED) return; // buying dormant until essays are live
    openBuy({ school: essay.school, price: essay.price, hook: essay.hook, id: essay.id });
  }

  async function handlePay() {
    const email = buyEmail.trim();
    const num = cardNumber.replace(/\D/g, '');
    const exp = cardExpiry.replace(/\D/g, '');
    const cvc = cardCvc.replace(/\D/g, '');
    let msg = '';
    if (!emailRe.test(email)) msg = 'Enter a valid email so we can send the essay.';
    else if (!cardName.trim()) msg = 'Enter the name on your card.';
    else if (num.length < 15) msg = 'Enter a valid 16-digit card number.';
    else if (exp.length < 4) msg = 'Enter the card expiry (MM / YY).';
    else if (cvc.length < 3) msg = 'Enter the 3-digit security code.';
    else if (!cardZip.trim()) msg = 'Enter your billing ZIP.';
    if (msg) {
      setBuyErr(msg);
      return;
    }
    setBuyErr('');
    setPaying(true);
    try {
      const resp = await fetch('/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerEmail: email, listingId: curEssay.id, essayId: curEssay.id, amount: priceToNumber(curEssay.price || '') }),
      });
      const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!resp.ok || data.ok === false) throw new Error(data.error || 'Something went wrong.');
      setBuySentTo(email);
      setBuyPane(2);
    } catch (err) {
      setBuyErr(err instanceof Error ? err.message : 'Could not complete the purchase. Please try again.');
    } finally {
      setPaying(false);
    }
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
  useEffect(() => {
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
          if (!hasJoined()) openWaitlist();
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
    setDashErr('');
    setDashLoading(true);
    setDashOpen(true);
    fetch('/api/seller/listings')
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as { listings?: SellerListing[]; monthGross?: number; error?: string };
        if (!r.ok || !d.listings) throw new Error(d.error || 'Could not load your listings.');
        setListings(d.listings);
        setMonthGross(d.monthGross || 0);
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
  const [dashLoading, setDashLoading] = useState(false);
  const [dashErr, setDashErr] = useState('');

  const earnings = useMemo(() => {
    const totalGross = listings.reduce((sum, l) => sum + l.gross, 0);
    const totalSales = listings.reduce((sum, l) => sum + l.sales, 0);
    return {
      totalGross,
      totalNet: round2(totalGross * SELLER_SHARE),
      totalFee: round2(totalGross * (1 - SELLER_SHARE)),
      monthGross,
      monthNet: round2(monthGross * SELLER_SHARE),
      totalSales,
      pendingPayout: round2(totalGross * SELLER_SHARE),
    };
  }, [listings, monthGross]);

  const sellerPct = Math.round(SELLER_SHARE * 100);
  const platformPct = 100 - sellerPct;
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

  // Lock body scroll while any overlay is open.
  useEffect(() => {
    const anyOpen = sellOpen || buyOpen || wlOpen || loginOpen || dashOpen;
    document.body.style.overflow = anyOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sellOpen, buyOpen, wlOpen, loginOpen, dashOpen]);

  // Layout variant body classes + ?login deep-link (mirrors the original IIFEs).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    document.body.classList.add(q.get('layout') === 'backdrop' ? 'layout-backdrop' : 'layout-frame');
    if (q.get('bg') === 'soft') document.body.classList.add('bg-soft');
    let t: ReturnType<typeof setTimeout> | undefined;
    if (q.get('login')) t = setTimeout(() => openLogin(), 300);
    return () => {
      document.body.classList.remove('layout-frame', 'layout-backdrop', 'bg-soft');
      if (t) clearTimeout(t);
    };
  }, [openLogin]);

  // Escape closes the top-most overlay.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (dashOpen) closeDashboard();
      else if (buyOpen) closeBuy();
      else if (sellOpen) closeSell();
      else if (loginOpen) closeLogin();
      else if (wlOpen) setWlOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dashOpen, buyOpen, sellOpen, loginOpen, wlOpen, closeDashboard, closeBuy, closeSell, closeLogin]);

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
  const buyClass = (n: number) => `step-pane${buyPane === n ? ' active' : ''}${n === 2 ? ' modal-center' : ''}`;
  const slClass = (n: number) => `step-pane${slPane === n ? ' active' : ''}`;

  /* ============================ Render ============================ */
  return (
    <>
      <nav className="nav">
        <div className="logo">
          <div className="logo-word">admitfolio</div>
          <div className="logo-dot"></div>
        </div>
        <div className="nav-links">
          <a href="#browse">Browse essays</a>
          <a href="#how">How it works</a>
          <a onClick={openSell}>Sell yours</a>
        </div>
        <div className="nav-cta">
          <a className="login" onClick={openLogin}>Seller login</a>
          <a className="btn-primary" style={{ padding: '10px 20px', fontSize: '15px' }} onClick={openSell}>Sell your essay</a>
        </div>
      </nav>

      {/* ===== Hero ===== */}
      <section className="hero">
        <div>
          <div className="pill"><span className="dot"></span>For inspiration, never to copy</div>
          <h1>Read the essays that <em>got them in</em>.</h1>
          <p>Admitfolio is a marketplace of real college admissions essays, written by the students who got accepted. Browse by school and prompt, see why each one worked, and find the angle only you can write.</p>
          <div className="hero-actions">
            <a className="btn-primary" href="#browse">Browse essays</a>
            <a className="btn-ghost" onClick={openSell}>Sell your essay</a>
          </div>
          <div className="hero-stats">
            <div><div className="stat-num">100%</div><div className="stat-lbl">verified admits</div></div>
          </div>
        </div>

        <div className="hero-art">
          <div className="float-card fc-top">
            <div className="fc-head">
              <div className="badge" style={{ width: '38px', height: '38px', background: '#8C1515', fontSize: '18px' }}>S</div>
              <div style={{ flex: 1, minWidth: 0 }}><div className="fc-school">Stanford</div><div className="fc-year">Class of &apos;27</div></div>
              <div className="fc-rating"><span className="star">★</span> 4.9</div>
            </div>
            <div className="fc-prompt">Common App</div>
            <div className="fc-hook">The summer I taught my grandfather&apos;s old radio to sing again.</div>
            <div className="skel"><div style={{ width: '100%' }}></div><div style={{ width: '84%', opacity: 0.6 }}></div></div>
            <div className="fc-foot"><span className="price" style={{ fontSize: '18px' }}>$14</span><span className="unlock-pill">Unlock</span></div>
          </div>

          <div className="float-card fc-mid">
            <div className="fc-head">
              <div className="badge" style={{ width: '38px', height: '38px', background: '#A51C30', fontSize: '18px' }}>H</div>
              <div style={{ flex: 1, minWidth: 0 }}><div className="fc-school">Harvard</div><div className="fc-year">Class of &apos;25</div></div>
              <div className="fc-rating"><span className="star">★</span> 5.0</div>
            </div>
            <div className="fc-prompt">Personal Statement</div>
            <div className="fc-hook">Translating for my mother at the DMV, one form at a time.</div>
            <div className="skel"><div style={{ width: '100%' }}></div><div style={{ width: '72%', opacity: 0.6 }}></div></div>
            <div className="fc-foot"><span className="price" style={{ fontSize: '18px' }}>$15</span><span className="unlock-pill">Unlock</span></div>
          </div>

          <div className="float-card fc-bot">
            <div className="fc-head">
              <div className="badge" style={{ width: '36px', height: '36px', background: '#00356B', fontSize: '17px' }}>Y</div>
              <div style={{ flex: 1, minWidth: 0 }}><div className="fc-school">Yale</div><div className="fc-year">Class of &apos;26</div></div>
              <div className="fc-rating"><span className="star">★</span> 4.8</div>
            </div>
            <div className="fc-prompt">Why Yale</div>
            <div className="fc-hook" style={{ fontSize: '15px' }}>I found home in the margins of a 200-year-old library book.</div>
          </div>
        </div>
      </section>

      {/* ===== Trust bar ===== */}
      <section className="trust">
        <div className="trust-label">Real essays from students now at</div>
        <div className="trust-row">
          <span>Harvard</span><span>Stanford</span><span>Yale</span><span>Princeton</span>
          <span>MIT</span><span>Columbia</span><span>Brown</span><span>Penn</span>
        </div>
      </section>

      {/* ===== Featured ===== */}
      <section className="featured" id="browse">
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
                <p>Drop your email and we&apos;ll tell you the moment essays become public — no spam, just one heads-up when they&apos;re live.</p>
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
      </section>

      {/* ===== How it works ===== */}
      <section className="how" id="how">
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
                <div className="step-icon-wrap">
                  <div className="step-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line></svg>
                  </div>
                  <div className="step-num">1</div>
                </div>
                <div className="step-title">Browse essays</div>
                <p>Filter by school, prompt, or major. Every listing is from a verified admit.</p>
              </div>

              <div className="step reveal">
                <div className="step-icon-wrap">
                  <div className="step-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  </div>
                  <div className="step-num">2</div>
                </div>
                <div className="step-title">See why it worked</div>
                <p>Each essay shows the schools it got into, the prompt, and margin notes.</p>
              </div>

              <div className="step reveal">
                <div className="step-icon-wrap">
                  <div className="step-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 7.8-1.3"></path></svg>
                  </div>
                  <div className="step-num">3</div>
                </div>
                <div className="step-title">Unlock &amp; read</div>
                <p>Buy a single essay, the full text reveals instantly after checkout.</p>
              </div>

              <div className="step reveal">
                <div className="step-icon-wrap">
                  <div className="step-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                  </div>
                  <div className="step-num">4</div>
                </div>
                <div className="step-title">Write your own</div>
                <p>Study the voice and structure to write something unmistakably you.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Why admitfolio / comparison ===== */}
      <section className="why">
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
                <div className="cmp-alt">{r.diy}</div>
                <div className="cmp-alt">{r.agency}</div>
              </Fragment>
            ))}
            <div className="cmp-foot-spacer"></div>
            <div className="cmp-foot-mine"><a className="btn-primary" href="#browse">Browse essays</a></div>
            <div className="cmp-foot-spacer"></div>
            <div className="cmp-foot-spacer"></div>
          </div>
        </div>
      </section>

      {/* ===== Seller band ===== */}
      <section className="seller" id="sell">
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
              <div className="foot-col-title">Company</div>
              <div className="foot-links"><a>About</a><a>Our standards</a><a>Contact</a></div>
            </div>
            <div>
              <div className="foot-col-title">Legal</div>
              <div className="foot-links"><a>Academic integrity</a><a>Privacy</a><a>Terms</a></div>
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
            <div className="modal-eyebrow">Step 1 of 4 · Verify you&apos;re a student</div>
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

          {/* Step 2: code + create password */}
          <div className={stepClass(2)}>
            <div className="modal-eyebrow">Step 2 of 4 · Confirm your email &amp; set a password</div>
            <h3>Enter your code</h3>
            <p className="sub">We sent a 6-digit code to <strong>{verifiedEmail || 'your email'}</strong>.</p>
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
            <div className="field" style={{ marginTop: '20px' }}>
              <label htmlFor="signupPassword">Create a password</label>
              <input type="password" id="signupPassword" placeholder="At least 8 characters" autoComplete="new-password" value={signupPw} onChange={(e) => { setSignupPw(e.target.value); setPwErr(''); }} />
              <div className="field-hint">You&apos;ll log in with this email + password next time.</div>
            </div>
            <div className="field">
              <label htmlFor="signupPassword2">Confirm password</label>
              <input type="password" id="signupPassword2" placeholder="Re-enter your password" autoComplete="new-password" value={signupPw2} onChange={(e) => { setSignupPw2(e.target.value); setPwErr(''); }} />
              <div className={`field-error${pwErr ? ' show' : ''}`}>{pwErr || 'Passwords must match and be at least 8 characters.'}</div>
            </div>
            <button className="modal-btn" onClick={handleVerifyCode}>Verify &amp; continue</button>
            <button className="modal-back" onClick={() => setSellStep(1)}>← Use a different email</button>
          </div>

          {/* Step 3: current university */}
          <div className={stepClass(3)}>
            <div className="modal-eyebrow">Step 3 of 4 · Your school</div>
            <h3>Where do you go?</h3>
            <div className="verified-pill"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Student verified</div>
            <p className="sub">The school you&apos;re currently enrolled at, this shows on your seller profile.</p>
            <div className="field">
              <label htmlFor="currentUni">Current university</label>
              <input ref={uniRef} type="text" id="currentUni" placeholder="Stanford University" value={currentUni} onChange={(e) => { setCurrentUni(e.target.value); setUniErr(''); }} />
              <div className={`field-error${uniErr ? ' show' : ''}`}>{uniErr || 'Please enter the university you’re attending.'}</div>
            </div>

            <div className="field">
              <label>How should your name appear on listings?</label>
              <div className="anon-toggle">
                {([
                  { value: 'anonymous', title: 'Always anonymous', sub: 'Your name is never shown — not even after a purchase.' },
                  { value: 'reveal', title: 'Anonymous until bought', sub: 'Anonymous on the listing; buyers see your real name once they’ve bought.' },
                  { value: 'public', title: 'Show my name publicly', sub: 'Your name appears on the listing for everyone to see.' },
                ] as const).map((opt) => (
                  <label key={opt.value} className={`anon-opt${anonMode === opt.value ? ' active' : ''}`}>
                    <input type="radio" name="anonMode" value={opt.value} checked={anonMode === opt.value} onChange={() => setAnonMode(opt.value)} />
                    <div className="anon-opt-body"><span className="ao-title">{opt.title}</span><small>{opt.sub}</small></div>
                  </label>
                ))}
              </div>
              <div className="field-hint">Showing your real name adds credibility — buyers tend to trust named sellers more. Anonymous listings sell well too.</div>
            </div>

            <button className="modal-btn" onClick={handleUniNext}>Continue</button>
            <button className="modal-back" onClick={() => setSellStep(2)}>← Back</button>
          </div>

          {/* Step 4: listing builder */}
          <div className={`${stepClass(4)} mode-${pricingMode}`} data-step="4">
            <div className="modal-eyebrow">Step 4 of 4 · Build a listing</div>
            <h3>Add your essays</h3>
            <p className="sub">Pick the application system your essays came from, then add every essay in that application so buyers get the complete set.</p>

            <div className="field">
              <label htmlFor="targetSchool">Which application are these essays from?</label>
              <select id="targetSchool" value={targetSchool} onChange={(e) => { setTargetSchool(e.target.value); setDetailsErr(''); }}>
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
                <input ref={admitInputRef} type="text" id="admitInput" placeholder="Type a school, press Enter" autoComplete="off" value={admitInput} onChange={(e) => setAdmitInput(e.target.value)} onKeyDown={handleAdmitKeyDown} onFocus={() => setAdmitFocus(true)} onBlur={() => { setAdmitFocus(false); addAdmit(); }} />
              </div>
              <div className="field-hint">Add every school these essays helped you get into.</div>
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

            {/* Smart pricing */}
            <div className="field">
              <label>Your price tier</label>
              <div className="tier-suggest" dangerouslySetInnerHTML={{ __html: tierSuggestHtml }} />
              <div className="tier-cards">
                {([1, 2, 3] as const).map((t) => {
                  const meta = {
                    1: { title: 'Tier 1 · Top', sub: 'HYPSM, Ivies & equivalents' },
                    2: { title: 'Tier 2 · Strong', sub: 'Highly selective · top 20–50' },
                    3: { title: 'Tier 3 · Standard', sub: 'State school · fewer selective admits' },
                  }[t];
                  return (
                    <label key={t} className={`tier-card${effectiveTier === t ? ' active' : ''}${suggestedTier === t ? ' suggested' : ''}`} onClick={() => pickTier(t)}>
                      <input type="radio" name="tier" value={t} checked={effectiveTier === t} readOnly />
                      <div className="tc-body"><span className="tc-title">{meta.title}</span><small>{meta.sub}</small></div>
                      <span className="tc-floor">from ${packageFloor(t, essayRows.length)}</span>
                    </label>
                  );
                })}
              </div>
              <div className={`tier-warn${tierWarn ? ' show' : ''}`}>{tierWarn}</div>
            </div>

            <div className="field">
              <label>How do you want to sell them?</label>
              <div className="price-toggle">
                <label className={`price-opt${pricingMode === 'package' ? ' active' : ''}`}>
                  <input type="radio" name="pricing" value="package" checked={pricingMode === 'package'} onChange={() => setPricingMode('package')} />
                  <span className="po-title">Package deal</span><small>One price, whole set</small>
                </label>
                <label className={`price-opt${pricingMode === 'separate' ? ' active' : ''}`}>
                  <input type="radio" name="pricing" value="separate" checked={pricingMode === 'separate'} onChange={() => setPricingMode('separate')} />
                  <span className="po-title">Sell separately</span><small>Price each essay</small>
                </label>
              </div>
              <div className="field" id="packagePriceField">
                <label htmlFor="packagePrice">Package price <span className="floor-hint">{effectiveTier ? `(min $${packageFloor(effectiveTier, essayRows.length)})` : ''}</span></label>
                <div className="price-wrap"><span>$</span><input type="number" id="packagePrice" min={1} max={399} placeholder="29" value={packagePrice} onChange={(e) => { setPackagePrice(e.target.value); setDetailsErr(''); }} onBlur={handlePackagePriceBlur} /></div>
              </div>
            </div>

            <div className={`field-error${detailsErr ? ' show' : ''}`}>{detailsErr || 'Please complete every field and upload a PDF for each essay.'}</div>
            <button className="modal-btn" onClick={handleSubmitListing} disabled={submitting}>{submitting ? submitLabel || 'Submitting…' : 'Submit for review'}</button>
            <button className="modal-back" onClick={() => setSellStep(3)}>← Back</button>
          </div>

          {/* Step 5: success */}
          <div className={`${stepClass(5)} modal-center`}>
            <div className="success-check">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h3>{successTitle}</h3>
            <p className="sub">Thanks! Every essay is <strong>manually reviewed</strong> by our team to keep quality high. We&apos;ll email <strong>{verifiedEmail || 'you'}</strong> as soon as it&apos;s approved, usually within 2 business days.</p>
            <button className="modal-btn" onClick={() => { resetListingForm(); setSellStep(4); }}>+ Add another listing</button>
            <button className="modal-back" onClick={closeSell}>Done for now</button>
          </div>
        </div>
      </div>

      {/* ===== Buyer checkout modal ===== */}
      <div className={`modal-overlay${buyOpen ? ' open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="buyTitle" onClick={(e) => { if (e.target === e.currentTarget) closeBuy(); }}>
        <div className="modal">
          <button className="modal-close" aria-label="Close" onClick={closeBuy}>&times;</button>
          <div className="modal-logo"><span className="w">admitfolio</span><span className="d"></span></div>

          <div className={buyClass(1)}>
            <div className="modal-eyebrow">Checkout · No account needed</div>
            <h3 id="buyTitle">Unlock this essay</h3>
            <div className="buy-summary">
              <div className="buy-summary-essay">
                <div className="buy-summary-school">{curEssay.school || 'This essay'}</div>
                <div className="buy-summary-hook">{curEssay.hook || 'The full essay, stats & margin notes.'}</div>
              </div>
              <div className="buy-summary-price">{curEssay.price || ''}</div>
            </div>

            <div className="field">
              <label htmlFor="buyEmail">Email to send it to</label>
              <input ref={buyEmailRef} type="email" id="buyEmail" placeholder="you@email.com" inputMode="email" autoComplete="email" spellCheck={false} value={buyEmail} onChange={(e) => { setBuyEmail(e.target.value); setBuyErr(''); }} />
              <div className="field-hint">We&apos;ll send the full essay &amp; receipt here — no account needed.</div>
            </div>

            <div className="field">
              <label htmlFor="cardName">Name on card</label>
              <input type="text" id="cardName" placeholder="Jordan Lee" autoComplete="cc-name" value={cardName} onChange={(e) => { setCardName(e.target.value); setBuyErr(''); }} />
            </div>
            <div className="field">
              <label htmlFor="cardNumber">Card number</label>
              <input type="text" id="cardNumber" placeholder="1234 5678 9012 3456" inputMode="numeric" autoComplete="cc-number" maxLength={19} value={cardNumber} onChange={(e) => { const digits = e.target.value.replace(/\D/g, '').slice(0, 16); setCardNumber(digits.replace(/(.{4})/g, '$1 ').trim()); setBuyErr(''); }} />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="cardExpiry">Expiry</label>
                <input type="text" id="cardExpiry" placeholder="MM / YY" inputMode="numeric" autoComplete="cc-exp" maxLength={7} value={cardExpiry} onChange={(e) => { let d = e.target.value.replace(/\D/g, '').slice(0, 4); if (d.length >= 3) d = d.slice(0, 2) + ' / ' + d.slice(2); setCardExpiry(d); setBuyErr(''); }} />
              </div>
              <div className="field">
                <label htmlFor="cardCvc">CVC</label>
                <input type="text" id="cardCvc" placeholder="123" inputMode="numeric" autoComplete="cc-csc" maxLength={4} value={cardCvc} onChange={(e) => { setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4)); setBuyErr(''); }} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="cardZip">Billing ZIP</label>
              <input type="text" id="cardZip" placeholder="94305" inputMode="numeric" autoComplete="postal-code" maxLength={10} value={cardZip} onChange={(e) => { setCardZip(e.target.value.replace(/[^0-9-]/g, '').slice(0, 10)); setBuyErr(''); }} />
            </div>

            <div className={`field-error${buyErr ? ' show' : ''}`}>{buyErr || 'Please fill in your full card details.'}</div>
            <button className="modal-btn" onClick={handlePay} disabled={paying}>{paying ? 'Processing…' : <>Pay <span>{curEssay.price || ''}</span> &amp; unlock</>}</button>
            <div className="buy-secure">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>
              Encrypted &amp; secure · One-time charge
            </div>
          </div>

          <div className={buyClass(2)}>
            <div className="success-check">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h3>Essay unlocked!</h3>
            <p className="sub">Payment received 🎉 We&apos;ve emailed the full essay, stats, and margin notes — plus your receipt — to <strong>{buySentTo}</strong>. Check your email!</p>
            <button className="modal-btn" onClick={closeBuy}>Read the essay</button>
            <button className="modal-back" onClick={closeBuy}>Close</button>
          </div>
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
          <p className="sub">We&apos;re collecting verified admit essays right now. Drop your email and we&apos;ll tell you the moment they go live — no spam, just one heads-up.</p>
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
            <p className="sub">We sent a 6-digit code to <strong>{slEmail || 'your email'}</strong>. Enter it and choose a new password.</p>
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
              <div className="dash-fee-badge">Platform takes {platformPct}% · you keep {sellerPct}%</div>
            </div>
            <div className="dash-stats-row">
              <div className="dash-stat-card">
                <div className="dash-stat-label">Total net earnings</div>
                <div className="dash-stat-value">{fmt(earnings.totalNet)}</div>
                <div className="dash-stat-sub">After {platformPct}% platform fee · all time</div>
              </div>
              <div className="dash-stat-card">
                <div className="dash-stat-label">This month (net)</div>
                <div className="dash-stat-value">{fmt(earnings.monthNet)}</div>
                <div className="dash-stat-sub">Gross {fmt(earnings.monthGross)} · {new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</div>
              </div>
              <div className="dash-stat-card">
                <div className="dash-stat-label">Pending payout</div>
                <div className="dash-stat-value">{fmt(earnings.pendingPayout)}</div>
                <div className="dash-stat-sub">{earnings.pendingPayout > 0 ? 'Payouts start when buying launches' : 'No sales yet'}</div>
              </div>
              <div className="dash-stat-card">
                <div className="dash-stat-label">Total sales</div>
                <div className="dash-stat-value">{earnings.totalSales}</div>
                <div className="dash-stat-sub">Across {publishedCount} live listing{publishedCount === 1 ? '' : 's'}</div>
              </div>
            </div>
            <div className="dash-revenue-card">
              <div className="dash-revenue-title">All-time revenue breakdown</div>
              <div className="dash-rev-row">
                <span className="dash-rev-label">Gross sales</span>
                <span className="dash-rev-value">{fmt(earnings.totalGross)}</span>
              </div>
              <div className="dash-rev-row fee">
                <span className="dash-rev-label">Platform fee ({platformPct}%)</span>
                <span className="dash-rev-value">− {fmt(earnings.totalFee)}</span>
              </div>
              <div className="dash-rev-row net">
                <span className="dash-rev-label">Your payout ({sellerPct}%)</span>
                <span className="dash-rev-value">{fmt(earnings.totalNet)}</span>
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
                    <div>Essay</div><div>Sales</div><div>Price</div><div>Your rev.</div>
                  </div>
                  {publishedListings.flatMap((l) =>
                    l.essays.map((e) => (
                      <div className="dash-table-row" key={e.id}>
                        <div>
                          <div className="dash-table-essay">{e.question || e.prompt}</div>
                          <div className="dash-table-school">{l.school}{e.price == null && l.packagePrice != null ? ' · package' : ''}</div>
                        </div>
                        <div className="dash-table-num">{e.sales}</div>
                        <div className="dash-table-num">{fmt(e.price ?? l.packagePrice ?? 0)}</div>
                        <div className="dash-table-rev">{fmt(round2(e.gross * SELLER_SHARE))}</div>
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
              <button className="modal-btn" style={{ width: 'auto', margin: 0, padding: '10px 22px', fontSize: '14px' }} onClick={() => { closeDashboard(); openSell(); }}>+ Add new essay</button>
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
  const tier = admitsTier(l.admitTags);
  const floor = tier ? (isPackage ? packageFloor(tier, l.essays.length) : perEssayFloor(tier)) : 1;

  const metaParts = [`${fmt(listingPrice(l))}/sale`];
  if (l.sales) metaParts.push(`${l.sales} sale${l.sales > 1 ? 's' : ''}`);
  metaParts.push(`Added ${new Date(l.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`);
  const statusLabel = { approved: 'Published', pending: 'Pending review', rejected: 'Rejected', removed: 'Removed' }[l.status] || l.status;
  const statusClass = { approved: 'published', pending: 'pending', rejected: 'draft', removed: 'draft' }[l.status] || 'draft';

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
