'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import LogoBadge from '@/components/LogoBadge';
import { listingHeadline } from '@/lib/listingSchool';
import { nationalUniversityRank, schoolColor, schoolInfo, schoolShortName } from '@/lib/schools';
import { ANALYTICS_EVENTS, trackConversion } from '@/lib/analyticsEvents';

type MatchListing = {
  id: string;
  school: string;
  targetSchool?: string | null;
  headlineSchool?: string | null;
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
  | { id: number; kind: 'thinking' }
  | { id: number; kind: 'bot'; text: string; results?: MatchResult[]; query?: string; budget?: number | null; typing?: boolean; revealResults?: boolean };

const SUGGESTIONS = [
  { label: 'Common App under $120', query: 'Common App personal statement under $120' },
  { label: 'STEM essays', query: 'STEM and engineering essays' },
  { label: 'Medicine and pre-med', query: 'Medicine and pre-med essays' },
  { label: 'Harvard essays', query: 'Harvard essays' },
  { label: 'UC PIQs', query: 'UC PIQs' },
  { label: 'Under $80', query: 'Essays at or under $80' },
];

const SUBJECTS: { words: string[]; matches: string[] }[] = [
  { words: ['stem'], matches: ['computer science', 'computing', 'software', 'engineering', 'biology', 'biomedical', 'health', 'neuroscience', 'data', 'statistic', 'mathematics', 'math', 'physics', 'chemistry'] },
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
  return listing.headlineSchool?.trim() || listingHeadline(listing);
}

function parseBudget(query: string): number | null {
  const match = query.match(/(?:under|below|less than|at most|max(?:imum)?|up to|budget(?:\s+(?:of|is))?)\s*\$?\s*(\d{1,4})|\$\s*(\d{1,4})/i);
  return match ? Number(match[1] || match[2]) : null;
}

function normalize(value: string): string {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

function majorText(listing: MatchListing): string {
  return (listing.appliedMajors || '').toLowerCase();
}

function promptText(listing: MatchListing): string {
  return listing.essays.map((essay) => `${essay.prompt} ${essay.question || ''}`).join(' ').toLowerCase();
}

function tagText(listing: MatchListing): string {
  return `${listing.seller.backgroundTags.join(' ')} ${listing.admitTags.join(' ')}`.toLowerCase();
}

function matchesSubjects(listing: MatchListing, subjects: typeof SUBJECTS): boolean {
  const major = majorText(listing);
  return subjects.some((subject) => subject.matches.some((word) => major.includes(word)));
}

function matchesBackgrounds(listing: MatchListing, backgrounds: typeof BACKGROUNDS): boolean {
  const tags = tagText(listing);
  return backgrounds.some((background) => tags.includes(background.label.toLowerCase()));
}

function spreadSchools(results: MatchResult[]): MatchResult[] {
  const seen = new Set<string>();
  const firstFromSchool: MatchResult[] = [];
  const repeats: MatchResult[] = [];
  for (const result of results) {
    const school = schoolInfo(targetSchool(result.listing))?.domain || normalize(targetSchool(result.listing));
    if (seen.has(school)) repeats.push(result);
    else {
      seen.add(school);
      firstFromSchool.push(result);
    }
  }
  return [...firstFromSchool, ...repeats];
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
  const hasContentRequirement = subjects.length > 0 || backgrounds.length > 0 || wantsCommonApp || wantsUc || wantsWhy || wantsPackage || wantsSingle;

  let pool = listings.filter((listing) => listing.price != null && (budget == null || listing.price <= budget));
  if (schoolMatches.length) {
    const exact = pool.filter((listing) => schoolMatches.some((school) => schoolInfo(school)?.domain === schoolInfo(targetSchool(listing))?.domain));
    if (exact.length) pool = exact;
  }
  if (wantsPackage) pool = pool.filter((listing) => listing.essays.length > 1);
  if (wantsSingle) pool = pool.filter((listing) => listing.essays.length === 1);

  // Requirements are constraints, not tiny scoring bonuses. If a student asks
  // for a subject, background, or essay type, unrelated listings should not
  // keep winning simply because they are slightly cheaper.
  if (subjects.length) pool = pool.filter((listing) => matchesSubjects(listing, subjects));
  if (backgrounds.length) pool = pool.filter((listing) => matchesBackgrounds(listing, backgrounds));
  if (wantsCommonApp) pool = pool.filter((listing) => /common app|personal statement/.test(promptText(listing)));
  if (wantsUc) pool = pool.filter((listing) => /personal insight|piq|uc /.test(promptText(listing)));
  if (wantsWhy) pool = pool.filter((listing) => /why-school|why school|why us/.test(promptText(listing)));

  const ranked = pool
    .map((listing): MatchResult => {
      const reasons: string[] = [];
      let score = 0;
      const major = majorText(listing);
      const prompts = promptText(listing);
      const tags = tagText(listing);

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
        if (tags.includes(background.label.toLowerCase())) {
          score += 3;
          reasons.push(background.label.toLowerCase());
        }
      }
      if (wantsCommonApp && /common app|personal statement/.test(prompts)) { score += 5; reasons.push('personal statement included'); }
      if (wantsUc && /personal insight|piq|uc /.test(prompts)) { score += 5; reasons.push('UC PIQs included'); }
      if (wantsWhy && /why-school|why school|why us/.test(prompts)) { score += 5; reasons.push('why-school essay included'); }
      if (budget != null) reasons.push('under your budget');
      if (listing.essays.length > 1) score += 0.5;
      // Once a student gives a content requirement, rank strong relevant
      // universities ahead of merely cheap ties. Budget-only searches keep
      // affordability as their primary signal.
      if (hasContentRequirement && !schoolMatches.length) {
        const rank = nationalUniversityRank(targetSchool(listing));
        if (rank != null) score += Math.max(0, (60 - rank) / 8);
      }
      if (listing.price != null) score += Math.max(0, (200 - listing.price) / 400);
      return { listing, score, reasons };
    })
    .sort((a, b) => b.score - a.score || (a.listing.price || 0) - (b.listing.price || 0));

  // A broad request should show a range of universities. Repeated listings
  // from one school remain available after the first result from each school.
  const results = schoolMatches.length ? ranked : spreadSchools(ranked);

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
  const [responding, setResponding] = useState(false);
  const bandRef = useRef<HTMLElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageId = useRef(0);
  const responseRun = useRef(0);
  const pendingTimers = useRef<number[]>([]);

  useEffect(() => () => {
    responseRun.current += 1;
    pendingTimers.current.forEach((timer) => window.clearTimeout(timer));
    pendingTimers.current = [];
  }, []);

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
    if (!value || responding) return;
    const match = runMatch(listings, value);
    const results = match.results.slice(0, 3);
    const run = ++responseRun.current;
    const thinkingId = ++messageId.current;
    trackConversion(ANALYTICS_EVENTS.matchSearch, {
      resultCount: match.results.length,
      budgetSet: match.budget != null,
    });
    setResponding(true);
    setMessages((current) => [
      ...current,
      { id: ++messageId.current, kind: 'you', text: value },
      { id: thinkingId, kind: 'thinking' },
    ]);
    setInput('');

    const answer = results.length
      ? results.length === 1
        ? 'This is the strongest place to start.'
        : 'These are the strongest places to start.'
      : 'I could not find a close match yet. Try a higher budget, a broader subject, or a different school.';
    const botId = ++messageId.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const schedule = (callback: () => void, delay: number) => {
      const timer = window.setTimeout(callback, delay);
      pendingTimers.current.push(timer);
    };

    schedule(() => {
      if (responseRun.current !== run) return;
      setMessages((current) => [
        ...current.filter((message) => message.id !== thinkingId),
        {
          id: botId,
          kind: 'bot',
          text: reducedMotion ? answer : '',
          results,
          query: value,
          budget: match.budget,
          typing: !reducedMotion,
          revealResults: reducedMotion,
        },
      ]);

      if (reducedMotion) {
        setResponding(false);
        return;
      }

      let length = 0;
      const typeNext = () => {
        if (responseRun.current !== run) return;
        length += 1;
        setMessages((current) => current.map((message) => (
          message.id === botId && message.kind === 'bot'
            ? { ...message, text: answer.slice(0, length) }
            : message
        )));
        if (length < answer.length) {
          schedule(typeNext, answer[length - 1] === '.' ? 105 : 16);
          return;
        }
        schedule(() => {
          if (responseRun.current !== run) return;
          setMessages((current) => current.map((message) => (
            message.id === botId && message.kind === 'bot'
              ? { ...message, typing: false, revealResults: true }
              : message
          )));
          setResponding(false);
          requestAnimationFrame(() => inputRef.current?.focus());
        }, 140);
      };
      typeNext();
    }, 950);
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
            <button className="mf-x" type="button" aria-label="Close" onClick={() => onOpenChange(false)}>&times;</button>
          </div>
          <div className="mf-log" ref={logRef} aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={`mf-msg ${message.kind === 'you' ? 'you' : 'bot'}`}>
                {message.kind === 'you' ? message.text : message.kind === 'thinking' ? (
                  <div className="bubble mf-thinking" aria-label="Finding your matches">
                    <span></span><span></span><span></span>
                  </div>
                ) : (
                  <div className="bubble">
                    <div className={message.typing ? 'mf-typed is-typing' : 'mf-typed'}>{message.text}</div>
                    {message.revealResults && message.results && message.results.length > 0 && (
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
                            ? `Only matches at or below $${message.budget} are shown.`
                            : `Only the ${message.results.length === 1 ? 'strongest match is' : `${message.results.length} strongest matches are`} shown.`}
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
          <div className="mf-suggest" aria-label="Sample searches">
            <div className="mf-suggest-track">
              {[false, true].map((duplicate) => (
                <div className="mf-suggest-set" aria-hidden={duplicate || undefined} key={duplicate ? 'duplicate' : 'primary'}>
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion.label}
                      className="mf-chip"
                      type="button"
                      tabIndex={duplicate ? -1 : undefined}
                      disabled={responding}
                      onClick={() => ask(suggestion.query)}
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <form className="mf-form" autoComplete="off" onSubmit={submit}>
            <input ref={inputRef} value={input} disabled={responding} onChange={(event) => setInput(event.target.value)} placeholder="e.g. Berkeley engineering under $40" aria-label="Describe what you are looking for" />
            <button className="btn-primary" type="submit" disabled={responding}>Ask</button>
          </form>
        </div>
      )}
    </>
  );
}
