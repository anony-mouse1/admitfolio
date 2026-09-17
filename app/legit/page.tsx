import type { Metadata } from 'next';
import Link from 'next/link';
import { GuideFooter, GuideHeader } from '@/components/GuideShell';
import { COLLECTIONS_PATH } from '@/lib/collections';
import { GUIDES_PATH } from '@/lib/guides';
import { legitUrl } from '@/lib/legit';
import { CONTACT_EMAIL, SITE_URL } from '@/lib/site';
import guide from '@/app/guides/guides.module.css';
import styles from './legit.module.css';

// "Is admitfolio legit" is the third biggest search query the site gets, at
// roughly 33 clicks a month, and until now nothing on the site answered it.
// Google was building its own answer out of the checkout screen and the Terms,
// because those were the only pages that mentioned verification or refunds at
// all.
//
// Server rendered with no client component of its own, so the whole answer is
// in the served HTML. That is the entire point: the homepage is one large
// client component and a crawler without JavaScript sees "Loading essays..."
// there, which is exactly why this could not be a section on `/`.
//
// Same shape as an article under app/guides/: metadata with a canonical and an
// OpenGraph card, the shared GuideHeader and GuideFooter, and the guides CSS
// module for the article frame.
//
// ----------------------------------------------------------------------------
// PLACEHOLDERS. Two things on this page are deliberately unwritten. Neither is
// a guess waiting to be checked; both are somebody else's decision.
//
//   1. PARTNERSHIPS. One sentence about working on plagiarism-detection
//      integrations now sits at the end of "What happens if someone copies one",
//      added on Ritvik's instruction and in his wording. It names no company,
//      gives no date, and is conditional, so it describes work in progress
//      rather than something that exists today.
//
//      STILL OPEN, and this is the part Fatimah has to settle: partnership work
//      is out of scope under Ritvik's contract without her written approval, and
//      she has not given it. The sentence is in the PR for her to approve, cut
//      or reword, and it is called out in the PR description rather than left to
//      be found in the diff. Do not grow it, and never name a service.
//
//   2. WHO SUPPORT ROUTES TO. The support copy says "the team" and names nobody,
//      which is correct either way. Still open: whether Fatimah wants a named
//      owner or a stated response time on this page. Adding a response time is a
//      commitment to a buyer, so it is hers to make, not something to infer from
//      how fast replies happen to go out today.
//
// No FAQ schema on purpose. Google restricted FAQ rich results to government and
// health sites, so FAQPage markup on this page would render nothing in the
// results and only add a surface to get wrong. The questions are still real
// headings in the HTML, which is what the ranking actually comes from.
// ----------------------------------------------------------------------------

const title = 'Is Admitfolio legit?';
const description =
  'How Admitfolio verifies the students who sell here, what you get when you buy, how refunds and delivery problems are handled, and what these essays are for.';

export const metadata: Metadata = {
  title: `${title} How verification, delivery and refunds work | Admitfolio`,
  description,
  alternates: { canonical: legitUrl() },
  openGraph: { title, description, url: legitUrl(), siteName: 'Admitfolio', type: 'website' },
};

