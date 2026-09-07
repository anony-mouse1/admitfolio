import type { Metadata } from 'next';
import Link from 'next/link';
import { GuideFooter, GuideHeader } from '@/components/GuideShell';
import { GUIDES_PATH, formatGuideDate, guidePath, guides } from '@/lib/guides';
import { SITE_URL } from '@/lib/site';
import styles from './guides.module.css';

const url = `${SITE_URL}${GUIDES_PATH}`;

export const metadata: Metadata = {
  title: 'College Essay Blog, Guides, and Examples | Admitfolio',
  description:
    'Practical college essay guides grounded in real Common App essays, UC PIQs, and school supplements from verified students.',
  alternates: { canonical: url },
  openGraph: {
    title: 'College Essay Blog, Guides, and Examples | Admitfolio',
    description:
      'Practical college essay guides grounded in real Common App essays, UC PIQs, and school supplements.',
    url,
    type: 'website',
  },
};

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
            <Link className={styles.blogCard} href={guidePath(guide.slug)} key={guide.slug}>
              <GuideCover
                cover={guide.cover}
                title={guide.coverTitle}
                image={guide.image}
                imageAlt={guide.imageAlt}
              />
              <div className={styles.blogCardCopy}>
                <div className={styles.blogCardMeta}>{formatGuideDate(guide.published)} · {guide.readTime}</div>
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
