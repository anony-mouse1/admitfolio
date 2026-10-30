import 'server-only';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { PUBLIC_CATALOG_TAG } from '@/lib/publicCatalogCache';
import { isAdminEmail, TEST_EMAILS } from '@/lib/config';
import { isAdminApprovedListing, verifiedAdmissionTags } from '@/lib/admitProof';
import { publicDisplayName, normalizeAnonymity } from '@/lib/anonymity';
import { catalogSchool, listingHeadline } from '@/lib/listingSchool';
import { marketplaceIsLaunched } from '@/lib/launch';
import type { Anonymity } from '@/lib/anonymity';

// The public catalog of approved listings, and the only place it is assembled.
//
// This was the body of app/api/listings/route.ts. It moved here so the
// server-rendered collection pages under app/essays can show the same listings
// the API serves without going through the browser, which is what lets a
// crawler see essay content instead of "Loading essays...". The route is now a
// thin JSON wrapper over this function and its response is unchanged.
//
// Seller identity is gated by each listing's anonymity choice HERE,
// server-side. The name never reaches a caller unless the seller opted into
// showing it publicly. Sellers who chose "anonymous until bought" are unnamed;
// their first name appears only on the purchase reading page. Test/demo
// submissions (admin or TEST_EMAILS sellers) are excluded entirely.

export type PublicCatalogEssay = {
  prompt: string;
  question: string | null;
  wordCount: number | null;
};

export type PublicCatalogListing = {
  id: string;
  school: string;
  targetSchool: string | null;
  headlineSchool: string;
  applicationSystem: string | null;
  admitTags: string[];
  verifiedAdmitTags: string[];
  price: number | null;
  teaser: string | null;
  openingLine: string | null;
  appliedMajors: string | null;
  major: string | null;
  createdAt: string;
  essays: PublicCatalogEssay[];
  seller: {
    displayName: string;
    backgroundTags: string[];
    anonymity: Anonymity;
  };
  otherListingIds: string[];
};

