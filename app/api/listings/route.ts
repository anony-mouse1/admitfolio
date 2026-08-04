import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminEmail, TEST_EMAILS } from '@/lib/config';
import { schoolKey } from '@/lib/admitProof';
import { publicDisplayName } from '@/lib/anonymity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public catalog of approved listings. Seller identity is gated by each
// listing's anonymity choice HERE, server-side - the name never reaches the
// client unless the seller opted into showing it publicly. Sellers who chose
// "anonymous until bought" are unnamed here; their first name appears only on
// the purchase reading page. Test/demo submissions (admin or TEST_EMAILS
// sellers) are excluded entirely.

function parseTags(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const rows = await prisma.listing.findMany({
    // Only whole-set priced listings are purchasable; price-less legacy rows
    // would render as unbuyable cards.
    where: { status: 'approved', packagePrice: { not: null } },
    orderBy: { reviewedAt: 'desc' },
    take: 60,
    include: {
      seller: {
        select: {
          email: true,
          name: true,
          backgroundTags: true,
          // Only verified letters leave the server. A pending or rejected proof
          // is indistinguishable from no proof at all as far as buyers go.
          admitProofs: { where: { status: 'verified' }, select: { schoolKey: true } },
        },
      },
      essays: { orderBy: { sortOrder: 'asc' }, select: { prompt: true, question: true, wordCount: true } },
    },
  });

  const listings = rows
    .filter((l) => !isAdminEmail(l.seller.email) && !TEST_EMAILS.has(l.seller.email.toLowerCase()))
    .map((l) => {
      const verifiedKeys = new Set(l.seller.admitProofs.map((p) => p.schoolKey));
      const admitTags = parseTags(l.admitTags);
      return {
      id: l.id,
      school: l.school,
      admitTags,
      // The subset of admitTags backed by an acceptance letter a human checked.
      // Sent as its own list rather than filtering admitTags, so the UI can show
      // an unproven claim honestly instead of silently deleting it - every
      // listing submitted before this feature has zero verified admits, and
      // dropping their claims outright would gut the catalogue.
      verifiedAdmitTags: admitTags.filter((t) => verifiedKeys.has(schoolKey(t))),
      price: l.packagePrice,
      teaser: l.teaser,
      // Current major stays private: combined with the school it could help
      // deanonymize an anonymous seller, and no public UI shows it yet.
      appliedMajors: l.appliedMajors,
      createdAt: l.createdAt,
      essays: l.essays.map((e) => ({ prompt: e.prompt, question: e.question, wordCount: e.wordCount })),
      seller: {
        displayName: publicDisplayName(l.anonymity, l.seller.name),
        backgroundTags: parseTags(l.seller.backgroundTags),
      },
      };
    });

  return NextResponse.json({ ok: true, listings });
}
