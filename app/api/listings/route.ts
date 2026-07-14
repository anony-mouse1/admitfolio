import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminEmail, TEST_EMAILS } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public catalog of approved listings. Seller identity is gated by each
// listing's anonymity choice HERE, server-side - the full name never reaches
// the client unless the seller opted into showing it. Test/demo submissions
// (admin or TEST_EMAILS sellers) are excluded entirely.

function displayName(anonymity: string, name: string | null): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'Verified admit';
  if (anonymity === 'full') return trimmed;
  if (anonymity === 'firstName') return trimmed.split(/\s+/)[0];
  return 'Verified admit';
}

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
      seller: { select: { email: true, name: true, backgroundTags: true } },
      essays: { orderBy: { sortOrder: 'asc' }, select: { prompt: true, question: true, wordCount: true } },
    },
  });

  const listings = rows
    .filter((l) => !isAdminEmail(l.seller.email) && !TEST_EMAILS.has(l.seller.email.toLowerCase()))
    .map((l) => ({
      id: l.id,
      school: l.school,
      admitTags: parseTags(l.admitTags),
      price: l.packagePrice,
      teaser: l.teaser,
      createdAt: l.createdAt,
      essays: l.essays.map((e) => ({ prompt: e.prompt, question: e.question, wordCount: e.wordCount })),
      seller: {
        displayName: displayName(l.anonymity, l.seller.name),
        backgroundTags: parseTags(l.seller.backgroundTags),
      },
    }));

  return NextResponse.json({ ok: true, listings });
}
