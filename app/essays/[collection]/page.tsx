import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import CollectionBrowser from '@/components/CollectionBrowser';
import CollectionListingCard from '@/components/CollectionListingCard';
import { GuideFooter, GuideHeader } from '@/components/GuideShell';
import {
  COLLECTIONS_PATH,
  collectionBySlug,
  collectionPath,
  collectionUrl,
  collections,
  listingsInCollection,
} from '@/lib/collections';
import { collectionSummary } from '@/lib/collectionSummary';
import { guideBySlug, guidePath } from '@/lib/guides';
import { publicCatalogListings } from '@/lib/publicCatalog';
import styles from '../essays.module.css';

// Server-rendered on demand. The listing cards are in the served HTML, which is
// the entire reason these pages exist: the homepage is one client component and
// a crawler that does not run JavaScript sees "Loading essays..." there.
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ collection: string }>; searchParams: Promise<{ listing?: string; checkout?: string }> };

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
    // Deliberately the bare path. Opening a listing puts ?listing= on this URL,
    // and every one of those variants consolidates onto the collection itself
    // rather than becoming another near-duplicate page in the index.
    alternates: { canonical: url },
    openGraph: { title: collection.title, description: collection.description, url, type: 'website' },
  };
}

export default async function CollectionPage({ params, searchParams }: Params) {
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

  const basePath = collectionPath(collection.slug);
  const query = await searchParams;
  // ?checkout= means the buyer reloaded or came back to a checkout in progress.
  // The listing sheet belongs underneath it either way.
  const requested = query.listing || query.checkout || null;
  const openListing = requested && listings.some((l) => l.id === requested) ? requested : null;
  const openCheckout = query.checkout && listings.some((l) => l.id === query.checkout) ? query.checkout : null;
  // A listing that was taken down keeps its indexed link. Rather than dropping
  // the visitor on a page that silently ignores the request, say what happened
  // and leave them in a collection full of alternatives.
  const missingListing = requested !== null && openListing === null;

  // What the client is allowed to see. Handing `listings` straight to a client
  // component serialises every field into the RSC payload inside the HTML, and
  // otherListingIds is an exact same-seller grouping. lib/anonymity.ts exists to
  // keep that off public surfaces, and an indexable page is the most public
  // surface there is, so the ids are dropped here and the sheet's "more from
  // this seller" block simply has nothing to show on a collection page. The
  // homepage still has it, from the JSON API, where it always was.
  const browsable = listings.map(({ otherListingIds: _siblings, ...listing }) => listing);

  const summary = collectionSummary(listings);
  // `as const satisfies` keeps each registry entry at its literal shape, so the
  // collections with no paired guide have no `guide` key rather than undefined.
  const guideSlug = 'guide' in collection ? collection.guide : undefined;
  const guide = guideSlug ? guideBySlug(guideSlug) : null;
  const others = collections.filter((entry) => entry.slug !== collection.slug);

  return (
    <div className={styles.page}>
      <GuideHeader />
      <main className={styles.main}>
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <Link href="/">Admitfolio</Link>
          <span aria-hidden="true">/</span>
          <Link href={COLLECTIONS_PATH}>Essay collections</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{collection.name}</span>
        </nav>

        {missingListing && (
          <p className={styles.gone} role="status">
            That essay is no longer for sale. The seller took it down, or it sold as part of a package that
            has since changed. Everything below is still available.
          </p>
        )}

        <div className={styles.layout}>
          <div className={styles.headerText}>
            <span className={styles.count}>
              {listings.length} listing{listings.length === 1 ? '' : 's'} · {summary.essays} essay{summary.essays === 1 ? '' : 's'}
            </span>
            <h1>{collection.name}</h1>
            <p className={styles.dek}>{collection.dek}</p>
            <p className={styles.lead}>{collection.lead}</p>
            {guide && (
              <p className={styles.guideNote}>
                Want the method before the examples? Read{' '}
                <Link href={guidePath(guide.slug)}>{guide.title}</Link>.
              </p>
            )}
          </div>

          <hr className={styles.sectionRule} />

          {/* Every listing, no pagination: a crawler should not have to follow a
              "load more" control to reach the rest of the collection. The browser
              wrapper opens one in place instead of navigating to the homepage. */}
          <div className={styles.cards}>
            <CollectionBrowser
              listings={browsable}
              basePath={basePath}
              initialListingId={openListing}
              initialCheckoutId={openCheckout}
            >
              <div className="grid public-grid">
                {listings.map((listing) => (
                  <CollectionListingCard key={listing.id} listing={listing} basePath={basePath} />
                ))}
              </div>
            </CollectionBrowser>
          </div>

          {/* Everything here is aggregated from the listings already on the page.
              School names are counts, never links: per-school routes are a
              separate decision and this must not become one by accident. */}
          <aside className={styles.panel} aria-label="What is in this collection">
            <h2>What is in this collection</h2>
            <dl className={styles.stats}>
              <dt>Listings</dt><dd>{summary.listings}</dd>
              <dt>Essays</dt><dd>{summary.essays}</dd>
              <dt>Multi-essay packages</dt><dd>{summary.packages}</dd>
              {summary.priceLow != null && summary.priceHigh != null && (
                <>
                  <dt>Price range</dt>
                  <dd>{summary.priceLow === summary.priceHigh ? `$${summary.priceLow}` : `$${summary.priceLow} to $${summary.priceHigh}`}</dd>
                </>
              )}
            </dl>
            <h2>Essay types inside</h2>
            <ul className={styles.rows}>
              {summary.prompts.map((row) => (
                <li key={row.label}><span>{row.label}</span><b>{row.count}</b></li>
              ))}
            </ul>
            <h2>Where these writers got in</h2>
            <ul className={styles.rows}>
              {summary.schools.map((row) => (
                <li key={row.label}><span>{row.label}</span><b>{row.count}</b></li>
              ))}
            </ul>
            <Link className={styles.panelMore} href={COLLECTIONS_PATH}>
              Browse the other {others.length} collections →
            </Link>
          </aside>

          <section className={styles.notes} aria-label="How to read these">
            <h2>How to read these</h2>
            {collection.notes.map((paragraph) => <p key={paragraph.slice(0, 40)}>{paragraph}</p>)}
          </section>
        </div>
      </main>
      <GuideFooter />
    </div>
  );
}
