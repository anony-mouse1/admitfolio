import type { Metadata } from 'next';
import Link from 'next/link';
import { GuideFooter, GuideHeader } from '@/components/GuideShell';
import { RelatedGuides } from '@/components/RelatedGuides';
import styles from '../guides.module.css';

const title = 'Common App Essay Examples: How to Learn From Essays That Worked';
const description =
  'Learn how to read Common App essay examples for structure, reflection, and voice without copying another student’s story.';
const url = 'https://admitfolio.com/guides/common-app-essay-examples';

export const metadata: Metadata = {
  title: `${title} | Admitfolio`,
  description,
  alternates: { canonical: url },
  openGraph: { title, description, url, type: 'article', publishedTime: '2026-08-20', modifiedTime: '2026-08-20' },
};

export default function CommonAppEssayExamplesPage() {
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    datePublished: '2026-08-20',
    dateModified: '2026-08-20',
    author: { '@type': 'Organization', name: 'Admitfolio Editorial Team' },
    publisher: { '@type': 'Organization', name: 'Admitfolio', url: 'https://admitfolio.com' },
    mainEntityOfPage: url,
  };

  return (
    <div className={styles.page}>
      <GuideHeader />
      <main className={styles.articleMain}>
        <article className={styles.articleShell}>
          <Link className={styles.backLink} href="/guides">← Back to all essay guides</Link>
          <header className={styles.articleHeader}>
            <span className="pill"><span className="dot" />Common App</span>
            <h1>Common App essay examples: how to learn from essays that worked</h1>
            <p className={styles.dek}>
              The best example is not the one you can copy. It is the one that helps you see a choice you can
              make in your own writing.
            </p>
            <div className={styles.byline}>
              <span>By the Admitfolio Editorial Team</span>
              <span>Updated August 20, 2026</span>
              <span>8 min read</span>
            </div>
          </header>

          <div className={styles.articleStat}>
            <strong>Why we wrote this:</strong> Admitfolio has hundreds of real application essays from
            verified students. Applicants need a better way to learn from examples without flattening their
            own voice.
          </div>

          <div className={styles.articleBody}>
            <p>
              Reading a strong Common App essay can make the process feel possible. It can also make you
              wonder whether your own topic is dramatic, unusual, or polished enough. That is the wrong
              comparison.
            </p>
            <p>
              A useful example shows you how another student turned an experience into meaning. Your job is
              to notice the decisions behind the writing, then return to your own life and make different
              decisions that are true to you.
            </p>

            <h2>Use examples to study decisions, not stories</h2>
            <p>
              Two students can write about the same ordinary subject and reveal completely different people.
              The subject is only the container. What matters is what the writer notices, how they interpret
              it, and what changes by the end.
            </p>
            <div className={styles.callout}>
              <strong>A good rule</strong>
              Borrow the question an essay makes you ask about yourself. Do not borrow the answer.
            </div>

            <h2>Read every example in three passes</h2>
            <ol>
              <li><strong>Read for the story.</strong> What happens, and what concrete details make the moment feel real?</li>
              <li><strong>Read for the person.</strong> What values, habits, contradictions, or ways of thinking become visible?</li>
              <li><strong>Read for movement.</strong> What does the writer understand at the end that they did not understand at the beginning?</li>
            </ol>
            <p>
              This method keeps you focused on craft. It also makes it easier to compare several essays
              without deciding there is one correct structure.
            </p>

            <h2>Specific is more memorable than impressive</h2>
            <p>
              Students often reach for their largest accomplishment because it feels safest. But specificity
              usually comes from smaller moments: a repeated Saturday routine, a private mistake, an object
              with a history, or a question you could not stop thinking about.
            </p>
            <p>
              After reading an example, write down three details only you could supply about your own topic.
              If the details could belong to anyone, keep going.
            </p>

            <h2>Questions to ask before you draft</h2>
            <ul>
              <li>What does this story reveal that the rest of my application does not?</li>
              <li>Where am I making a choice, not just describing an event?</li>
              <li>Which detail would a close friend recognize as unmistakably mine?</li>
              <li>What changed in my understanding, behavior, or relationship?</li>
              <li>Could another student replace my name with theirs? If so, what is missing?</li>
            </ul>

            <h2>What not to take from an example</h2>
            <p>
              Do not reuse a striking opening, mirror someone else&apos;s sequence of scenes, or swap your details
              into their central metaphor. Even when the words change, the architecture can still belong to
              someone else.
            </p>
            <p>
              Instead, close the example before drafting. Write from memory about your own moment. You can
              return later to compare clarity, pacing, and reflection.
            </p>
          </div>

          <RelatedGuides guides={[
            'how-to-take-inspiration-from-college-essays',
            'how-to-start-a-college-essay',
            'common-app-essay-word-count',
          ]} />

          <aside className={styles.articleCta}>
            <h2>See how real students approached the Common App</h2>
            <p>Browse verified essays by school, prompt, and application type. Use them for inspiration, never imitation.</p>
            <Link className="btn-primary" href="/#browse">Browse Common App essays →</Link>
          </aside>
        </article>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      </main>
      <GuideFooter />
    </div>
  );
}
