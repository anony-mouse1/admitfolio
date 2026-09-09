import type { Metadata } from 'next';
import Link from 'next/link';
import { GuideFooter, GuideHeader } from '@/components/GuideShell';
import { COLLECTIONS_PATH, collectionPath, collections, listingsInCollection } from '@/lib/collections';
import { publicCatalogListings } from '@/lib/publicCatalog';
import { SITE_URL } from '@/lib/site';
import styles from './essays.module.css';

// Server-rendered, so the hub and its counts are in the document a crawler
// reads. force-dynamic for the same reason /api/listings is: the catalogue
// changes whenever an admin approves a listing, and nothing here is worth
// serving stale.
export const dynamic = 'force-dynamic';

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
  return (
    <div className={styles.page}>
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
