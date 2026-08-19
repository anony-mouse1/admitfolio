import 'server-only';
import { prisma } from '@/lib/prisma';
import {
  extractOpeningLineForListing,
  openingKey,
} from '@/scripts/extract-opening-lines.mjs';

export type OpeningLineResult =
  | { status: 'stored'; line: string }
  | { status: 'already_present' | 'seller_teaser' | 'no_candidate' | 'not_found' }
  | { status: 'failed'; error: string };

// Generate the public hook from the submitted PDF once, then persist it. This
// runs when a human approves a listing, so a newly published card cannot drift
// from the approved card design just because a one-time maintenance script was
// forgotten. It is idempotent and never overwrites seller-written teaser copy.
export async function ensureListingOpeningLine(id: string): Promise<OpeningLineResult> {
  const listing = await prisma.listing.findUnique({
    where: { id },
    select: {
      id: true,
      sellerId: true,
      school: true,
      admitTags: true,
      teaser: true,
      openingLine: true,
      seller: { select: { name: true } },
      essays: {
        orderBy: { sortOrder: 'asc' },
        select: { pdfPath: true, prompt: true, question: true },
      },
    },
  });
  if (!listing) return { status: 'not_found' };
  if (listing.teaser?.trim()) return { status: 'seller_teaser' };
  if (listing.openingLine?.trim()) return { status: 'already_present' };

  try {
    const existing = await prisma.listing.findMany({
      where: { sellerId: listing.sellerId, openingLine: { not: null } },
      select: { openingLine: true },
    });
    const used = new Set(
      existing
        .map((row) => row.openingLine)
        .filter((line): line is string => Boolean(line))
        .map(openingKey),
    );
    const extracted = await extractOpeningLineForListing(listing, used);
    if (!extracted.line) return { status: 'no_candidate' };

    const stored = await prisma.listing.updateMany({
      where: {
        id,
        openingLine: null,
        OR: [{ teaser: null }, { teaser: '' }],
      },
      data: { openingLine: extracted.line },
    });
    if (!stored.count) return { status: 'already_present' };
    return { status: 'stored', line: extracted.line };
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'unknown extraction failure',
    };
  }
}
