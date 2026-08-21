import styles from '@/app/guides/guides.module.css';

export type GuideTocItem = {
  id: string;
  label: string;
};

export function GuideArticleOverview({
  sections,
  summary,
}: {
  sections: readonly GuideTocItem[];
  summary: readonly string[];
}) {
  return (
    <div className={styles.articleOverview}>
      <nav className={styles.articleToc} aria-label="Table of contents">
        <h2>Table of contents</h2>
        <ol>
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`}>{section.label}</a>
            </li>
          ))}
        </ol>
      </nav>

      <section className={styles.articleSummary} aria-labelledby="article-summary-heading">
        <h2 id="article-summary-heading">Summary</h2>
        <ul>
          {summary.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
