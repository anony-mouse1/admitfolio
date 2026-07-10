import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentAdmin } from '@/lib/adminAuth';
import { isAdminEmail, TEST_EMAILS } from '@/lib/config';
import { supabaseAdmin, ESSAYS_BUCKET } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIGNED_URL_TTL_S = 3600;

export async function GET() {
  if (!currentAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await prisma.listing.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      essays: { orderBy: { sortOrder: 'asc' } },
      seller: { select: { email: true } },
    },
  });

  // One batch call for short-lived signed URLs to every uploaded PDF.
  const paths = rows.flatMap((l) => l.essays.flatMap((e) => (e.pdfPath ? [e.pdfPath] : [])));
  const urlByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await supabaseAdmin.storage
      .from(ESSAYS_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_S);
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
    }
  }

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
    // Submissions from admin/test accounts are dummy data, not real students —
    // the console badges them so they're never mistaken for the real thing.
    isTest: isAdminEmail(l.seller.email) || TEST_EMAILS.has(l.seller.email.toLowerCase()),
    essays: l.essays.map((e) => ({
      id: e.id,
      prompt: e.prompt,
      question: e.question,
      price: e.price,
      wordCount: e.wordCount,
      pdfPath: e.pdfPath,
      pdfUrl: (e.pdfPath && urlByPath.get(e.pdfPath)) || null,
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
