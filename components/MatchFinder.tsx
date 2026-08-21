'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import LogoBadge from '@/components/LogoBadge';
import { catalogSchool } from '@/lib/listingSchool';
import { schoolColor, schoolInfo, schoolShortName } from '@/lib/schools';
import { ANALYTICS_EVENTS, trackConversion } from '@/lib/analyticsEvents';

type MatchListing = {
  id: string;
  school: string;
  targetSchool?: string | null;
  applicationSystem?: string | null;
  admitTags: string[];
  price: number | null;
  teaser: string | null;
  openingLine?: string | null;
  appliedMajors: string | null;
  essays: { prompt: string; question: string | null; wordCount: number | null }[];
  seller: { backgroundTags: string[] };
};

type MatchResult = { listing: MatchListing; score: number; reasons: string[] };
type Message =
  | { id: number; kind: 'you'; text: string }
  | { id: number; kind: 'bot'; text: string; results?: MatchResult[]; query?: string; budget?: number | null };

const SUGGESTIONS = [
  'UC PIQs for Berkeley engineering under $40',
  'Common App personal statement under $50',
  'Why school supplement for Georgia Tech, computer science',
  'First generation essay under $30',
];

const SUBJECTS: { words: string[]; matches: string[] }[] = [
  { words: ['computer science', 'programming', 'coding', 'software', ' cs '], matches: ['computer science', 'computing', 'software'] },
  { words: ['engineering', 'engineer'], matches: ['engineering'] },
  { words: ['business', 'entrepreneur'], matches: ['business', 'entrepreneur', 'management'] },
  { words: ['biology', 'premed', 'pre-med', 'medicine'], matches: ['biology', 'biomedical', 'health', 'neuroscience'] },
  { words: ['economics', ' econ '], matches: ['econom'] },
  { words: ['psychology', ' psych '], matches: ['psycholog'] },
  { words: ['political science', 'government'], matches: ['political', 'government'] },
  { words: ['data science', 'statistics'], matches: ['data', 'statistic'] },
];

const BACKGROUNDS: { words: string[]; label: string }[] = [
  { words: ['first generation', 'first-generation', 'first gen', 'first-gen'], label: 'First-generation' },
  { words: ['low income', 'low-income', 'financial aid'], label: 'Low-income background' },
  { words: ['immigrant', 'refugee'], label: 'Immigrant family' },
  { words: ['international student'], label: 'International student' },
  { words: ['questbridge'], label: 'QuestBridge' },
  { words: ['athlete', 'sports', 'varsity'], label: 'Student athlete' },
];

function targetSchool(listing: MatchListing): string {
  return catalogSchool(listing) || 'College essay listing';
}

function parseBudget(query: string): number | null {
  const match = query.match(/(?:under|below|less than|at most|max(?:imum)?|up to|budget(?:\s+(?:of|is))?)\s*\$?\s*(\d{1,4})|\$\s*(\d{1,4})/i);
  return match ? Number(match[1] || match[2]) : null;
}