export default function LegitPage() {
  // Organization, not FAQPage. This is the one piece of structured data the
  // site has no version of anywhere, and it is what lets Google attach a name,
  // a description and a support address to the brand rather than assembling
  // them from whatever page it happened to crawl.
  //
  // No `logo`: there is no logo file in public/, and a logo URL that 404s is
  // worse than no logo property at all.
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Admitfolio',
    url: SITE_URL,
    description:
      'A marketplace where verified college students sell the admissions essays that got them in, for applicants to read as examples.',
    email: CONTACT_EMAIL,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: CONTACT_EMAIL,
      availableLanguage: 'English',
    },
  };

  return (
    <div className={guide.page}>
      <GuideHeader />
      <main className={guide.articleMain}>
        <article className={guide.articleShell}>
          <Link className={guide.backLink} href="/">← Back to Admitfolio</Link>

          <header className={guide.articleHeader}>
            <span className="pill"><span className="dot" />Trust and safety</span>
            <h1>Is Admitfolio legit?</h1>
            <p className={guide.dek}>
              Yes. Here is how the essays get here, what arrives when you buy one, and what happens if
              something goes wrong.
            </p>
          </header>

          <div className={guide.articleStat}>
            <strong>The short answer:</strong> a real student with a confirmed college email wrote every essay
            on this site, a person approved each listing by hand, and your copy arrives by email within a
            minute and stays readable for a year.
          </div>

          <div className={guide.articleBody}>
            <h2 id="verification">How a seller gets verified</h2>
            <p>
              Nobody can list an essay here by signing up and uploading a file. Four things happen first.
            </p>

            {/* The wording in steps 1, 2 and 3 is the checkout proof panel's own,
                from components/ListingCheckout.tsx. Those claims were already
                checked against the database once, and a buyer who reads this page
                and then reaches the payment screen should meet the same sentences
                rather than two descriptions of the same process. */}
            <ol className={styles.steps}>
              <li>
                <div>
                  <strong>The seller proved a college email</strong>
                  <span>
                    Accounts are made with a .edu address and confirmed by a code sent to it. An address that
                    never receives its code never becomes an account.
                  </span>
                </div>
              </li>
              <li>
                <div>
                  <strong>They sent the acceptance letter</strong>
                  <span>
                    A seller who claims an admission uploads the acceptance letter for that school, and it is
                    read before the listing can be approved.
                  </span>
                </div>
              </li>
              <li>
                <div>
                  <strong>A review panel read the essays</strong>
                  <span>
                    Every submission is screened before anyone sees it. Anything the panel is unsure about is
                    held back rather than published.
                  </span>
                </div>
              </li>
              <li>
                <div>
                  <strong>A person made the final call</strong>
                  <span>
                    No listing goes live on an automated decision alone. Someone reads the screening, looks at
                    the listing, and approves or rejects it by hand.
                  </span>
                </div>
              </li>
            </ol>

            <h2 id="what-you-get">What you get when you buy</h2>
            <p>
              You are buying a listing, which is one student&apos;s package: either a single essay or the full
              set they sent to a school. The listing page tells you how many essays are in it and which prompt
              each one answers before you pay anything.
            </p>
            <ul>
              <li>
                <strong>A reading link by email.</strong> It arrives in under a minute. If it is not there,
                check spam before you write to us.
              </li>
              <li>
                <strong>A year of access.</strong> The link keeps working for twelve months from the day you
                buy. Read the essays as often as you want in that time.
              </li>
              <li>
                <strong>Your own copy of every page.</strong> Each essay is stamped for you at the moment you
                open it, so what you read is a copy that exists only for your purchase.
              </li>
            </ul>
            <p>
              You do not need an account to buy. The reading link is the key, so keep the receipt email
              somewhere you can find it.
            </p>

            <h2 id="support">If something goes wrong</h2>
            <p>
              Write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Refunds and any problem with
              delivery go to that address, a person on the team reads it, and that is the fastest route for
              both.
            </p>
            <p>
              If you have lost your reading link, say so and include the email address you bought with. A lost
              link can be resent, case by case, depending on the circumstances.
            </p>

            <h2 id="what-these-are-for">What these essays are for</h2>
            <p>
              They are reading material. Most applicants have never read a real admissions essay that worked,
              only advice about them. Reading one settles questions that advice does not, like how much of the
              essay is reflection rather than story.
            </p>
            <p>
              The writer chose to build the essay around a small repeated moment rather than the biggest thing
              that ever happened to them. That choice is yours to borrow, though their moment is not. Our{' '}
              <Link href={`${GUIDES_PATH}/how-to-take-inspiration-from-college-essays`}>
                guide to taking inspiration without copying
              </Link>{' '}
              is the longer version of that idea, with a method attached.
            </p>
            <p>
              Every seller here published their own work knowing another applicant would read it. That is what
              they agreed to, and it is all the site is for.
            </p>

            <h2 id="copying">What happens if someone copies one</h2>
            <p>
              Two things are worth knowing before you decide what to do with what you buy.
            </p>
            <div className={guide.callout}>
              <strong>The file knows whose it is</strong>
              Every copy carries a code tied to the purchase that produced it. A file that turns up somewhere
              it should not be can be traced back to the person who bought it.
            </div>
            <p>
              That code is on every page, in the footer and across the middle of the sheet. It survives a
              screenshot, a re-export and a photograph of a screen. It does not stop a copy being made, it
              identifies one after the fact.
            </p>
            <p>
              The second thing is about admissions rather than about us. Colleges do compare submitted essays,
              and they do rescind offers over plagiarism. That can happen after an offer is made, after a
              student has enrolled, and in some cases years later, because a degree can be revoked long after
              the application that earned it.
            </p>
            <p>
              If a copy bought here is passed around or submitted as someone&apos;s own, there are
              consequences, and we act on it.{' '}
              {/* ONE SENTENCE. Ritvik's wording, and it stays this size. No company is named, no
                  date is given, and the conditional ("would mean") is what keeps it a statement
                  about work in progress rather than a claim about something that exists today.
                  scripts/verify-legit-page.mjs asserts this sentence is present and that no
                  detection service is named anywhere on the page, so neither half can drift. */}
              We are working on integrations with plagiarism detection services, which would mean essays
              bought here can be checked against submitted work.
            </p>

            <h2 id="faq">Questions people ask before they buy</h2>
          </div>

          <div className={styles.faq}>
            <h3>Is Admitfolio legit?</h3>
            <p>
              It is a working marketplace, and the students behind the listings are who they say they are.
              Selling here means
              confirming a .edu address with a code, sending the acceptance letter for the school you claim,
              and having your essays read and then approved by a person. Nothing is published on an automated
              decision. Payment runs through Stripe&apos;s own checkout, so your card details go to Stripe and
              never touch this site.
            </p>

            <h3>Is Admitfolio free?</h3>
            <p>
              Browsing is free and needs no account. You can see every listing, the school it was written for,
              the prompt each essay answers, how many essays are in the package, the price, and the real
              opening line of the writing itself. The essays themselves are paid, because a student wrote each
              one and is paid when it sells. The{' '}
              <Link href={GUIDES_PATH}>guides</Link> are free.
            </p>

            <h3>Is buying a college essay cheating?</h3>
            <p>
              Reading one is not. Submitting one is. The line is the same as it is for any other example you
              might read while you write: you can study how a piece of writing works, and you cannot hand it in
              as yours. Everything on this site is sold to be read, and an essay you submit has to be about
              your own life and written in your own words.
            </p>

            <h3>What happens after I pay?</h3>
            <p>
              A receipt and a reading link arrive by email in under a minute. The link opens the essays in your
              browser and keeps working for a year. Each page is stamped with a code tied to your purchase. You
              do not need to make an account, so keep that email. If it has not arrived, check spam first, then
              write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </div>

          <aside className={guide.articleCta}>
            <h2>See what is actually on sale</h2>
            <p>
              Every listing shows its school, its prompts and its real opening line before you pay. Read a few
              and judge for yourself.
            </p>
            <Link className="btn-primary" href={COLLECTIONS_PATH}>Browse the essay collections →</Link>
          </aside>
        </article>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
      </main>
      <GuideFooter />
    </div>
  );
}
