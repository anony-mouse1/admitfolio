import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import CollectionListingCard from '@/components/CollectionListingCard';
import { GuideFooter, GuideHeader } from '@/components/GuideShell';
import {
  COLLECTIONS_PATH,
  collectionBySlug,
  collectionUrl,
  collections,
  listingsInCollection,
} from '@/lib/collections';
import { guideBySlug, guidePath } from '@/lib/guides';
import { publicCatalogListings } from '@/lib/publicCatalog';
import styles from '../essays.module.css';

// Server-rendered on demand. The listing cards are in the served HTML, which is
// the entire reason these pages exist: the homepage is one client component and
// a crawler that does not run JavaScript sees "Loading essays..." there.
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ collection: string }> };

export async function generateStaticParams() {
  return collections.map((collection) => ({ collection: collection.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { collection: slug } = await params;
  const collection = collectionBySlug(slug);
  if (!collection) return {};
  const url = collectionUrl(collection.slug);
  return {
    title: collection.title,
    description: collection.description,
    alternates: { canonical: url },
    openGraph: { title: collection.title, description: collection.description, url, type: 'website' },
  };
}

export default async function CollectionPage({ params }: Params) {
  const { collection: slug } = await params;
  const collection = collectionBySlug(slug);
  if (!collection) notFound();

  // publicCatalogListings returns null when the marketplace is closed, which it
  // reads at runtime from lib/launch.ts rather than from a build-time constant.
  // A collection page with nothing to show is not a page, so it 404s rather
  // than publishing an empty list a crawler would index.
  const catalog = await publicCatalogListings();
  if (!catalog) notFound();
  const listings = listingsInCollection(catalog, collection.rule);
  if (!listings.length) notFound();

  const essayCount = listings.reduce((total, listing) => total + listing.essays.length, 0);
  // `as const satisfies` keeps each registry entry at its literal shape, so the
  // collections with no paired guide have no `guide` key rather than undefined.
  const guideSlug = 'guide' in collection ? collection.guide : undefined;
  const guide = guideSlug ? guideBySlug(guideSlug) : null;

  return (
    <div className={styles.page}>
      <GuideHeader />
      <main className={styles.main}>
        <Link className={styles.backLink} href={COLLECTIONS_PATH}>← All essay collections</Link>
        <header className={styles.header}>
          <span className={styles.count}>
            {listings.length} listing{listings.length === 1 ? '' : 's'} · {essayCount} essay{essayCount === 1 ? '' : 's'}
          </span>
          <h1>{collection.name}</h1>
          <p className={styles.dek}>{collection.dek}</p>
        </header>
        <div className={styles.intro}>
          {collection.intro.map((paragraph) => <p key={paragraph.slice(0, 40)}>{paragraph}</p>)}
        </div>
        {guide && (
          <p className={styles.guideNote}>
            Want the method before the examples? Read{' '}
            <Link href={guidePath(guide.slug)}>{guide.title}</Link>.
          </p>
        )}
        <hr className={styles.sectionRule} />
        {/* Every listing, no pagination: a crawler should not have to follow a
            "load more" control to reach the rest of the collection. */}
        <div className="grid public-grid">
          {listings.map((listing) => <CollectionListingCard key={listing.id} listing={listing} />)}
        </div>
      </main>
      <GuideFooter />
    </div>
  );
}
