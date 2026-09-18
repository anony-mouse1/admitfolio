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

/* ========================================================================== *
 * The "What you get" panel on the listing sheet.
 *
 * Everything below is pure so scripts/listing-value-panel.test.mjs can hold it
 * to the live catalogue's shapes without a browser or a database. Measured on
 * 2026-09-18 over the 192 purchasable listings: 563 essay rows, 75 listings
 * repeating a prompt label, 61 once the question text is taken into account,
 * 383 rows after grouping, at most 8 groups in one listing and at most 9 essays
 * in one group.
 * ========================================================================== */

export type EssayGroup = {
  /**
   * The row heading: the preset prompt, verbatim.
   *
   * Deliberately NOT essayLabel. That function substitutes the seller's own
   * question for the prompt on "Other" rows, which is right for a one-line card
   * summary and wrong here, because the panel prints the question underneath as
   * well. Using it rendered the same sentence twice on every "Other" row, once
   * truncated and shouting in uppercase and once in full, and cost 122px a row
   * on a phone.
   */
  label: string;
  /** The seller's free-text prompt, present only on "Other" rows. */
  question: string | null;
  /** How many essays in this listing share that exact prompt and question. */
  count: number;
  /** Null unless EVERY essay in the group has a stored count. */
  words: { min: number; max: number } | null;
};

/**
 * One row per distinct essay, in the order the seller submitted them.
 *
 * Grouped on the prompt AND the question text, not the prompt alone. Four UC
 * Personal Insight Questions are one row because nothing distinguishes them:
 * Essay.question is null on all 488 non-Other essays, so we cannot say which
 * college any given supplement was written for and must not imply it. Three
 * "Other supplement" rows carrying three different questions are three rows,
 * because that text is the only thing on the sheet that says what they are.
 * Grouping on the prompt alone would collapse 14 listings that way.
 */
export function essayGroups(l: PublicListing): EssayGroup[] {
  const groups: EssayGroup[] = [];
  const index = new Map<string, EssayGroup>();
  for (const essay of l.essays) {
    const question = (essay.question || '').trim() || null;
    const key = `${essay.prompt}␟${question ?? ''}`;
    let group = index.get(key);
    if (!group) {
      group = { label: essay.prompt, question, count: 0, words: null };
      index.set(key, group);
      groups.push(group);
    }
    group.count += 1;
    // A group reports a length only when every essay in it has one. A partial
    // group would be quietly reporting the length of some of what is bought.
    if (group.count === 1) {
      group.words = essay.wordCount != null ? { min: essay.wordCount, max: essay.wordCount } : null;
    } else if (group.words && essay.wordCount != null) {
      group.words = {
        min: Math.min(group.words.min, essay.wordCount),
        max: Math.max(group.words.max, essay.wordCount),
      };
    } else {
      group.words = null;
    }
  }
  return groups;
}

/**
 * The right-hand column of a panel row: how many, then how long.
 *
 * Null means print nothing. The count is suppressed when the whole listing
 * collapses to a single group, because the panel header has already said it and
 * a row reading "4 essays" beside a header reading "4 essays" is the same
 * number twice.
 */
export function essayGroupMeta(group: EssayGroup, groupCount: number): string | null {
  const parts: string[] = [];
  if (group.count > 1 && groupCount > 1) parts.push(`${group.count} essays`);
  if (group.words) {
    const { min, max } = group.words;
    if (group.count === 1) parts.push(`${min} words`);
    else if (min === max) parts.push(`${min} words each`);
    else parts.push(`${min} to ${max} words`);
  }
  return parts.length ? parts.join(' · ') : null;
}

/**
 * What one essay in the package works out at, in whole dollars.
 *
 * Math.round, never Math.floor. Floor understates by up to 99 cents; nearest
 * understates by at most 49 and only when the remainder is under half. Null on
 * a single-essay listing, where "$20 an essay" under "$20" is noise, and null
 * when there is no price to divide.
 *
 * The printed figure times the essay count does not have to equal the package
 * price and usually will not. $346 over 18 essays prints $19, and 18 x $19 is
 * $342. The line says what one essay works out at, not what the package costs,
 * and the package price is directly above it.
 */
export function perEssayPrice(l: PublicListing): number | null {
  const count = l.essays.length;
  if (count < 2 || l.price == null || l.price <= 0) return null;
  return Math.round(l.price / count);
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

// The closed prompt list in app/page.tsx, written the way a person would say it.
// Used only when a listing has no safe excerpt, so the card still names what it
// is instead of printing a form label.
const ESSAY_KIND: Record<string, string> = {
  'Common App · Personal Statement': 'Common App personal statement',
  'UC · Personal Insight Question': 'Personal Insight Question',
  'Why-school · Supplement': 'why-school supplement',
  'Community / Identity · Supplement': 'community and identity supplement',
  'Intellectual vitality · Supplement': 'intellectual vitality supplement',
  'Activity / Extracurricular · Supplement': 'activity supplement',
  'Short answer': 'short answer',
  'Other supplement': 'supplement',
};

// Every card gets one accurate title from an essay in this exact listing.
// `openingLine` is extractor-approved and seller-name checks run before it is
// stored. Seller-written marketing copy is only a fallback.
//
// When neither exists the card used to print the raw prompt label, so a
// collection page could show three cards in a row all headed "Why-school ·
// Supplement" and read as broken duplicates. It now names the listing in the
// site's own words instead, which is the same fact said properly.
export function publicListingTitle(listing: PublicListing): string {
  const written = (listing.openingLine || listing.teaser || '').trim();
  if (written) return truncateWords(written, 120);
  const school = schoolShortName(headlineSchool(listing));
  const kinds = [...new Set(listing.essays.map((e) => ESSAY_KIND[e.prompt]).filter(Boolean))];
  if (kinds.length === 1) {
    const plural = listing.essays.length > 1;
    return `${school} ${plural ? `${kinds[0]}s` : kinds[0]}`;
  }
  if (kinds.length > 1) return `${school} application essays`;
  // A seller's own "Other" wording is the only thing left worth showing.
  const custom = listing.essays[0] ? essayLabel(listing.essays[0]) : '';
  if (custom) return `${school}: ${custom}`;
  return `${school} admission essay${listing.essays.length === 1 ? '' : ' collection'}`;
}

export function cardTagLabel(tag: string): string {
  if (tag === 'First-generation' || tag === 'First generation') return 'First gen';
  if (tag === 'Low-income background') return 'Low-income';
  return tag;
}

// Does the card title already say what this essay label would say? Used by the
// detail sheet so the hook and the first essay row do not print the same line.
export function sameTitleText(a: string | null | undefined, b: string | null | undefined): boolean {
  const normalize = (value: string | null | undefined) =>
    (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const left = normalize(a);
  const right = normalize(b);
  return Boolean(left && right && left.slice(0, 60) === right.slice(0, 60));
}

// What checkout needs to know about a listing. Shared because the homepage and
// the collection pages both open the same checkout over the same shape.
export type CheckoutItem = {
  listingId: string;
  school: string;
  price: number;
  summary?: string | null;
  essayCount?: number;
};

export function checkoutItemForListing(listing: PublicListing): CheckoutItem {
  return {
    listingId: listing.id,
    school: schoolShortName(headlineSchool(listing)),
    price: listing.price || 0,
    summary: publicListingTitle(listing),
    essayCount: listing.essays.length,
  };
}
