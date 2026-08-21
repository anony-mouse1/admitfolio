import type { Metadata } from 'next';
import Link from 'next/link';
import { GuideArticleOverview } from '@/components/GuideArticleOverview';
import { GuideFooter, GuideHeader } from '@/components/GuideShell';
import { RelatedGuides } from '@/components/RelatedGuides';
import styles from '../guides.module.css';

const title = 'UC PIQ Examples and What Makes Each Response Work';
const description =
  'Learn how to approach all eight UC Personal Insight Questions, choose your four prompts, and write specific 350-word responses in your own voice.';
const url = 'https://admitfolio.com/guides/uc-piq-examples';

export const metadata: Metadata = {
  title: `${title} | Admitfolio`,
  description,
  alternates: { canonical: url },
  openGraph: { title, description, url, type: 'article', publishedTime: '2026-08-12', modifiedTime: '2026-08-12' },
};

export default function UcPiqExamplesPage() {
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    datePublished: '2026-08-12',
    dateModified: '2026-08-12',
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
            <span className="pill"><span className="dot" />UC applications</span>
            <h1>UC PIQ examples and what makes each response work</h1>
            <p className={styles.dek}>
              Strong PIQs answer the question early, show what you did, and make your way of thinking easy to see.
            </p>
            <div className={styles.byline}>
              <span>By the Admitfolio Editorial Team</span>
              <span>Updated August 12, 2026</span>
              <span>10 min read</span>
            </div>
          </header>

          <div className={styles.articleStat}>
            <strong>The official format:</strong> UC gives first-year applicants eight Personal Insight
            Questions. You choose four, and each response can be up to 350 words.
          </div>

          <GuideArticleOverview
            sections={[
              { id: 'direct-answers', label: 'PIQs are direct answers, not miniature movie scripts' },
              { id: 'choose-four', label: 'Choose four prompts that work together' },
              { id: 'eight-topics', label: 'What to show for each of the eight PIQ topics' },
              { id: 'stronger-focus', label: 'A short UC PIQ example of stronger focus' },
              { id: 'revise-as-set', label: 'Revise each response as part of a set' },
              { id: 'learn-without-borrowing', label: 'Learn from examples without borrowing a life' },
            ]}
            summary={[
              'Choose four PIQs that reveal different parts of you.',
              'Answer the prompt early, then show action, effect, and reflection.',
              'Use specific evidence instead of only naming traits.',
              'Review all four together for repetition, coverage, and voice.',
            ]}
          />

          <div className={styles.articleBody}>
            <p>
              The UC application does not ask you to find the four most impressive prompts. It asks you to
              choose the four that best reflect your experiences. UC also says every question is considered
              equally. Start with the stories you need an admissions reader to know, then match those stories
              to the prompts.
            </p>
            <p>
              Before drafting, read the current wording on the{' '}
              <a href="https://admission.universityofcalifornia.edu/how-to-apply/applying-as-a-first-year/personal-insight-questions.html">
                official UC Personal Insight Questions page
              </a>. Requirements can change, and the application itself is always the final source.
            </p>

            <h2 id="direct-answers">PIQs are direct answers, not miniature movie scripts</h2>
            <p>
              You have 350 words, so do not spend 100 of them setting a scene. Give the reader the answer,
              then show the evidence. A clear response can still have personality, but clarity comes first.
            </p>
            <div className={styles.callout}>
              <strong>A useful four-part shape</strong>
              Answer the prompt. Show one concrete action. Explain the effect. Reflect on what the experience
              reveals about you now.
            </div>

            <h2 id="choose-four">Choose four prompts that work together</h2>
            <p>
              Make a simple list of the qualities and contexts already visible elsewhere in your application.
              Then list what is still missing. Your four PIQs should add new information, not repeat the same
              leadership title, project, or lesson four times.
            </p>
            <ul>
              <li><strong>Coverage:</strong> Does each response reveal a different part of your life or thinking?</li>
              <li><strong>Evidence:</strong> Can you name actions, decisions, or details instead of only describing a trait?</li>
              <li><strong>Ownership:</strong> Is your role clear even when the story involves a team or family?</li>
              <li><strong>Context:</strong> Does the reader understand the opportunities or limits you were working within?</li>
            </ul>

            <h2 id="eight-topics">What to show for each of the eight PIQ topics</h2>
            <ol>
              <li><strong>Leadership.</strong> Focus on whom you helped, the problem you noticed, and the change you made. A title is not required.</li>
              <li><strong>Creativity.</strong> Show how you make, adapt, or solve. Creativity can appear in art, code, community work, or everyday decisions.</li>
              <li><strong>Talent or skill.</strong> Explain how the skill developed through practice, feedback, setbacks, and use. Avoid turning the response into an awards list.</li>
              <li><strong>Educational opportunity or barrier.</strong> Name the access point or obstacle, then spend most of the response on how you responded.</li>
              <li><strong>Significant challenge.</strong> Give enough context to understand the challenge, but keep your choices and growth at the center.</li>
              <li><strong>Academic subject.</strong> Move beyond saying you love a subject. Show what you pursued, built, read, tested, or questioned because of that interest.</li>
              <li><strong>Community contribution.</strong> Define the community specifically. Explain what it needed, what you contributed, and how you listened.</li>
              <li><strong>What makes you stand out.</strong> Use this open prompt when an important part of you does not fit cleanly elsewhere.</li>
            </ol>

            <h2 id="stronger-focus">A short UC PIQ example of stronger focus</h2>
            <p>
              A general leadership response might say, “I learned that a good leader listens to everyone.”
              The idea is fine, but it gives the reader no proof.
            </p>
            <p>
              A more useful draft would name the moment the writer realized two quieter teammates had stopped
              speaking, the change they made to the meeting format, and what happened after everyone could
              contribute. The lesson becomes believable because the action comes first.
            </p>
            <p>
              This is a hypothetical example of the thinking process, not a template. Your details, language,
              and conclusion should come from your own experience.
            </p>

            <h2 id="revise-as-set">Revise each response as part of a set</h2>
            <ul>
              <li>Underline the sentence that directly answers the prompt. Move it earlier if needed.</li>
              <li>Circle every action you took. Add one specific action if the response is mostly summary.</li>
              <li>Remove repeated background that already appears in another PIQ.</li>
              <li>Check that each ending adds reflection instead of repeating the opening.</li>
              <li>Read all four in one sitting and write down the person they reveal together.</li>
            </ul>

            <h2 id="learn-without-borrowing">Learn from examples without borrowing a life</h2>
            <p>
              A real PIQ can teach you how quickly another student establishes context, where they place
              reflection, or how they make a small action meaningful. It should never supply your sentence,
              metaphor, or identity. Close the example before drafting, and write the version only you can own.
            </p>
          </div>

          <RelatedGuides guides={[
            'how-to-take-inspiration-from-college-essays',
            'how-to-start-a-college-essay',
            'college-essay-format',
          ]} />

          <aside className={styles.articleCta}>
            <h2>Compare real approaches to the UC PIQs</h2>
            <p>Browse verified essays by school and application type. Study the choices, then return to your own story.</p>
            <Link className="btn-primary" href="/#browse">Browse UC essays →</Link>
          </aside>
        </article>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      </main>
      <GuideFooter />
    </div>
  );
}
