import Link from 'next/link';
import styles from '@/app/guides/guides.module.css';
import { type GuideSlug, guideBySlug, guidePath } from '@/lib/guides';

export function RelatedGuides({ guides }: { guides: readonly GuideSlug[] }) {
  return (
    <aside className={styles.relatedGuides} id="related-guides" aria-label="Related essay guides">
      <span className={styles.eyebrow}>Keep reading</span>
      <h2>Related essay guides</h2>
      <div className={styles.relatedGrid}>
        {guides.map((slug) => {
          const guide = guideBySlug(slug);
          return (
            <Link className={styles.relatedCard} href={guidePath(slug)} key={slug}>
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
