import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authenticatedSeller } from '@/lib/authenticatedSeller';
import { safeDraftStep, sanitizeSellerDraftState } from '@/lib/sellerDraft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const seller = await authenticatedSeller();
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const drafts = await prisma.sellerApplicationDraft.findMany({
    where: { sellerId: seller.id, status: { in: ['draft', 'finalizing'] } },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      status: true,
      step: true,
      state: true,
      revision: true,
      createdAt: true,
      updatedAt: true,
      assets: {
        where: { status: 'ready' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, kind: true, clientKey: true, fileName: true, mimeType: true, sizeBytes: true },
      },
    },
  });
  return NextResponse.json({ ok: true, drafts });
}

export async function POST(req: Request) {
  const seller = await authenticatedSeller();
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { state?: unknown; step?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // Creating an empty draft is valid.
  }

  const draft = await prisma.sellerApplicationDraft.create({
    data: {
      sellerId: seller.id,
      state: sanitizeSellerDraftState(body.state) as unknown as Prisma.InputJsonValue,
      step: safeDraftStep(body.step),
    },
    select: { id: true, status: true, step: true, state: true, revision: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ ok: true, draft }, { status: 201 });
}
