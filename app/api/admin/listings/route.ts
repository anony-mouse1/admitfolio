import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentAdmin } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!currentAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await prisma.listing.findMany({
    orderBy: { createdAt: 'desc' },
    include: { essays: true, seller: { select: { email: true } } },
  });

  // Shape a clean payload for the console (parse admitTags JSON, expose seller email).
  const listings = rows.map((l) => ({
    id: l.id,
    school: l.school,
    gradYear: l.gradYear,
    major: l.major,
    admitTags: safeParse(l.admitTags),
    anonymity: l.anonymity,
    pricingMode: l.pricingMode,
    packagePrice: l.packagePrice,
    status: l.status,
    adminNote: l.adminNote,
    createdAt: l.createdAt,
    reviewedAt: l.reviewedAt,
    sellerEmail: l.seller.email,
    essays: l.essays.map((e) => ({
      id: e.id,
      prompt: e.prompt,
      question: e.question,
      price: e.price,
      wordCount: e.wordCount,
      pdfPath: e.pdfPath,
    })),
  }));

  return NextResponse.json({ listings });
}

function safeParse(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
