import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminEmail, TEST_EMAILS } from '@/lib/config';
import { schoolKey } from '@/lib/admitProof';
import { publicDisplayName, normalizeAnonymity } from '@/lib/anonymity';

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
    // Was 60, which silently hid every listing beyond the 60 most recently
    // reviewed. That was invisible until approvals crossed 60 on 2026-08-03;
    // by 2026-08-11 it was hiding 84 of 144 approved listings from buyers, and
    // each new approval evicted the oldest visible one. The whole catalogue is
    // 18.2 KB gzipped, so it is cheaper to send it all and page on the client
    // than to build cursor pagination for this size.
    take: 200,
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
      // Shown only when the seller wrote no teaser of their own. Their line
      // wins when they took the trouble to write one.
      openingLine: l.openingLine,
      // Current major stays private: combined with the school it could help
      // deanonymize an anonymous seller, and no public UI shows it yet.
      appliedMajors: l.appliedMajors,
      createdAt: l.createdAt,
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
        anonymity: normalizeAnonymity(l.anonymity),
      },
      };
    });

  return NextResponse.json({ ok: true, listings });
}
