import { SITE_URL } from './site';

// The guide registry: one entry per article under app/guides/<slug>/, and the
// only place a guide's slug, category, dates, read time and card copy are
// written down. The blog index, each article's metadata and byline, the
// related-guides cards and the sitemap all read from here, so a guide is added
// once and cannot be listed in one place and missing from another. Newest
// first, which is the order the index shows.

export const GUIDES_PATH = '/guides';

export type Guide = {
  slug: string;
  // Shown as the pill on the article and on its related-guides card.
  category: string;
  cover: 'inspiration' | 'common' | 'uc' | 'start' | 'why' | 'format' | 'count';
  coverTitle: string;
  image: string;
  imageAlt: string;
  // YYYY-MM-DD. `modified` feeds article:modified_time, the JSON-LD
  // dateModified, the "Updated" line on the article and the sitemap lastmod,
  // so bump it when the article's content changes.
  published: string;
  modified: string;
  readTime: string;
  title: string;
  description: string;
};

export const guides = [
  {
    slug: 'how-to-take-inspiration-from-college-essays',
    category: 'Essay examples',
    cover: 'inspiration',
    coverTitle: 'Study the choice, not the story',
    image: '/blog-images/inspiration.webp',
    imageAlt: 'Two college students discussing their work while walking across campus',
    published: '2026-08-20',
    modified: '2026-08-20',
    readTime: '4 min read',
    title: 'The best way to take inspiration from other college student essays',
    description:
      'A practical method for studying voice, structure, and reflection without copying another student\'s words or story.',
  },
  {
    slug: 'common-app-essay-examples',
    category: 'Common App',
    cover: 'common',
    coverTitle: 'Read for craft, then write your story',
    image: '/blog-images/common-app-examples.webp',
    imageAlt: 'College student drafting an essay beside her laptop',
    published: '2026-08-16',
    modified: '2026-08-16',
    readTime: '2 min read',
    title: 'Common App essay examples: how to learn from essays that worked',
    description:
      'Use real examples to study structure, reflection, and voice without copying someone else\'s story.',
  },
  {
    slug: 'uc-piq-examples',
    category: 'UC applications',
    cover: 'uc',
    coverTitle: 'Personal Insight Questions',
    image: '/blog-images/uc-piq.webp',
    imageAlt: 'College students working on laptops together in a classroom',
    published: '2026-08-12',
    modified: '2026-08-12',
    readTime: '3 min read',
    title: 'UC PIQ examples and what makes each response work',
    description: 'A question-by-question guide to choosing four prompts and writing direct, specific responses.',
  },
  {
    slug: 'how-to-start-a-college-essay',
    category: 'Writing basics',
    cover: 'start',
    coverTitle: 'Five ways into your story',
    image: '/blog-images/start-college-essay.webp',
    imageAlt: 'College student beginning a handwritten draft beside her laptop',
    published: '2026-08-08',
    modified: '2026-08-08',
    readTime: '3 min read',
    title: 'How to start a college essay without forcing the hook',
    description: 'Five practical openings to try when the first sentence will not come.',
  },
  {
    slug: 'why-this-college-essay-examples',
    category: 'Supplements',
    cover: 'why',
    coverTitle: 'Research with a reason',
    image: '/blog-images/why-college.webp',
    imageAlt: 'Students walking through a leafy college campus',
    published: '2026-08-04',
    modified: '2026-08-04',
    readTime: '3 min read',
    title: 'Why this college essay examples: a better research method',
    description: 'Turn school research into a specific answer about fit, contribution, and curiosity.',
  },
  {
    slug: 'college-essay-format',
    category: 'Writing basics',
    cover: 'format',
    coverTitle: 'Simple, readable structure',
    image: '/blog-images/essay-format.webp',
    imageAlt: 'Students writing in notebooks during a study session',
    published: '2026-07-30',
    modified: '2026-07-30',
    readTime: '3 min read',
    title: 'College essay format: a simple, readable structure',
    description: 'Paragraphs, dialogue, titles, spacing, and submission details explained clearly.',
  },
  {
    slug: 'common-app-essay-word-count',
    category: 'Common App',
    cover: 'count',
    coverTitle: 'Every sentence earns its place',
    image: '/blog-images/word-count.webp',
    imageAlt: 'Close view of a pen revising words on paper',
    published: '2026-07-25',
    modified: '2026-07-25',
    readTime: '3 min read',
    title: 'Common App essay word count: what to cut and what to keep',
    description: 'A focused revision checklist for cutting repetition without losing voice or reflection.',
  },
] as const satisfies readonly Guide[];

// The registry's own entry type keeps each slug as a literal, so a typo in an
// article's guideBySlug('...') call fails to compile instead of throwing.
export type GuideEntry = (typeof guides)[number];
export type GuideSlug = GuideEntry['slug'];

export function guidePath(slug: GuideSlug): string {
  return `${GUIDES_PATH}/${slug}`;
}

// The absolute URL an article uses for its canonical tag, and the sitemap uses
// for its <loc>. One function so the two cannot disagree.
export function guideUrl(slug: GuideSlug): string {
  return `${SITE_URL}${guidePath(slug)}`;
}

export function guideBySlug(slug: GuideSlug): GuideEntry {
  const guide = guides.find((entry) => entry.slug === slug);
  if (!guide) throw new Error(`No guide registered for slug "${slug}"`);
  return guide;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// "August 20, 2026", the form the index cards and the article byline use.
// Hand-formatted so the output does not depend on the runtime's locale data.
export function formatGuideDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}
