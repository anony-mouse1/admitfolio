import type { Metadata } from 'next';
import Link from 'next/link';
import { GuideFooter, GuideHeader } from '@/components/GuideShell';
import styles from './guides.module.css';

export const metadata: Metadata = {
  title: 'College Essay Blog, Guides, and Examples | Admitfolio',
  description:
    'Practical college essay guides grounded in real Common App essays, UC PIQs, and school supplements from verified students.',
  alternates: { canonical: 'https://admitfolio.com/guides' },
  openGraph: {
    title: 'College Essay Blog, Guides, and Examples | Admitfolio',
    description:
      'Practical college essay guides grounded in real Common App essays, UC PIQs, and school supplements.',
    url: 'https://admitfolio.com/guides',
    type: 'website',
  },
};

const guides = [
  {
    href: '/guides/how-to-take-inspiration-from-college-essays',
    cover: 'inspiration',
    coverTitle: 'Study the choice, not the story',
    image: '/blog-images/inspiration.webp',
    imageAlt: 'Two college students discussing their work while walking across campus',
    date: 'August 20, 2026',
    readTime: '7 min read',
    title: 'The best way to take inspiration from other college student essays',
    description:
      'A practical method for studying voice, structure, and reflection without copying another student\'s words or story.',
  },
  {
    href: '/guides/common-app-essay-examples',
    cover: 'common',
    coverTitle: 'Read for craft, then write your story',
    image: '/blog-images/common-app-examples.webp',
    imageAlt: 'College student drafting an essay beside her laptop',
    date: 'August 16, 2026',
    readTime: '8 min read',
    title: 'Common App essay examples: how to learn from essays that worked',
    description:
      'Use real examples to study structure, reflection, and voice without copying someone else\'s story.',
  },
  {
    href: '/guides/uc-piq-examples',
    cover: 'uc',
    coverTitle: 'Personal Insight Questions',
    image: '/blog-images/uc-piq.webp',
    imageAlt: 'College students working on laptops together in a classroom',
    date: 'August 12, 2026',
    readTime: '10 min read',
    title: 'UC PIQ examples and what makes each response work',
    description: 'A question-by-question guide to choosing four prompts and writing direct, specific responses.',
  },
  {
    href: '/guides/how-to-start-a-college-essay',
    cover: 'start',
    coverTitle: 'Five ways into your story',
    image: '/blog-images/start-college-essay.webp',
    imageAlt: 'College student beginning a handwritten draft beside her laptop',
    date: 'August 8, 2026',
    readTime: '6 min read',
    title: 'How to start a college essay without forcing the hook',
    description: 'Five practical openings to try when the first sentence will not come.',
  },
  {
    href: '/guides/why-this-college-essay-examples',
    cover: 'why',
    coverTitle: 'Research with a reason',
    image: '/blog-images/why-college.webp',
    imageAlt: 'Students walking through a leafy college campus',
    date: 'August 4, 2026',
    readTime: '8 min read',
    title: 'Why this college essay examples: a better research method',
    description: 'Turn school research into a specific answer about fit, contribution, and curiosity.',
  },
  {
    href: '/guides/college-essay-format',
    cover: 'format',
    coverTitle: 'Simple, readable structure',
    image: '/blog-images/essay-format.webp',
    imageAlt: 'Students writing in notebooks during a study session',
    date: 'July 30, 2026',
    readTime: '5 min read',
    title: 'College essay format: a simple, readable structure',
    description: 'Paragraphs, dialogue, titles, spacing, and submission details explained clearly.',
  },
  {
    href: '/guides/common-app-essay-word-count',
    cover: 'count',
    coverTitle: 'Every sentence earns its place',
    image: '/blog-images/word-count.webp',
    imageAlt: 'Close view of a pen revising words on paper',
    date: 'July 25, 2026',
    readTime: '4 min read',
    title: 'Common App essay word count: what to cut and what to keep',
    description: 'A focused revision checklist for cutting repetition without losing voice or reflection.',
  },
] as const;

const coverClasses = {
  inspiration: styles.coverInspiration,
  common: styles.coverCommon,
  uc: styles.coverUc,
  start: styles.coverStart,
  why: styles.coverWhy,
  format: styles.coverFormat,
  count: styles.coverCount,
} as const;

function GuideCover({
  cover,
  title,
  image,
  imageAlt,
}: {
  cover: keyof typeof coverClasses;
  title: string;
  image: string | null;
  imageAlt: string | null;
}) {
  if (image && imageAlt) {
    return (
      <div className={`${styles.blogCover} ${styles.photoCover}`}>
        <img className={styles.coverPhoto} src={image} alt={imageAlt} width="1200" height="800" decoding="async" />
      </div>
    );
  }

  return (
    <div className={`${styles.blogCover} ${coverClasses[cover]}`} aria-hidden="true">
      {cover === 'inspiration' && <span className={styles.coverMark}>⌕</span>}
      {cover === 'common' && (
        <>
          <span className={styles.coverMark}>“</span>
          <div className={styles.paperPreview}>
            {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
          </div>
        </>
      )}
      {cover === 'uc' && <span className={styles.coverMark}>4 of 8</span>}
      {cover === 'start' && <span className={styles.coverMark}>“</span>}
      {cover === 'why' && <span className={styles.coverMark}>YOU + SCHOOL</span>}
      {cover === 'format' && (
        <div className={styles.formatPreview}>
          {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
        </div>
      )}
      {cover === 'count' && <div className={styles.countRing}>650</div>}
      <span className={styles.coverTitle}>{title}</span>
    </div>
  );
}

export default function GuidesPage() {
  return (
    <div className={styles.page}>
      <GuideHeader />
      <main className={styles.blogIndexMain}>
        <section className={styles.blogIndexHero}>
          <h1>Blog</h1>
          <p>Practical college essay advice, grounded in real examples from verified students.</p>
          <div className={styles.topicLinks} aria-label="Blog topics">
            <span>Common App</span>
            <span>UC PIQs</span>
            <span>School supplements</span>
            <span>Writing basics</span>
          </div>
        </section>

        <section className={styles.blogGrid} aria-label="College essay guides">
          {guides.map((guide) => (
            <Link className={styles.blogCard} href={guide.href} key={guide.href}>
              <GuideCover
                cover={guide.cover}
                title={guide.coverTitle}
                image={guide.image}
                imageAlt={guide.imageAlt}
              />
              <div className={styles.blogCardCopy}>
                <div className={styles.blogCardMeta}>{guide.date} · {guide.readTime}</div>
                <h2>{guide.title}</h2>
                <p>{guide.description}</p>
              </div>
            </Link>
          ))}
        </section>
      </main>
      <GuideFooter />
    </div>
  );
}
