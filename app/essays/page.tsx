import type { Metadata } from 'next';
import Link from 'next/link';
import { GuideFooter, GuideHeader } from '@/components/GuideShell';
import { COLLECTIONS_PATH, collectionPath, collections, listingsInCollection } from '@/lib/collections';
import { publicCatalogListings } from '@/lib/publicCatalog';
import { SITE_URL } from '@/lib/site';
import { absoluteUrl, itemListSchema } from '@/lib/structuredData';
import styles from './essays.module.css';

// Server-rendered, so the hub and its counts are in the document a crawler
// reads.
//
// This was force-dynamic, copied from /api/listings, where it is right: that
// route is the live JSON the homepage fetches. It was never right here. These
// pages held the site's only uncached public HTML, serving
// `private, no-cache, no-store` on every request against a catalogue that
// changes a few times a day, while every guide and the homepage came off the
// CDN.
//
// Nothing on this page is per request. No cookies, no headers, no query: it
// reads the catalogue and counts it. So it prerenders and revalidates on a
// window.
//
// 300s. The only thing that goes stale here is a count, and the page carries no
// price and no buy control, so a stale one is the cheapest wrong number on the
// site. Five minutes is short enough that an admin who approves a listing and
// then looks sees it, and long enough that a crawl sweep or a burst of buyers
// is served from one render rather than one query each. The six collection
// pages cannot use this. See the note in [collection]/page.tsx.
export const revalidate = 300;

const url = `${SITE_URL}${COLLECTIONS_PATH}`;
const title = 'College Essay Collections From Admitted Students | Admitfolio';
const description =
  'Browse real admissions essays by prompt and by subject. UC Personal Insight Questions, Common App personal statements, and essays from admitted engineering, business, biology and computer science applicants.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  openGraph: { title, description, url, type: 'website' },
};

export default async function EssayCollectionsPage() {
  const listings = (await publicCatalogListings()) || [];

  // What this page is a list of. The hub renders six collection cards and no
  // listings, so its ItemList is the six collections, named and linked exactly
  // as the cards below name and link them. `collections` is the registry the
  // grid maps over, in the same order, so the two cannot disagree.
  //
  // The per-collection listing counts are deliberately not in here. They are
  // rendered, but a count is not a property of a ListItem, and inventing a
  // place to put it would be markup describing nothing on the page.
  const itemList = itemListSchema(
    'College essay collections',
    collections.map((collection) => ({
      name: collection.name,
      url: absoluteUrl(collectionPath(collection.slug)),
    })),
  );

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />
      <GuideHeader />
      <main className={styles.main}>
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <Link href="/">Admitfolio</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Essay collections</span>
        </nav>
        <header className={styles.header}>
          <span className={styles.count}>{listings.length} listings for sale</span>
          <h1>College essay collections</h1>
          <p className={styles.dek}>
            Real admissions essays, grouped by the prompt in front of you and by the subject you are applying into.
          </p>
        </header>
        <div className={styles.intro}>
          <p>
            Every essay here was written by a student who was admitted, and is sold by that student. These
            collections group the catalogue the way applicants actually search it, by the prompt you are staring at
            and by the field you want to study.
          </p>
          <p>
            Two of them follow the application itself. The UC Personal Insight Questions and the Common App personal
            statement carry more weight than anything else you write as a first-year applicant, so each has a page of
            its own. The four subject collections gather essays by what the writer applied to study, which lets you
            see how somebody made a case for your field before you make yours.
          </p>
          <p>
            Read a few in each. The useful part is rarely the story. It is what the writer chose to leave out.
          </p>
        </div>
        <hr className={styles.sectionRule} />
        <div className={styles.hubGrid}>
          {collections.map((collection) => {
            const count = listingsInCollection(listings, collection.rule).length;
            return (
              <a key={collection.slug} className={styles.hubCard} href={collectionPath(collection.slug)}>
                <div className={styles.hubCardCount}>
                  {count} listing{count === 1 ? '' : 's'}
                </div>
                <div className={styles.hubCardTitle}>{collection.name}</div>
                <p className={styles.hubCardDek}>{collection.dek}</p>
              </a>
            );
          })}
        </div>
      </main>
      <GuideFooter />
    </div>
  );
}
