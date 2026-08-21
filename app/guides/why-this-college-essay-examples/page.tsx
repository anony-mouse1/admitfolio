import type { Metadata } from 'next';
import Link from 'next/link';
import { GuideArticleOverview } from '@/components/GuideArticleOverview';
import { GuideFooter, GuideHeader } from '@/components/GuideShell';
import { RelatedGuides } from '@/components/RelatedGuides';
import styles from '../guides.module.css';

const title = 'Why This College Essay Examples: A Better Research Method';
const description =
  'Learn how to research a school and write a specific Why This College essay about fit, contribution, and genuine academic curiosity.';
const url = 'https://admitfolio.com/guides/why-this-college-essay-examples';

export const metadata: Metadata = {
  title: `${title} | Admitfolio`,
  description,
  alternates: { canonical: url },
  openGraph: { title, description, url, type: 'article', publishedTime: '2026-08-20', modifiedTime: '2026-08-20' },
};

export default function WhyThisCollegeEssayExamplesPage() {
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
            <span className="pill"><span className="dot" />Supplements</span>
            <h1>Why this college essay examples: a better research method</h1>
            <p className={styles.dek}>
              The strongest answer connects one specific school resource to something you have already done and something you hope to do next.
            </p>
            <div className={styles.byline}>
              <span>By the Admitfolio Editorial Team</span>
              <span>Updated August 20, 2026</span>
              <span>8 min read</span>
            </div>
          </header>

          <div className={styles.articleStat}>
            <strong>A simple test:</strong> If you can replace the college name and the paragraph still works,
            the research is not specific enough yet.
          </div>

          <GuideArticleOverview
            sections={[
              { id: 'connection-formula', label: 'Use the connection formula' },
              { id: 'research-layers', label: 'Research in layers instead of collecting names' },
              { id: 'weak-and-stronger', label: 'Weak and stronger Why This College examples' },
              { id: 'show-contribution', label: 'Show contribution without making promises' },
              { id: 'word-limit', label: 'Adjust the method to the word limit' },
              { id: 'details-to-leave-out', label: 'Details to leave out' },
              { id: 'research-checklist', label: 'Final research checklist' },
            ]}
            summary={[
              'Connect one verified school resource to a real personal reason.',
              'Show what you will do or contribute, not only what the school offers.',
              'Choose depth over a long list of campus names.',
              'Verify every current course, program, professor, and organization.',
            ]}
          />

          <div className={styles.articleBody}>
            <p>
              A “Why This College” essay is not a brochure summary. Admissions readers already know their
              school has dedicated professors, an active campus, and many opportunities. They want to know
              which opportunities matter to you and why.
            </p>
            <p>
              Good research gives you evidence. Your experiences give that evidence meaning. The final answer
              needs both.
            </p>

            <h2 id="connection-formula">Use the connection formula</h2>
            <div className={styles.callout}>
              <strong>A strong paragraph connects three things</strong>
              A specific school resource + your personal reason for caring + the action or contribution you
              hope to make there.
            </div>
            <p>
              The resource might be a course, lab, academic program, archive, community partnership, or
              student organization. Specific does not mean obscure. It means the detail has a clear reason for
              appearing in your answer.
            </p>

            <h2 id="research-layers">Research in layers instead of collecting names</h2>
            <ol>
              <li><strong>Start with the prompt.</strong> Note whether it asks about academics, community, values, contribution, or all four.</li>
              <li><strong>Open official school pages.</strong> Read the department, course, program, lab, center, and student organization pages related to your interests.</li>
              <li><strong>Check what students actually do.</strong> Look for recent projects, publications, events, partnerships, or course descriptions.</li>
              <li><strong>Write the personal link beside every detail.</strong> If you cannot explain why a resource matters to you, do not include it.</li>
              <li><strong>Verify every name before submitting.</strong> Programs and courses change. Use current official sources.</li>
            </ol>

            <h2 id="weak-and-stronger">Weak and stronger Why This College examples</h2>
            <p>
              A weak sentence says: “The university&apos;s world-class professors and diverse community will help
              me reach my goals.” It sounds positive, but it could describe almost any college and tells the
              reader nothing about the student.
            </p>
            <p>
              A stronger pattern says: “After building [your real project], I want to study [a specific
              question] through [a verified course, lab, or program], then contribute [a skill or perspective]
              to [a relevant campus group].” The brackets are not a fill-in-the-blank submission. They show the
              connections your own sentence needs to make.
            </p>
            <p>
              Another weak approach lists five campus resources in one paragraph. A stronger response chooses
              one or two and explains the sequence: what you have done, what question remains, and how the
              school would let you keep pursuing it.
            </p>

            <h2 id="show-contribution">Show contribution without making promises</h2>
            <p>
              Contribution is not a grand claim about transforming the campus. It can be a habit you will
              bring: organizing peers around a shared problem, asking questions across fields, mentoring newer
              students, performing, building, translating, or caring for a community.
            </p>
            <p>
              Ground that future contribution in something you already do. Past behavior makes the future plan
              feel credible.
            </p>

            <h2 id="word-limit">Adjust the method to the word limit</h2>
            <ul>
              <li><strong>Around 100 words:</strong> Choose one central connection and explain it cleanly.</li>
              <li><strong>Around 150 words:</strong> Add brief personal context and one contribution.</li>
              <li><strong>Around 250 words:</strong> Develop two connected resources or show an academic and community dimension.</li>
            </ul>
            <p>
              Do not shrink a 250-word list into 100 words. Narrow the idea instead. Depth is more convincing
              than compressed name-dropping.
            </p>

            <h2 id="details-to-leave-out">Details to leave out</h2>
            <ul>
              <li>Rankings, prestige, and reputation unless the prompt specifically asks about them.</li>
              <li>Facts from an admissions homepage that every applicant can see.</li>
              <li>Traditions you mention only because they sound fun.</li>
              <li>A professor&apos;s name with no understanding of their work.</li>
              <li>Claims that the school is your dream, perfect fit, or only choice without evidence.</li>
            </ul>

            <h2 id="research-checklist">Final research checklist</h2>
            <ul>
              <li>Every school detail is current and comes from an official source.</li>
              <li>Every detail connects to a real experience, question, or goal.</li>
              <li>The essay shows what you will do, not only what the school will give you.</li>
              <li>The answer responds to the exact prompt and current word limit.</li>
              <li>No other college name could replace this one without rewriting the paragraph.</li>
            </ul>
          </div>

          <RelatedGuides guides={[
            'how-to-take-inspiration-from-college-essays',
            'how-to-start-a-college-essay',
            'college-essay-format',
          ]} />

          <aside className={styles.articleCta}>
            <h2>See how students made school-specific choices</h2>
            <p>Browse verified supplemental essays, then research every current school detail yourself.</p>
            <Link className="btn-primary" href="/#browse">Browse supplemental essays →</Link>
          </aside>
        </article>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      </main>
      <GuideFooter />
    </div>
  );
}
