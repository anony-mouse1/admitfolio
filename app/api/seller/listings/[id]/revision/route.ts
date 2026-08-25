import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authenticatedSeller } from '@/lib/authenticatedSeller';
import { sanitizeSellerDraftState } from '@/lib/sellerDraft';

export const runtime = 'nodejs';

function parseStrings(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function storedFileName(path: string | null, index: number): string {
  if (!path) return `Previously uploaded essay ${index + 1}.pdf`;
  const part = path.split('/').pop();
  return part && part.toLowerCase().endsWith('.pdf') ? part : `Previously uploaded essay ${index + 1}.pdf`;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const seller = await authenticatedSeller();
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const listing = await prisma.listing.findFirst({
    where: { id, sellerId: seller.id },
    include: { essays: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!listing) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
  if (!['rejected', 'removed'].includes(listing.status)) {
    return NextResponse.json({ error: 'Only a rejected or removed listing can be revised.' }, { status: 409 });
  }

  const existing = await prisma.sellerApplicationDraft.findFirst({
    where: { sellerId: seller.id, sourceListingId: listing.id, status: { in: ['draft', 'finalizing'] } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, revision: true },
  });
  if (existing) return NextResponse.json({ ok: true, draft: existing, resumed: true });

  const state = sanitizeSellerDraftState({
    currentUniversity: listing.school,
    currentMajor: listing.major,
    graduationYear: listing.gradYear,
    targetSchool: listing.targetSchool,
    applicationSystem: listing.applicationSystem,
    admits: parseStrings(listing.admitTags),
    anonymity: listing.anonymity,
    packagePrice: listing.packagePrice,
    teaser: listing.teaser,
    appliedMajors: listing.appliedMajors,
    sellerNote: listing.sellerNote,
    essays: listing.essays.map((essay, index) => ({
      clientKey: `revision-${essay.id}`,
      sourceEssayId: essay.id,
      sourceFileName: storedFileName(essay.pdfPath, index),
      prompt: essay.prompt,
      question: essay.question,
      price: essay.price,
    })),
  });
  const draft = await prisma.sellerApplicationDraft.create({
    data: {
      sellerId: seller.id,
      sourceListingId: listing.id,
      step: 5,
      state: state as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, revision: true },
  });
  return NextResponse.json({ ok: true, draft }, { status: 201 });
}