function normalize(value: string): string {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

function runMatch(listings: MatchListing[], raw: string): { results: MatchResult[]; budget: number | null; summary: string } {
  const query = normalize(raw);
  const budget = parseBudget(raw);
  const schoolMatches = Array.from(
    new Set(
      listings
        .map((listing) => targetSchool(listing))
        .filter((school) => {
          const info = schoolInfo(school);
          return normalize(school).trim().length > 2 && (
            query.includes(normalize(school)) ||
            (info ? query.includes(normalize(info.short)) : false)
          );
        }),
    ),
  );
  const subjects = SUBJECTS.filter((subject) => subject.words.some((word) => query.includes(normalize(word))));
  const backgrounds = BACKGROUNDS.filter((tag) => tag.words.some((word) => query.includes(normalize(word))));
  const wantsPackage = /\b(package|set|multiple|bundle)\b/.test(query);
  const wantsSingle = /\b(single|one essay|individual)\b/.test(query);
  const wantsCommonApp = /common app|personal statement/.test(query);
  const wantsUc = /\buc\b|piq|personal insight/.test(query);
  const wantsWhy = /why school|why-school|why us/.test(query);

  let pool = listings.filter((listing) => listing.price != null && (budget == null || listing.price <= budget));
  if (schoolMatches.length) {
    const exact = pool.filter((listing) => schoolMatches.some((school) => schoolInfo(school)?.domain === schoolInfo(targetSchool(listing))?.domain));
    if (exact.length) pool = exact;
  }
  if (wantsPackage) pool = pool.filter((listing) => listing.essays.length > 1);
  if (wantsSingle) pool = pool.filter((listing) => listing.essays.length === 1);

  const results = pool
    .map((listing): MatchResult => {
      const reasons: string[] = [];
      let score = 0;
      const major = (listing.appliedMajors || '').toLowerCase();
      const promptText = listing.essays.map((essay) => `${essay.prompt} ${essay.question || ''}`).join(' ').toLowerCase();
      const tagText = `${listing.seller.backgroundTags.join(' ')} ${listing.admitTags.join(' ')}`.toLowerCase();

      if (schoolMatches.length && schoolMatches.some((school) => schoolInfo(school)?.domain === schoolInfo(targetSchool(listing))?.domain)) {
        score += 10;
        reasons.push(`for ${schoolShortName(targetSchool(listing))}`);
      }
      for (const subject of subjects) {
        if (subject.matches.some((word) => major.includes(word))) {
          score += 4;
          reasons.push('matches your subject');
          break;
        }
      }
      for (const background of backgrounds) {
        if (tagText.includes(background.label.toLowerCase().replace('questbridge', 'questbridge'))) {
          score += 3;
          reasons.push(background.label.toLowerCase());
        }
      }
      if (wantsCommonApp && /common app|personal statement/.test(promptText)) { score += 5; reasons.push('personal statement included'); }
      if (wantsUc && /personal insight|piq|uc /.test(promptText)) { score += 5; reasons.push('UC PIQs included'); }
      if (wantsWhy && /why-school|why school|why us/.test(promptText)) { score += 5; reasons.push('why-school essay included'); }
      if (listing.essays.length > 1) score += 0.5;
      if (listing.price != null) score += Math.max(0, (200 - listing.price) / 400);
      return { listing, score, reasons };
    })
    .sort((a, b) => b.score - a.score || (a.listing.price || 0) - (b.listing.price || 0));

  const parsed = [
    schoolMatches.length ? schoolMatches.map(schoolShortName).join(', ') : '',
    subjects.length ? 'subject' : '',
    backgrounds.length ? backgrounds.map((tag) => tag.label).join(', ') : '',
    wantsCommonApp || wantsUc || wantsWhy ? 'essay type' : '',
    budget != null ? `$${budget} max` : '',
  ].filter(Boolean);
  return {
    results,
    budget,
    summary: parsed.length ? `I matched on ${parsed.join(', ')}.` : 'This is a broad match. Add a school, subject, essay type, or budget to narrow it down.',
  };
}

export default function MatchFinder({
  listings,
  open,
  onOpenChange,
  onOpenListing,
  onShowMatches,
}: {
  listings: MatchListing[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenListing: (id: string) => void;
  onShowMatches: (ids: string[], query: string) => void;
}) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [bandVisible, setBandVisible] = useState(false);
  const [nudgeReady, setNudgeReady] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const bandRef = useRef<HTMLElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageId = useRef(0);

  useEffect(() => {
    if (!bandRef.current) return;
    const observer = new IntersectionObserver(([entry]) => setBandVisible(entry.isIntersecting), { threshold: 0.2 });
    observer.observe(bandRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const startedAt = Date.now();
    const checkBrowseIntent = () => {
      const hasBrowsedLongEnough = Date.now() - startedAt >= 8000;
      const hasSeenEnoughCards = window.scrollY > Math.max(560, window.innerHeight * 0.75);
      if (hasBrowsedLongEnough && hasSeenEnoughCards) setNudgeReady(true);
    };
    const timer = window.setInterval(checkBrowseIntent, 1000);
    window.addEventListener('scroll', checkBrowseIntent, { passive: true });
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('scroll', checkBrowseIntent);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!messages.length) {
      setMessages([{ id: ++messageId.current, kind: 'bot', text: 'Tell me what you are shopping for. A target school, subject, essay type, and budget all help.' }]);
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, messages.length]);

  useEffect(() => {
    if (open && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, open]);

  const pricedCount = useMemo(() => listings.filter((listing) => listing.price != null).length, [listings]);

  function ask(raw: string) {
    const value = raw.trim();
    if (!value) return;
    const match = runMatch(listings, value);
    trackConversion(ANALYTICS_EVENTS.matchSearch, {
      resultCount: match.results.length,
      budgetSet: match.budget != null,
    });
    setMessages((current) => [
      ...current,
      { id: ++messageId.current, kind: 'you', text: value },
      {
        id: ++messageId.current,
        kind: 'bot',
        text: match.results.length
          ? `${match.summary} ${match.results.length} listing${match.results.length === 1 ? '' : 's'} fit. Here are the strongest options.`
          : `${match.summary} Nothing fits those filters yet. Try a higher budget or a different school.`,
        results: match.results.slice(0, 6),
        query: value,
        budget: match.budget,
      },
    ]);
    setInput('');
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    ask(input);
  }

  return (
    <>
      <section className="mf-band" ref={bandRef}>
        <div className="mf-band-glow"></div>
        <div className="mf-band-text">
          <span className="mf-eyebrow"><span className="dot"></span>Find my matches</span>
          <h3>Get a shorter list that fits you.</h3>
          <p>Tell us your school, subject, essay type and budget. We will surface the strongest matches.</p>
        </div>
        <button className="btn-primary" type="button" onClick={() => onOpenChange(true)}>Find my matches</button>
      </section>

      {!open && !bandVisible && nudgeReady && !nudgeDismissed && (
        <aside className="mf-nudge" aria-label="Need help choosing an essay?">
          <span className="mf-nudge-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
              <path d="m5.6 5.6 2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
              <circle cx="12" cy="12" r="3.2" />
            </svg>
          </span>
          <button
            className="mf-nudge-main"
            type="button"
            onClick={() => {
              setNudgeDismissed(true);
              onOpenChange(true);
            }}
          >
            <strong>Still deciding?</strong>
            <span>Get a short list based on your school, essay type and budget.</span>
            <b>Find my matches →</b>
          </button>
          <button className="mf-nudge-x" type="button" aria-label="Dismiss" onClick={() => setNudgeDismissed(true)}>&times;</button>
        </aside>
      )}

      {open && (
        <div className="mf-panel" role="dialog" aria-modal="false" aria-label="Find my matches">
          <div className="mf-panel-head">
            <div className="t">Find my matches</div>
            <div className="s">scored in-page</div>
            <button className="mf-x" type="button" aria-label="Close" onClick={() => onOpenChange(false)}>&times;</button>
          </div>
          <div className="mf-log" ref={logRef} aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={`mf-msg ${message.kind}`}>
                {message.kind === 'you' ? message.text : (
                  <div className="bubble">
                    <div>{message.text}</div>
                    {message.results && message.results.length > 0 && (
                      <>
                        <div className="mf-results">
                          {message.results.map(({ listing, reasons }) => {
                            const school = targetSchool(listing);
                            const info = schoolInfo(school);
                            const label = info ? info.short : schoolShortName(school);
                            return (
                              <button className="mf-res" type="button" key={listing.id} onClick={() => onOpenListing(listing.id)}>
                                <LogoBadge domain={info?.domain} letter={(label[0] || 'A').toUpperCase()} color={schoolColor(school)} school={school} size={30} fontSize={13} />
                                <span className="rt"><span className="rs">{label}</span><span className="rm">{reasons.slice(0, 2).join(', ') || `${listing.essays.length} essay${listing.essays.length === 1 ? '' : 's'}`}</span></span>
                                <span className="rp">${listing.price}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="mf-proof">
                          {message.budget != null
                            ? `Listings over $${message.budget} were removed before scoring.`
                            : 'No budget stated. Add “under $50” to set a hard price cap.'}
                        </div>
                        <div className="mf-actions">
                          <button className="mf-mini" type="button" onClick={() => {
                            onShowMatches(message.results!.map(({ listing }) => listing.id), message.query || 'your matches');
                            onOpenChange(false);
                          }}>Show these in the grid</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div className="mf-proof">All {pricedCount} public listings are scored on this page. Your search does not leave your browser.</div>
          </div>
          <div className="mf-suggest">
            {SUGGESTIONS.map((suggestion) => <button key={suggestion} className="mf-chip" type="button" onClick={() => ask(suggestion)}>{suggestion}</button>)}
          </div>
          <form className="mf-form" autoComplete="off" onSubmit={submit}>
            <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} placeholder="e.g. Berkeley engineering under $40" aria-label="Describe what you are looking for" />
            <button className="btn-primary" type="submit">Ask</button>
          </form>
        </div>
      )}
    </>
  );
}
