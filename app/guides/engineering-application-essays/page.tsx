import type { Metadata } from 'next';
import Link from 'next/link';
import { GuideArticleOverview } from '@/components/GuideArticleOverview';
import { GuideFooter, GuideHeader } from '@/components/GuideShell';
import { RelatedGuides } from '@/components/RelatedGuides';
import { collectionPathForGuide } from '@/lib/collections';
import { formatGuideDate, guideBySlug, guideUrl } from '@/lib/guides';
import styles from '../guides.module.css';

// Every figure below comes from the public catalogue API, counted by
// scripts/engineering-guide-figures.mjs. Re-run it before changing any of them,
// and bump `modified` in lib/guides.ts when one moves: the stat block states
// the date the counting was done, so the two have to agree.
//
// Aggregates only, deliberately. No opening line, no teaser, no seller name and
// no background tag from any listing appears on this page.

const guide = guideBySlug('engineering-application-essays');
const title = 'Engineering Application Essays: What You Actually Have to Write';
const description =
  'Plan the writing an engineering application really asks for: the why engineering answer, how much of a project to explain, and the short answers most advice skips.';
const url = guideUrl(guide.slug);

export const metadata: Metadata = {
  title: `${title} | Admitfolio`,
  description,
  alternates: { canonical: url },
  openGraph: { title, description, url, type: 'article', publishedTime: guide.published, modifiedTime: guide.modified },
};

