import type { Metadata } from 'next';
import Link from 'next/link';
import { GuideArticleOverview } from '@/components/GuideArticleOverview';
import { GuideFooter, GuideHeader } from '@/components/GuideShell';
import { RelatedGuides } from '@/components/RelatedGuides';
import { collectionPathForGuide } from '@/lib/collections';
import { formatGuideDate, guideBySlug, guideUrl } from '@/lib/guides';
import styles from '../guides.module.css';

// No catalogue figures on this page, deliberately. An earlier draft opened with
// counts off /api/listings: how many engineering listings, how many essays,
// how the prompts split. They came out the day someone lists another
// engineering essay, Google caches the old ones, and a reader who has never
// heard of this site is being handed our inventory instead of an answer.
//
// The claims those counts supported are all still here, stated as facts about
// engineering applications rather than about what is currently for sale.
// scripts/verify-engineering-guide.mjs asserts the removed phrasings cannot
// come back.

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
              Engineering programs usually ask for more writing than the Common App essay, and each college
              decides for itself how much.
            </p>
            <div className={styles.byline}>
              <span>By the Admitfolio Editorial Team</span>
              <span>Updated {formatGuideDate(guide.modified)}</span>
              <span>{guide.readTime}</span>
            </div>
          </header>

          <div className={styles.articleStat}>
            Two questions run through almost every engineering supplement: why engineering, and what did you
            build. Prepare both properly and most of your list is answerable.
          </div>

          <GuideArticleOverview
            sections={[
              { id: 'count-the-writing', label: 'Count the writing before you draft any of it' },
              { id: 'why-engineering', label: 'Where the why engineering answer usually goes wrong' },
              { id: 'how-much-to-explain', label: 'Decide how much of the project to explain' },
              { id: 'short-answers', label: 'Short answers, and where they pile up' },
              { id: 'which-engineering', label: 'Which engineering, and what you are applying into' },
              { id: 'read-for-calibration', label: 'Reading examples without inheriting the wrong shape' },
              { id: 'before-you-submit', label: 'Before you submit' },
            ]}
            summary={[
              'Most of the writing an engineering application asks for is set by individual colleges.',
              'Carry the why engineering answer past the origin story.',
              'Explain a project in three moves: what it does, what made it hard, what you decided.',
              'Check whether you are applying to a named major or to a college of engineering.',
            ]}
          />

          <div className={styles.articleBody}>
            <p>
              Search for college essay advice and nearly all of it will be about the Common App personal
              statement. Engineering applicants who plan around that one essay are usually caught out in
              October, when the supplements for a full school list arrive at once.
            </p>
            <p>
              Why engineering and what you built are the two questions that run through most of it. Both are
              worth preparing properly, because a strong answer to either can be adapted across your whole
              list.
            </p>

            <h2 id="count-the-writing">Count the writing before you draft any of it</h2>
            <p>
              How much you have to write depends entirely on where you apply. A list of eight colleges might
              carry two extra prompts or twenty, and you cannot tell which from the outside. One large
              engineering program can ask for a why-engineering question, a why-us question and a run of short
              answers, taking more words out of you on its own than the personal statement did.
            </p>
            <p>
              Common App does not show you any of this up front. A college&apos;s writing requirements appear
              once you add it in My Colleges, and Common App&apos;s own{' '}
              <a href="https://www.commonapp.org/apply/first-year-students/">guide for first-year applicants</a>{' '}
              sends students there and to each college&apos;s information page to find them. Add every school
              early, including the ones you are still unsure about, and copy out each prompt with its word
              limit and its deadline.
            </p>
            <div className={styles.callout}>
              <strong>Make the list before the draft</strong>
              Every prompt, every limit, every deadline, on one page. Then start with whichever answer the most
              colleges can use.
            </div>

            <h2 id="why-engineering">Where the why engineering answer usually goes wrong</h2>
            <p>
              Sooner or later an engineering supplement will ask you why engineering. It is easy to confuse
              with the why-this-college question, which wants research into a specific place and has{' '}
              <Link href="/guides/why-this-college-essay-examples">a method of its own</Link>. Why engineering
              is about the subject, and you should be able to answer it before you have a school list.
            </p>
            <p>
              The standard answer is an origin story: the computer you took apart, the Lego, the science fair.
              Those are fine to write, and plenty of good essays open with one. What sinks the weak ones is
              that they finish there too, leaving a reader who knows when you got interested and nothing about
              what you have done since.
            </p>
            <p>
              So carry the story forward. Name a problem you kept coming back to after the origin, and show
              what you actually did about it. Modest evidence is enough here, as long as it shows the interest
              surviving contact with something difficult. A build that failed twice will do. So will a course
              you took outside school, or a question a teacher could not answer.
            </p>

            <h2 id="how-much-to-explain">Decide how much of the project to explain</h2>
            <p>
              If your essay has a build in it, this is where the draft usually stalls. The instinct is to
              explain the system, and a page of that reads as a spec sheet written for somebody who already
              works in the field. Strip it back too far, though, and the writing no longer shows what was
              difficult, which is the only reason a project is worth describing at all.
            </p>
            <p>
              Try a budget. One sentence on what the thing does. One or two on the constraint that made it
              hard. Everything after that on the decision you made and why you made it. Keep whatever technical
              detail a reader needs in order to follow that decision, and let the rest go.
            </p>
            <p>
              Then hand it to someone outside your field and ask what went wrong and what you changed. What
              you are listening for is the second answer, and whether it arrives without them having understood
              the system at all. When it does not arrive, the draft has written up the project and left you out
              of it.
            </p>

            <h2 id="short-answers">Short answers, and where they pile up</h2>
            <p>
              A few engineering programs, mostly large public universities running their own portals, attach a
              run of short answers to the application, usually somewhere between fifty and two hundred words
              each, on top of everything the Common App already wants. Find out early which colleges on your
              list work this way. They are what quietly doubles the workload.
            </p>
            <p>
              At that length a scene will not fit. Put the answer in the opening clause and follow it with the
              most specific piece of evidence you have. There is rarely room for a third sentence. Dropping the
              reader into a moment already in motion works well in a 650-word essay, but here it burns a third
              of the space before the answer arrives.
            </p>
            <p>
              Resist the urge to lift your best personal-statement paragraph into one of these, because
              wherever a college asked for both, the same reader has both open.
            </p>

            <h2 id="which-engineering">Which engineering, and what you are applying into</h2>
            <p>
              Engineering covers a dozen fields that share a name and not much else. Biomedical, aerospace and
              mechanical applicants all meet the same prompt and have to fill it with completely different
              material, so &quot;I want to study engineering&quot; leaves a reader knowing nothing they could
              not already see on your form.
            </p>
            <p>
              Before you commit on the page, find out what you are applying into. Programs differ here: some
              admit you straight to a named major, others take you into a college of engineering and let you
              declare later, and a few run an undeclared or first-year engineering route on purpose. The
              program&apos;s own admissions page will say. If you are applying undeclared you can still name a
              discipline, and you may well want to, but do it knowing the application is not asking you to.
            </p>

            <h2 id="read-for-calibration">Reading examples without inheriting the wrong shape</h2>
            <p>
              Engineering prompts differ enough from one program to the next that a strong example can teach
              you the wrong shape. An essay built for a college that asked about a specific lab will not
              transfer to a portal asking a run of blunt short answers. Look for writing that went to colleges
              overlapping your own list, read that first, and study how each writer decided what to include.
            </p>
            <p>
              The University of California is the clearest case. UC ignores the Common App entirely and asks
              for four Personal Insight Questions of up to 350 words each, so a UC campus on your list means a
              separate written application planned from scratch.{' '}
              <Link href="/guides/uc-piq-examples">Choosing which four to answer</Link> is most of that work.
            </p>

            <h2 id="before-you-submit">Before you submit</h2>
            <ul>
              <li>Every prompt on your list has a draft, and every draft sits inside its own limit.</li>
              <li>The why engineering answer carries the story past its origin.</li>
              <li>Someone outside your field can say what went wrong and what you changed.</li>
              <li>Short answers reach the point inside their first clause.</li>
              <li>No paragraph appears twice in anything going to the same college.</li>
              <li>Where an essay leaves your discipline open, that was a decision you made.</li>
            </ul>
          </div>

          <RelatedGuides guides={[
            'uc-piq-examples',
            'why-this-college-essay-examples',
            'how-to-take-inspiration-from-college-essays',
          ]} />

          <aside className={styles.articleCta}>
            <h2>See what an engineering application looked like</h2>
            <p>
              Admitfolio has personal statements, supplements and short answers that went out in the same
              application, from students who were admitted into engineering programs. Study the choices they
              made, then close the tab and write from your own.
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
