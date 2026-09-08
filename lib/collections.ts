import type { GuideSlug } from './guides';
import { SITE_URL } from './site';

// The collection registry: one entry per page under app/essays/<slug>/, and the
// only place a collection's slug, copy, membership rule and guide pairing are
// written down. The hub, each collection page, the metadata and the sitemap all
// read from here, so a collection cannot be listed in one place and missing
// from another. Same arrangement as lib/guides.ts, for the same reason.
//
// Membership is by prompt or by major, never by seller and never by school.
// Grouping listings by seller would undo the per-listing anonymity that
// lib/anonymity.ts enforces, and per-school pages are a separate decision.

export const COLLECTIONS_PATH = '/essays';

/** A listing belongs if it contains at least one essay with this exact prompt. */
type PromptRule = { kind: 'prompt'; prompt: string };

/**
 * A listing belongs if any of its applied majors matches. `appliedMajors` is
 * free text a seller typed, comma separated, so this is a match against each
 * comma-separated token rather than the whole string. Falls back to the
 * seller's current major exactly as the browse card does.
 */
type MajorRule = { kind: 'major'; pattern: RegExp };

export type CollectionRule = PromptRule | MajorRule;

export type Collection = {
  slug: string;
  /** The H1, and the name used in the hub card and the footer. */
  name: string;
  /** Sub-line under the H1. Short, factual, no marketing. */
  dek: string;
  title: string;
  description: string;
  /** Paragraphs of the page intro. Public copy: no em dashes, per AGENTS.md. */
  intro: string[];
  rule: CollectionRule;
  /** The guide that covers the same ground, where one exists. */
  guide?: GuideSlug;
};

export const collections = [
  {
    slug: 'uc-personal-insight-questions',
    name: 'UC Personal Insight Question essays',
    dek: 'Complete PIQ sets from students admitted to a University of California campus.',
    title: 'UC Personal Insight Question Examples From Admitted Students | Admitfolio',
    description:
      'Real UC Personal Insight Question responses from students who were admitted, sold by the students who wrote them. Most listings hold a complete set of four.',
    intro: [
      'The University of California asks for four Personal Insight Questions of up to 350 words each, and nothing else. There is no personal statement, no separate supplement, and no interview. Those four responses carry the entire written case for your application, which is why they reward close reading.',
      'These listings are PIQ responses from students who were admitted to a UC, sold by the students who wrote them. Most are complete sets, so you can follow one writer across all four: which prompts they picked, what they put in each one, and what they kept out of the rest. A set is a different thing from four separate essays.',
      'Read them for the choices rather than the stories. Your four will only work if they are yours.',
    ],
    rule: { kind: 'prompt', prompt: 'UC · Personal Insight Question' },
    guide: 'uc-piq-examples',
  },
  {
    slug: 'common-app-personal-statement',
    name: 'Common App personal statement essays',
    dek: 'The 650-word essay that went to every school on the list, from students who got in.',
    title: 'Common App Personal Statement Examples From Admitted Students | Admitfolio',
    description:
      'Real Common App personal statements from students who were admitted, sold by the students who wrote them. Many listings include the supplements sent in the same application.',
    intro: [
      'One essay of up to 650 words, sent to every school on your Common App list. It is the only piece of writing you cannot tailor to a single college, so it has to work everywhere at once, and it is usually the first thing an admissions reader sees of your writing.',
      'These are personal statements from students who were admitted, sold by the students who wrote them. Many listings also include the school supplements that went out in the same application, which is the part that is hard to find anywhere else: one voice, in one year, doing two different jobs.',
      'Read them side by side and study the structure rather than the subject. Then close the tab and write the version only you could write.',
    ],
    rule: { kind: 'prompt', prompt: 'Common App · Personal Statement' },
    guide: 'common-app-essay-examples',
  },
  {
    slug: 'engineering',
    name: 'Engineering application essays',
    dek: 'Essays from students admitted into engineering programs, across every discipline in the catalogue.',
    title: 'Engineering College Application Essay Examples | Admitfolio',
    description:
      'Application essays from students admitted into biomedical, aerospace, mechanical, electrical, computer, civil and chemical engineering programs.',
    intro: [
      'These listings come from students who applied into an engineering program and were admitted. The collection spans biomedical, aerospace, mechanical, electrical, computer, civil, chemical and general engineering, along with the undeclared and first-year engineering routes that several large public universities use.',
      'Most include a Common App personal statement. A number also carry the school supplements a specific program asked for, and some are full sets of UC Personal Insight Questions, so you can watch the same applicant answer a general prompt and a technical one.',
      'If you are writing about a project, this is the collection to read for calibration. The open question in almost every engineering draft is how much of the build to explain, and these show you where other admitted applicants drew that line.',
    ],
    rule: { kind: 'major', pattern: /engineering/ },
  },
  {
    slug: 'business',
    name: 'Business and economics application essays',
    dek: 'Essays from students admitted into business, economics and finance programs.',
    title: 'Business School Application Essay Examples From Admitted Students | Admitfolio',
    description:
      'Application essays from students admitted into undergraduate business, economics, finance, marketing and entrepreneurship programs, including named business schools.',
    intro: [
      'These listings come from students who applied into business, economics, finance, marketing, management or entrepreneurship, and were admitted. The collection includes the named undergraduate business programs that run supplements of their own, so it is not only general Common App writing.',
      'Most listings include a personal statement. Some also carry the why-school supplements a business program asked for, which are the ones applicants find hardest to draft, because the school is asking about fit while the student is trying to prove drive.',
      'Read for the opening. Ambition is easy to announce and hard to show, and the first two sentences usually tell you which one an essay is doing.',
    ],
    rule: { kind: 'major', pattern: /business|econ|financ|marketing|management|accounting|entrepreneur|real estate/ },
  },
  {
    slug: 'biology',
    name: 'Biology and life sciences application essays',
    dek: 'Essays from students admitted into biology, neuroscience and biomedical programs.',
    title: 'Biology and Pre-Med Application Essay Examples | Admitfolio',
    description:
      'Application essays from students admitted into biology, biological sciences, molecular and cell biology, biochemistry, neuroscience and biomedical sciences.',
    intro: [
      'These listings come from students who applied into biology and the life sciences, and were admitted. The collection covers general biology and biological sciences, along with molecular and cell biology, biochemistry, neuroscience, genetics, microbiology and biomedical sciences.',
      'Nearly every listing here is a multi-essay package rather than a single essay, so you are usually reading a whole application at once: a personal statement, the supplements that went with it, and in several cases a full set of UC Personal Insight Questions.',
      'If you are on a pre-med track, read these with one question in mind. The arc every admissions reader has already seen is the bedside moment that turns into a calling. Look at where each of these chooses to start instead.',
    ],
    rule: { kind: 'major', pattern: /biolog|biochem|neuroscien|genetic|biomedical scien|biomolecular scien|biopsych/ },
  },
  {
    slug: 'computer-science',
    name: 'Computer science application essays',
    dek: 'Essays from students admitted into computer science and computing programs.',
    title: 'Computer Science College Essay Examples From Admitted Students | Admitfolio',
    description:
      'Application essays from students admitted into computer science, computer engineering, data science, artificial intelligence and informatics programs.',
    intro: [
      'These listings come from students who applied into computing and were admitted. The collection covers computer science, computer engineering, electrical and computer engineering, data science, artificial intelligence, informatics and symbolic systems.',
      'Most include a Common App personal statement, and many also carry a why-school supplement. That second part is the useful one. Computer science is the field where the largest number of applicants arrive with the same stated interest, so the piece of writing that separates two similar transcripts is often the one about a specific department.',
      'Read the supplements first here. They are shorter, they are more concrete, and they show what an admitted applicant found worth naming about a program they had not attended yet.',
    ],
    rule: { kind: 'major', pattern: /computer sci|computer engineering|artificial intelligence|data science|informatics|symbolic systems/ },
  },
] as const satisfies readonly Collection[];