function parseTags(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function hookKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Every approved, purchasable listing, in the exact shape the public API has
 * always returned. `null` means the marketplace is not open: the launch gate
 * lives here, immediately before the query, so it cannot be forgotten by a new
 * caller. Callers decide what a closed marketplace looks like (the API answers
 * 503, the collection pages answer 404).
 */
export async function publicCatalogListings(): Promise<PublicCatalogListing[] | null> {
  if (!marketplaceIsLaunched()) return null;

  // A fingerprint failure must never take the catalogue down with it: read it
  // uncached, exactly as before the cache existed.
  let fingerprint: string;
  try {
    fingerprint = await catalogFingerprint();
  } catch (error) {
    console.error('public catalog fingerprint failed, reading uncached:', error instanceof Error ? error.message : error);
    return loadPublicCatalog();
  }
  return cachedPublicCatalog(fingerprint);
}

// The catalogue was read on every homepage load and every collection page view,
// about 535 times a day at roughly 640 KB each, which is what used up the
// Supabase egress quota in October 2026. It is now cached in Next's data cache,
// shared by every caller and every instance, and read from the database only
// when something it shows has changed.
//
// Three things decide when the cache is fresh:
//
// - The fingerprint below is part of the cache key. It changes whenever any row
//   the catalogue is built from is inserted, updated or deleted, whoever wrote
//   it: the app, a maintenance script, the Supabase SQL editor, or a localhost
//   or preview server, all of which share the production database but not
//   production's cache. So a change shows on the very next request.
// - In-app writes also expire the PUBLIC_CATALOG_TAG through
//   revalidatePublicCatalog, which is what refreshes the /essays page as well.
// - An hour is the backstop. The deployment key means a deploy, which is the
//   only way code or environment changes reach production, never reads an
//   entry an older build wrote. The cache persists across deployments.
const DEPLOYMENT_KEY = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || 'local';

const cachedPublicCatalog = unstable_cache(
  // The fingerprint is unused inside: as an argument it is part of the key.
  async (fingerprint: string) => {
    void fingerprint;
    return loadPublicCatalog();
  },
  ['public-catalog', DEPLOYMENT_KEY],
  { tags: [PUBLIC_CATALOG_TAG], revalidate: 3600 },
);

// One short value that changes whenever a catalogue input changes. Every
// Postgres row version carries the id of the transaction that wrote it
// (xmin), so an update anywhere in these rows, a new approval entering the
// set, and a takedown or deletion leaving it all change the hash. The row sets
// mirror the findMany below: approved, priced listings, their essays, and
// their sellers. ORDER BY inside string_agg keeps it stable from one query plan
// to the next; without it the key would change at random and the cache would
// never hit. About 100 bytes over the wire instead of the catalogue's 175 KB.
async function catalogFingerprint(): Promise<string> {
  const rows = await prisma.$queryRaw<{ fingerprint: string }[]>`
    SELECT coalesce(md5(string_agg(k, ',' ORDER BY k)), 'empty') AS fingerprint FROM (
      SELECT 'l:' || l.id || ':' || l.xmin::text AS k
        FROM "Listing" l
        WHERE l.status = 'approved' AND l."packagePrice" IS NOT NULL
      UNION ALL
      SELECT 'e:' || e.id || ':' || e.xmin::text
        FROM "Essay" e
        JOIN "Listing" l ON l.id = e."listingId"
        WHERE l.status = 'approved' AND l."packagePrice" IS NOT NULL
      UNION ALL
      SELECT 's:' || s.id || ':' || s.xmin::text
        FROM "Seller" s
        WHERE s.id IN (
          SELECT "sellerId" FROM "Listing" WHERE status = 'approved' AND "packagePrice" IS NOT NULL
        )
    ) catalogue_rows`;
  return rows[0]?.fingerprint ?? 'empty';
}

// The uncached read: the query and the shaping. Only the cache above and the
// fingerprint fallback call it.
async function loadPublicCatalog(): Promise<PublicCatalogListing[]> {
  const rows = await prisma.listing.findMany({
    // Only whole-set priced listings are purchasable; price-less legacy rows
    // would render as unbuyable cards.
    where: { status: 'approved', packagePrice: { not: null } },
    orderBy: { reviewedAt: 'desc' },
    // Was 60, which silently hid every listing beyond the 60 most recently
    // reviewed. That was invisible until approvals crossed 60 on 2026-08-03;
    // by 2026-08-11 it was hiding 84 of 144 approved listings from buyers, and
    // each new approval evicted the oldest visible one. The whole catalogue is
    // 18.2 KB gzipped, so it is cheaper to send it all and page on the client
    // than to build cursor pagination for this size.
    take: 200,
    // Exactly the columns the catalogue returns or decides with. `include`
    // pulled every Listing column, and the review panel's aiLenses and
    // aiReasons alone were two thirds of each read without ever reaching a
    // card. status, humanReviewedAt and aiDecision are read only by
    // isAdminApprovedListing, for the verified ticks.
    select: {
      id: true,
      sellerId: true,
      school: true,
      targetSchool: true,
      applicationSystem: true,
      admitTags: true,
      anonymity: true,
      packagePrice: true,
      teaser: true,
      openingLine: true,
      appliedMajors: true,
      major: true,
      createdAt: true,
      status: true,
      humanReviewedAt: true,
      aiDecision: true,
      seller: {
        select: {
          email: true,
          name: true,
          backgroundTags: true,
        },
      },
      essays: { orderBy: { sortOrder: 'asc' }, select: { prompt: true, question: true, wordCount: true } },
    },
  });

  const usedHooksBySeller = new Map<string, Set<string>>();
  const adminApprovedSellerIds = new Set(
    rows.filter(isAdminApprovedListing).map((listing) => listing.sellerId),
  );
  const catalogRows = rows
    .filter((l) => !isAdminEmail(l.seller.email) && !TEST_EMAILS.has(l.seller.email.toLowerCase()))
    .flatMap((l) => {
      const admitTags = parseTags(l.admitTags);
      const targetSchool = catalogSchool({ school: l.school, targetSchool: l.targetSchool, admitTags });
      const headlineSchool = listingHeadline({
        school: l.school,
        targetSchool: l.targetSchool,
        admitTags,
        applicationSystem: l.applicationSystem,
        essays: l.essays,
      });
      if (!usedHooksBySeller.has(l.sellerId)) usedHooksBySeller.set(l.sellerId, new Set());
      const usedHooks = usedHooksBySeller.get(l.sellerId) as Set<string>;
      let teaser = l.teaser;
      let openingLine = l.openingLine;
      // The actual essay excerpt is the card title. De-duplicate that first.
      // A seller teaser is only the fallback when extraction was impossible.
      if (openingLine) {
        const key = hookKey(openingLine);
        if (usedHooks.has(key)) openingLine = null;
        else usedHooks.add(key);
      }
      if (!openingLine && teaser) {
        const key = hookKey(teaser);
        if (usedHooks.has(key)) teaser = null;
        else usedHooks.add(key);
      }
      const anonymity = normalizeAnonymity(l.anonymity);
      return [{
        // Kept only while this response is assembled. Neither value is returned
        // publicly; they let us build safe related-listing edges without exposing
        // a seller id or linking a named listing to one that should stay anonymous.
        _sellerId: l.sellerId,
        _anonymity: anonymity,
        id: l.id,
        school: l.school,
        targetSchool,
        headlineSchool,
        applicationSystem: l.applicationSystem,
        admitTags,
        // Admin approval is the admission check. This intentionally covers
        // legacy sellers who were approved before acceptance-letter uploads
        // existed and therefore have no AdmitProof row.
        verifiedAdmitTags: verifiedAdmissionTags(
          adminApprovedSellerIds.has(l.sellerId),
          admitTags,
          [],
        ),
        price: l.packagePrice,
        teaser,
        // The title excerpt comes from one of this listing's own PDFs. The
        // seller teaser remains secondary copy in the opened detail view.
        openingLine,
        // Applied majors are listing-specific. The current major is a safe
        // fallback only when the seller already chose to show their name.
        appliedMajors: l.appliedMajors,
        major: anonymity === 'full' ? l.major : null,
        // JSON.stringify already turns a Date into this exact string, so the
        // API response is byte for byte what it was before the extraction.
        createdAt: l.createdAt.toISOString(),
        essays: l.essays.map((e) => ({ prompt: e.prompt, question: e.question, wordCount: e.wordCount })),
        seller: {
          displayName: publicDisplayName(l.anonymity, l.seller.name),
          backgroundTags: parseTags(l.seller.backgroundTags),
          // The anonymity POLICY, not the name. Safe to publish because it says
          // what will happen, never who the seller is, and the listing detail
          // needs it to describe the seller honestly: "anonymous" means never
          // named even after buying, which is a different promise from
          // "revealOnPurchase". Hardcoding one sentence for both would have the
          // site promise a reveal that lib/anonymity.ts guarantees never happens.
          anonymity,
        },
      }];
    });

  const siblingIdsBySellerPolicy = new Map<string, string[]>();
  for (const listing of catalogRows) {
    const key = `${listing._sellerId}:${listing._anonymity}`;
    const ids = siblingIdsBySellerPolicy.get(key) || [];
    ids.push(listing.id);
    siblingIdsBySellerPolicy.set(key, ids);
  }

  return catalogRows.map(({ _sellerId, _anonymity, ...listing }) => ({
    ...listing,
    // Deliberately publish only the eligible listing ids, never sellerId or a
    // reusable seller key. Exact anonymity-policy matching prevents a public
    // name on one listing from deanonymizing a sibling listing.
    otherListingIds: (siblingIdsBySellerPolicy.get(`${_sellerId}:${_anonymity}`) || [])
      .filter((id) => id !== listing.id),
  }));
}
