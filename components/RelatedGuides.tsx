import Link from 'next/link';
import styles from '@/app/guides/guides.module.css';

const guideDetails = {
  'common-app-essay-examples': {
    category: 'Common App',
    title: 'Common App essay examples: how to learn from essays that worked',
  },
  'how-to-take-inspiration-from-college-essays': {
    category: 'Essay examples',
    title: 'The best way to take inspiration from other college student essays',
  },
  'uc-piq-examples': {
    category: 'UC applications',
    title: 'UC PIQ examples and what makes each response work',
  },
  'how-to-start-a-college-essay': {
    category: 'Writing basics',
    title: 'How to start a college essay without forcing the hook',
  },
  'why-this-college-essay-examples': {
    category: 'Supplements',
    title: 'Why this college essay examples: a better research method',
  },
  'college-essay-format': {
    category: 'Writing basics',
    title: 'College essay format: a simple, readable structure',
  },
  'common-app-essay-word-count': {
    category: 'Common App',
    title: 'Common App essay word count: what to cut and what to keep',
  },
} as const;

export type RelatedGuideSlug = keyof typeof guideDetails;

export function RelatedGuides({ guides }: { guides: readonly RelatedGuideSlug[] }) {
  return (
    <aside className={styles.relatedGuides} id="related-guides" aria-label="Related essay guides">
      <span className={styles.eyebrow}>Keep reading</span>
      <h2>Related essay guides</h2>
      <div className={styles.relatedGrid}>
        {guides.map((slug) => {
          const guide = guideDetails[slug];
          return (
            <Link className={styles.relatedCard} href={`/guides/${slug}`} key={slug}>
              <span className={styles.category}>{guide.category}</span>
              <h3>{guide.title}</h3>
              <span className={styles.relatedLink}>Read the guide →</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