export default function EngineeringApplicationEssaysPage() {
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    datePublished: guide.published,
    dateModified: guide.modified,
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
            <span className="pill"><span className="dot" />{guide.category}</span>
            <h1>Engineering application essays: what you actually have to write</h1>
            <p className={styles.dek}>
              The personal statement is the part everyone plans for. It is a minority of the writing an
              engineering application asks you to hand in.
            </p>
            <div className={styles.byline}>
              <span>By the Admitfolio Editorial Team</span>
              <span>Updated {formatGuideDate(guide.modified)}</span>
              <span>{guide.readTime}</span>
            </div>
          </header>

          <div className={styles.articleStat}>
            <strong>Counted on September 18, 2026:</strong> the 116 essays in the Admitfolio engineering
            collection are 28 Common App personal statements, 26 UC Personal Insight Questions, and 62
            supplements or short answers.
          </div>

          <GuideArticleOverview
            sections={[
              { id: 'count-the-writing', label: 'Count the writing before you draft any of it' },
              { id: 'why-engineering', label: 'Why engineering is not why this school' },
              { id: 'how-much-to-explain', label: 'Decide how much of the project to explain' },
              { id: 'short-answers', label: 'Short answers are a different job' },
              { id: 'which-engineering', label: 'Say which engineering, and check what you are applying to' },
              { id: 'read-for-calibration', label: 'Read the ones whose school list looks like yours' },
              { id: 'before-you-submit', label: 'Before you submit' },
            ]}
            summary={[
              'Most of the writing is supplements and short answers, not the personal statement.',
              'Answer why engineering with a problem you kept returning to, not an origin story.',
              'Explain a project in three moves: what it does, what made it hard, what you decided.',
              'Check whether you are applying to a major or to a college of engineering.',
            ]}
          />

          <div className={styles.articleBody}>
            <p>
              Almost every piece of college essay advice is written about one essay, the Common App personal
              statement. That essay is real and it matters. For an engineering applicant it is also not where
              most of the work is.
            </p>
            <p>
              The listings in the engineering collection on this site are whole applications rather than single
              essays, so they show the shape of the job and not only its headline piece. The counts below come
              from that collection. The rest is what to do about them.
            </p>

            <h2 id="count-the-writing">Count the writing before you draft any of it</h2>
            <p>
              Sixteen of the 44 engineering listings contain no Common App personal statement at all. Seven of
              those are UC Personal Insight Question sets, where there is no personal statement to write. The
              other nine are supplements and short answers on their own, sent to programs that asked for them,
              and the heaviest of them carries eight. The most common shape, 17 of the 44, is a personal
              statement with supplements alongside it.
            </p>
            <p>
              You cannot estimate that total from the Common App&apos;s own screen. Common App tells students to
              check each college&apos;s requirements inside the application, and its{' '}
              <a href="https://www.commonapp.org/apply/first-year-students/">official first-year guide</a>{' '}
              explains where to find them. Do that before you draft, on every school on your list, and write
              down the prompt, the word limit and the deadline it belongs to.
            </p>
            <div className={styles.callout}>
              <strong>Make the list before the draft</strong>
              Every prompt, every limit, every deadline, on one page. The order you write in should come out of
              that list, not out of which essay you are most anxious about.
            </div>

            <h2 id="why-engineering">Why engineering is not why this school</h2>
            <p>
              If a program asks why engineering, or why this major, it is not asking the same thing as why this
              college. The school question is about fit with a place, and our{' '}
              <Link href="/guides/why-this-college-essay-examples">research method for that one</Link> covers
              it. This question is about the subject, and it has to be answerable before you know which schools
              you are applying to.
            </p>
            <p>
              The weak version is an origin story and nothing else: the disassembled computer, the childhood
              Lego, the science fair. The origin is not the problem. The problem is that the essay often stops
              there, and an origin explains where an interest started rather than what it turned into.
            </p>
            <p>
              A stronger answer names a problem you kept returning to after the origin, and says what you did
              about it. It does not need an impressive project. It needs one piece of evidence that the interest
              survived contact with something difficult.
            </p>

            <h2 id="how-much-to-explain">Decide how much of the project to explain</h2>
            <p>
              If there is a build in your essay, this is the question the draft is really stuck on. Explain too
              much and the essay becomes documentation. Explain too little and the reader cannot tell what was
              hard about it, which means they cannot tell what you did.
            </p>
            <p>
              A budget that works: one sentence on what the thing does, one or two on the constraint that made
              it difficult, and the rest on the decision you made and why. Technical detail earns its place when
              it is what makes a decision legible, and not otherwise.
            </p>
            <p>
              Test it on someone outside your field. Ask them two questions: what went wrong, and what did you
              change. If they cannot answer the first, the explanation is too technical. If they cannot answer
              the second, it is too vague. They do not need to understand the system.
            </p>

            <h2 id="short-answers">Short answers are a different job</h2>
            <p>
              Twenty-three of the 116 essays in the collection are short answers, and they sit in only eight
              listings. The load is concentrated rather than spread: one listing carries six of them on its own.
              If your school list includes programs that ask for short answers, that is where a weekend goes.
            </p>
            <p>
              At fifty to a hundred and fifty words there is no room for a scene. Answer in the first clause,
              give one piece of evidence, and stop. The opening move that works in a 650-word essay, entering a
              moment already in motion, will spend a third of a short answer before it has said anything.
            </p>
            <p>
              Do not move the best paragraph of your personal statement into one either. At a school that asked
              for both, one reader has both in front of them.
            </p>

            <h2 id="which-engineering">Say which engineering, and check what you are applying to</h2>
            <p>
              Engineering is not one major, and the collection shows it. Biomedical is the most common
              discipline in it, then aerospace, then mechanical. Seven of the 44 listings are undeclared,
              general or first-year engineering instead of a named discipline.
            </p>
            <p>
              That last group is the one to be deliberate about. Some programs admit you to a specific major and
              some admit you to a college of engineering and sort you later. Check which on the program&apos;s
              own page, because it decides whether your essay should commit to a discipline or argue for a
              direction. Committing anyway is a reasonable choice. It should be a choice.
            </p>

            <h2 id="read-for-calibration">Read the ones whose school list looks like yours</h2>
            <p>
              Seventy-eight different colleges appear across the 44 listings, and 45 of them appear in more than
              one, so the collection is not concentrated in a handful of famous programs. Start with the
              listings whose schools overlap yours. Prompts vary between programs far more than general advice
              about essays does, and an example written for a different prompt teaches you a shape you then
              have to unlearn.
            </p>
            <p>
              Eight of the listings carry UC Personal Insight Questions, six of them as complete sets of four.
              If a UC is on your list, those four are the entire written application there, and they are worth
              planning on their own terms. Our{' '}
              <Link href="/guides/uc-piq-examples">guide to the eight PIQ prompts</Link> covers how to choose.
            </p>
            <p>
              Read them for the decisions rather than the sentences. Our guide to{' '}
              <Link href="/guides/how-to-take-inspiration-from-college-essays">taking inspiration without copying</Link>{' '}
              is the method for doing that.
            </p>

            <h2 id="before-you-submit">Before you submit</h2>
            <ul>
              <li>Every prompt on your list has a draft, and every draft is inside its own limit.</li>
              <li>The why engineering answer names a problem, not only an origin.</li>
              <li>A reader outside your field can say what went wrong and what you changed.</li>
              <li>No short answer opens with a scene.</li>
              <li>No paragraph appears in two pieces of writing going to the same college.</li>
              <li>Each essay says which engineering, or leaves it open on purpose rather than by accident.</li>
            </ul>
          </div>

          <RelatedGuides guides={[
            'uc-piq-examples',
            'why-this-college-essay-examples',
            'how-to-take-inspiration-from-college-essays',
          ]} />

          <aside className={styles.articleCta}>
            <h2>Read whole engineering applications, not one essay</h2>
            <p>
              The collection holds the personal statements, supplements and short answers that went out
              together, from students who were admitted into engineering programs. Read them for the decisions,
              then close the tab and write your own.
            </p>
            <Link className="btn-primary" href={collectionPathForGuide('engineering-application-essays')}>
              Browse engineering essays →
            </Link>
          </aside>
        </article>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      </main>
      <GuideFooter />
    </div>
  );
}
