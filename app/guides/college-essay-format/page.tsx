import type { Metadata } from 'next';
import Link from 'next/link';
import { GuideArticleOverview } from '@/components/GuideArticleOverview';
import { GuideFooter, GuideHeader } from '@/components/GuideShell';
import { RelatedGuides } from '@/components/RelatedGuides';
import styles from '../guides.module.css';

const title = 'College Essay Format: A Simple, Readable Structure';
const description =
  'Format a college application essay with readable paragraphs, clean dialogue, optional titles, and a careful submission check.';
const url = 'https://admitfolio.com/guides/college-essay-format';

export const metadata: Metadata = {
  title: `${title} | Admitfolio`,
  description,
  alternates: { canonical: url },
  openGraph: { title, description, url, type: 'article', publishedTime: '2026-07-30', modifiedTime: '2026-07-30' },
};

export default function CollegeEssayFormatPage() {
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    datePublished: '2026-07-30',
    dateModified: '2026-07-30',
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
            <span className="pill"><span className="dot" />Writing basics</span>
            <h1>College essay format: a simple, readable structure</h1>
            <p className={styles.dek}>
              College essays do not need an academic paper format. They need clear paragraphs, intentional pacing, and a clean final paste.
            </p>
            <div className={styles.byline}>
              <span>By the Admitfolio Editorial Team</span>
              <span>Updated July 30, 2026</span>
              <span>5 min read</span>
            </div>
          </header>

          <div className={styles.articleStat}>
            <strong>The short answer:</strong> Use normal paragraphs, separate dialogue when the speaker
            changes, skip decorative formatting, and always inspect the application preview before submitting.
          </div>

          <GuideArticleOverview
            sections={[
              { id: 'readable-structure', label: 'A readable college essay structure' },
              { id: 'clear-paragraphs', label: 'Keep paragraphs easy to follow' },
              { id: 'format-dialogue', label: 'Format dialogue simply' },
              { id: 'need-a-title', label: 'Do you need a title?' },
              { id: 'visual-styling', label: 'Do not rely on visual styling' },
              { id: 'submission-process', label: 'A safe drafting and submission process' },
              { id: 'format-checklist', label: 'Final format checklist' },
            ]}
            summary={[
              'Use readable paragraphs, not an academic paper format.',
              'Start a new paragraph when time, place, speaker, focus, or idea changes.',
              'Keep dialogue simple and do not rely on bold, italics, or tabs.',
              'Always check the final application preview before submitting.',
            ]}
          />

          <div className={styles.articleBody}>
            <p>
              Most application essays are submitted through a text box, not as a formal paper. Unless a
              college gives different instructions, you do not need MLA formatting, a running header, a works
              cited page, or your name repeated above the response.
            </p>
            <p>
              The exact requirements can vary by college and prompt. Common App advises students to review
              each college&apos;s requirements inside the application, and its{' '}
              <a href="https://www.commonapp.org/apply/first-year-students/">official first-year guide</a>{' '}
              explains where to find them.
            </p>

            <h2 id="readable-structure">A readable college essay structure</h2>
            <p>
              There is no required number of paragraphs. A simple personal essay often moves through four
              functions, even when the final piece uses more than four paragraphs:
            </p>
            <ol>
              <li><strong>Entry:</strong> Bring the reader into a specific idea, scene, or tension.</li>
              <li><strong>Development:</strong> Show what happened through concrete choices and details.</li>
              <li><strong>Movement:</strong> Reveal the change, complication, or new understanding.</li>
              <li><strong>Reflection:</strong> Explain what the experience shows about how you think or act now.</li>
            </ol>
            <div className={styles.callout}>
              <strong>Format follows meaning</strong>
              Start a new paragraph when the time, place, speaker, focus, or idea changes. Do not break
              paragraphs only to make the page look balanced.
            </div>

            <h2 id="clear-paragraphs">Keep paragraphs easy to follow</h2>
            <p>
              Large blocks of text are tiring on a screen. If a paragraph contains a scene, its explanation,
              a second scene, and a new lesson, it probably needs a break. On the other hand, a page of one-line
              paragraphs can make every sentence feel equally dramatic.
            </p>
            <p>
              Read the draft aloud and listen for turns. A new paragraph should help the reader feel a real
              shift, not interrupt a thought that belongs together.
            </p>

            <h2 id="format-dialogue">Format dialogue simply</h2>
            <ul>
              <li>Use quotation marks around spoken words.</li>
              <li>Start a new paragraph when the speaker changes.</li>
              <li>Use only the dialogue the reader needs.</li>
              <li>Identify the speaker quickly when the context is not obvious.</li>
              <li>Read the pasted version carefully because smart quotation marks may change.</li>
            </ul>
            <p>
              Dialogue should reveal a relationship, decision, or tension. If it only repeats information you
              can summarize in fewer words, summary is usually cleaner.
            </p>

            <h2 id="need-a-title">Do you need a title?</h2>
            <p>
              Usually, no. A title can work when it adds meaning and the application gives you room, but it
              should not explain the essay or repeat the prompt. If you are near the word limit, the title may
              count toward it. Check the counter after you paste.
            </p>

            <h2 id="visual-styling">Do not rely on visual styling</h2>
            <p>
              Bold, italics, special spacing, tabs, and unusual symbols may not survive the move from your
              drafting document to the application. Make the meaning clear through the words themselves.
              Decorative formatting should never carry information the reader would miss without it.
            </p>

            <h2 id="submission-process">A safe drafting and submission process</h2>
            <ol>
              <li>Draft and revise in a document where you can keep version history.</li>
              <li>Save a plain-text backup before pasting into the application.</li>
              <li>Paste the response and check the application&apos;s word or character counter.</li>
              <li>Restore paragraph breaks or punctuation that changed.</li>
              <li>Use the preview function and read the entire response from beginning to end.</li>
              <li>Confirm that the correct essay appears under the correct college and prompt.</li>
            </ol>

            <h2 id="format-checklist">Final format checklist</h2>
            <ul>
              <li>The response follows the prompt&apos;s current instructions and limit.</li>
              <li>Paragraph breaks mark real changes and appear correctly in preview.</li>
              <li>Dialogue is easy to follow.</li>
              <li>No sentence depends on bold, italics, or tabs to make sense.</li>
              <li>The essay starts and ends cleanly, with no drafting notes left behind.</li>
            </ul>
          </div>

          <RelatedGuides guides={[
            'common-app-essay-word-count',
            'how-to-start-a-college-essay',
            'common-app-essay-examples',
          ]} />

          <aside className={styles.articleCta}>
            <h2>See how different essay structures read</h2>
            <p>Browse verified examples for pacing and paragraph choices, then build the format your story needs.</p>
            <Link className="btn-primary" href="/#browse">Browse college essays →</Link>
          </aside>
        </article>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      </main>
      <GuideFooter />
    </div>
  );
}
