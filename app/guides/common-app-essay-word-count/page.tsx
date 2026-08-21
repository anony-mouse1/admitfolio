import type { Metadata } from 'next';
import Link from 'next/link';
import { GuideFooter, GuideHeader } from '@/components/GuideShell';
import { RelatedGuides } from '@/components/RelatedGuides';
import styles from '../guides.module.css';

const title = 'Common App Essay Word Count: What to Cut and What to Keep';
const description =
  'Understand the Common App essay word count and use a practical revision checklist to cut repetition without losing voice or reflection.';
const url = 'https://admitfolio.com/guides/common-app-essay-word-count';

export const metadata: Metadata = {
  title: `${title} | Admitfolio`,
  description,
  alternates: { canonical: url },
  openGraph: { title, description, url, type: 'article', publishedTime: '2026-08-20', modifiedTime: '2026-08-20' },
};

export default function CommonAppEssayWordCountPage() {
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
            <h1>Common App essay word count: what to cut and what to keep</h1>
            <p className={styles.dek}>
              Reaching the limit is not the goal. Use the space your story needs, then make every sentence earn its place.
            </p>
            <div className={styles.byline}>
              <span>By the Admitfolio Editorial Team</span>
              <span>Updated August 20, 2026</span>
              <span>4 min read</span>
            </div>
          </header>

          <div className={styles.articleStat}>
            <strong>The current Common App range:</strong> The personal essay accepts 250 to 650 words. Common
            App also reminds students that 650 is a limit, not a target.
          </div>

          <div className={styles.articleBody}>
            <p>
              Common App&apos;s{' '}
              <a href="https://www.commonapp.org/files/Common-App-UI-updates.pdf">official essay instructions</a>{' '}
              say the system will not accept fewer than 250 words or more than 650 words for the personal essay.
              Always confirm the counter and instructions inside your current application before submitting.
            </p>
            <p>
              An essay can be complete below 650 words. It can also need most of the available space. The real
              question is whether the reader has enough story, evidence, and reflection to understand something
              meaningful about you.
            </p>

            <h2>What usually deserves space</h2>
            <ul>
              <li><strong>A concrete moment:</strong> Give the reader something they can picture.</li>
              <li><strong>Your choices:</strong> Show what you did, said, made, noticed, or changed.</li>
              <li><strong>Necessary context:</strong> Explain only what the reader needs to understand the stakes.</li>
              <li><strong>Reflection:</strong> Connect the experience to how you think, act, or relate to people now.</li>
              <li><strong>Your voice:</strong> Keep the precise detail or phrasing that makes the essay sound like you.</li>
            </ul>

            <h2>What to cut first</h2>
            <ol>
              <li><strong>Throat-clearing.</strong> Delete the sentences that announce what you are about to explain.</li>
              <li><strong>Repeated context.</strong> Keep the clearest version of a fact and remove later reminders.</li>
              <li><strong>Double reflection.</strong> If two sentences explain the same lesson, choose the more specific one.</li>
              <li><strong>Long transitions.</strong> A clean paragraph break can sometimes replace a full transition sentence.</li>
              <li><strong>Weak verb phrases.</strong> “I was able to begin organizing” can often become “I organized.”</li>
              <li><strong>Other people&apos;s biographies.</strong> Give enough information to understand their role, then return the focus to you.</li>
            </ol>
            <div className={styles.callout}>
              <strong>Protect the meaning</strong>
              Do not cut every sensory detail, moment of vulnerability, or line of reflection just to make the
              essay move faster. Compression should reveal the heart of the story, not remove it.
            </div>

            <h2>A flexible 650-word budget</h2>
            <p>
              One draft might use about 80 words to enter the story, 250 for the central scene, 170 for the
              shift or complication, and 150 for reflection. That totals 650, but it is not a formula. Another
              essay may weave reflection throughout or need two shorter scenes.
            </p>
            <p>
              Use a word budget to diagnose imbalance. If 500 words explain background and 50 show what you
              did, the problem is not the limit. The story is focused in the wrong place.
            </p>

            <h2>Revise in three passes</h2>
            <ol>
              <li><strong>Story pass:</strong> Does every scene or detail help reveal the same central idea?</li>
              <li><strong>Sentence pass:</strong> Can you remove repetition or choose a more direct verb?</li>
              <li><strong>Word pass:</strong> Cut filler, stacked adjectives, and phrases that add no new meaning.</li>
            </ol>
            <p>
              Save a copy before each pass. A version that is too lean is easier to repair when you can recover
              the detail you removed.
            </p>

            <h2>Final word-count checklist</h2>
            <ul>
              <li>The essay is between 250 and 650 words in the application itself.</li>
              <li>The opening reaches the real story quickly.</li>
              <li>Background does not take more space than your decisions and growth.</li>
              <li>Each paragraph adds a new scene, idea, or layer of reflection.</li>
              <li>The ending adds meaning instead of summarizing the entire essay again.</li>
            </ul>
          </div>

          <RelatedGuides guides={[
            'college-essay-format',
            'common-app-essay-examples',
            'how-to-start-a-college-essay',
          ]} />

          <aside className={styles.articleCta}>
            <h2>Compare how real essays use limited space</h2>
            <p>Study pacing and reflection in verified examples, then revise around the needs of your own story.</p>
            <Link className="btn-primary" href="/#browse">Browse Common App essays →</Link>
          </aside>
        </article>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      </main>
      <GuideFooter />
    </div>
  );
}