// The registry's own entry type keeps each slug a literal, so a typo in a
// collectionBySlug('...') call fails to compile instead of throwing.
export type CollectionEntry = (typeof collections)[number];
export type CollectionSlug = CollectionEntry['slug'];

export function collectionPath(slug: string): string {
  return `${COLLECTIONS_PATH}/${slug}`;
}

/** The absolute URL a collection uses for its canonical tag and its sitemap loc. */
export function collectionUrl(slug: string): string {
  return `${SITE_URL}${collectionPath(slug)}`;
}

export function collectionBySlug(slug: string): CollectionEntry | undefined {
  return collections.find((entry) => entry.slug === slug);
}

/**
 * The majors a listing claims, split the same way the browse card splits them
 * (majorsOf in lib/publicListing.ts). The seller's current major is a fallback
 * only when the listing carries no applied majors of its own, which is the rule
 * /api/listings already applies when it decides whether to publish `major`.
 */
function majorTokens(listing: { appliedMajors: string | null; major?: string | null }): string[] {
  const applied = String(listing.appliedMajors || '').split(',').map((m) => m.trim()).filter(Boolean);
  if (applied.length) return applied;
  return String(listing.major || '').split(',').map((m) => m.trim()).filter(Boolean);
}

export type CollectionCandidate = {
  appliedMajors: string | null;
  major?: string | null;
  essays: { prompt: string }[];
};

export function listingInCollection(listing: CollectionCandidate, rule: CollectionRule): boolean {
  if (rule.kind === 'prompt') return listing.essays.some((essay) => essay.prompt === rule.prompt);
  return majorTokens(listing).some((token) => rule.pattern.test(token.toLowerCase()));
}

export function listingsInCollection<T extends CollectionCandidate>(listings: T[], rule: CollectionRule): T[] {
  return listings.filter((listing) => listingInCollection(listing, rule));
}
