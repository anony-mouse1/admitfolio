import { sameSchool, schoolInfo, schoolShortName } from './schools';
import { listingHeadline as resolveListingHeadline } from './listingSchool';
import type { Anonymity } from './anonymity';

// The shape of a public listing, and the pure functions that turn one into the
// text a browse card shows. All of this was inline in app/page.tsx. It moved
// here so the server-rendered collection pages under app/essays can render the
// same card without pulling in a 4,000 line client component.
//
// Nothing in this file touches the DOM, React or the database, so it is safe on
// both sides of the boundary. Every function is unchanged from the version that
// shipped on the homepage.

export type PublicListing = {
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

export const priceLabel = (price: number | null | undefined) =>
  price != null ? `$${price}` : 'Price unavailable';

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
export function headlineSchool(l: PublicListing): string {
  return l.headlineSchool || resolveListingHeadline({ ...l, essays: l.essays });
}

// What a browse card calls an essay.
//
// `question` is the seller's free-text box, filled in when they pick "Other",
// and it holds the college's prompt verbatim - some run past 300 characters.
// Printed raw into `.ecard-prompt` (uppercase, letter-spaced) it stopped being
// a label and became the loudest thing on the card, six lines of shouting
// above the essay it was meant to caption.
export const OTHER_PROMPT = /^other/i;
export const PROMPT_MAX = 52;

// Cut at a word boundary so a label never ends mid-word. If the last space is
// too early to be worth keeping, cut hard instead of leaving a stub.
export function truncateWords(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(' ');
  const kept = space > max * 0.6 ? cut.slice(0, space) : cut;
  return kept.replace(/[\s,;:.–—-]+$/, '') + '…';
}

// A preset prompt is already a label ("Why-school · Supplement"), so it wins.
// The seller's own wording is only the better name when there is no preset,
// which is exactly the "Other" case it was added for.
export function essayLabel(e: { prompt: string; question: string | null }): string {
  const custom = (e.question || '').trim();
  const preset = (e.prompt || '').trim();
  const raw = !preset || OTHER_PROMPT.test(preset) ? custom || preset : preset;
  return truncateWords(raw, PROMPT_MAX);
}

// The package pill already shows the essay count. Keep this line for the
// contents only, matching the approved browse mockup without repeating the
// same number twice on one card.
//
// This is what actually differs between one seller's listings, and it used to
// read "Verified admit · 4 essays" on every card, which is why the grid looked
// like duplicates.
export function contentsLine(l: PublicListing): string {
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

export function majorsOf(l: PublicListing): string[] {
  return (l.appliedMajors || l.major || '').split(',').map((m) => m.trim()).filter(Boolean);
}

// The first five schools, then a count. Five is a fixed number rather than a
// width budget so every card lists the same amount, and .admit-names reserves
// the height whether or not it is used.
export const MAX_ADMIT_NAMES = 5;
export function admitNameLine(list: string[]): string {
  const names = list.map((n) => schoolShortName(n));
  const shown = names.slice(0, MAX_ADMIT_NAMES);
  const rest = names.length - shown.length;
  return shown.join(', ') + (rest > 0 ? `, +${rest} more` : '');
}

export function isQuestBridgeTag(value: string): boolean {
  return schoolInfo(value)?.domain === 'questbridge.org';
}

// De-duplicated with the same rule addAdmit applies at entry, so entry and
// render agree. Two spellings of one school ("University of Pennsylvania" and
// "UPenn") both shorten to "UPenn" and used to print twice, on the card line
// and again as two identical chips on the detail sheet. Only rows saved before
// that entry check need this. The first spelling wins, so the hover title still
// shows what the seller actually typed.
export function collegeAdmitTags(listing: PublicListing): string[] {
  const kept: string[] = [];
  for (const tag of listing.admitTags) {
    if (isQuestBridgeTag(tag)) continue;
    if (kept.some((existing) => sameSchool(existing, tag))) continue;
    kept.push(tag);
  }
  return kept;
}

export function questBridgeLabel(listing: PublicListing): string | null {
  const tags = listing.admitTags.map((tag) => tag.toLowerCase().trim());
  if (tags.includes('questbridge scholar')) return 'QuestBridge Scholar';
  if (tags.includes('questbridge finalist')) return 'QuestBridge Finalist';
  if (tags.includes('questbridge')) return 'QuestBridge';
  return null;
}

// Every card gets one accurate title from an essay in this exact listing.
// `openingLine` is extractor-approved and seller-name checks run before it is
// stored. Seller-written marketing copy is only a fallback. A prompt label is
// the last resort for scans or short answers with no safe prose to extract.
export function publicListingTitle(listing: PublicListing): string {
  const written = (listing.openingLine || listing.teaser || '').trim();
  if (written) return truncateWords(written, 120);
  const prompt = listing.essays[0] ? essayLabel(listing.essays[0]) : '';
  if (prompt) return prompt;
  const school = schoolShortName(headlineSchool(listing));
  return `${school} admission essay${listing.essays.length === 1 ? '' : ' collection'}`;
}

export function cardTagLabel(tag: string): string {
  if (tag === 'First-generation' || tag === 'First generation') return 'First gen';
  if (tag === 'Low-income background') return 'Low-income';
  return tag;
}
