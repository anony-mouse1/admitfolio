import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authenticatedSeller } from '@/lib/authenticatedSeller';
import { safeDraftStep, sanitizeSellerDraftState } from '@/lib/sellerDraft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const seller = await authenticatedSeller();
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const draft = await prisma.sellerApplicationDraft.findFirst({
    where: { id: params.id, sellerId: seller.id },
    include: {
      assets: {
        where: { status: 'ready' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, kind: true, clientKey: true, fileName: true, mimeType: true, sizeBytes: true },
      },
    },
  });
  if (!draft) return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
  return NextResponse.json({ ok: true, draft });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const seller = await authenticatedSeller();
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { revision?: unknown; state?: unknown; step?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
  const revision = Math.round(Number(body.revision));
  if (!Number.isFinite(revision) || revision < 1) {
    return NextResponse.json({ error: 'A valid draft revision is required.' }, { status: 400 });
  }

  const updated = await prisma.sellerApplicationDraft.updateMany({
    where: { id: params.id, sellerId: seller.id, status: 'draft', revision },
    data: {
      state: sanitizeSellerDraftState(body.state) as unknown as Prisma.InputJsonValue,
      step: safeDraftStep(body.step),
      revision: { increment: 1 },
    },
  });
  if (updated.count === 0) {
    const current = await prisma.sellerApplicationDraft.findFirst({
      where: { id: params.id, sellerId: seller.id },
      select: { revision: true, updatedAt: true, status: true },
    });
    if (!current) return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
    return NextResponse.json(
      { error: 'This draft changed in another session. Reload the latest version.', code: 'DRAFT_CONFLICT', current },
      { status: 409 },
    );
  }

  const draft = await prisma.sellerApplicationDraft.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, step: true, state: true, revision: true, updatedAt: true },
  });
  return NextResponse.json({ ok: true, draft });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const seller = await authenticatedSeller();
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const updated = await prisma.sellerApplicationDraft.updateMany({
    where: { id: params.id, sellerId: seller.id, status: 'draft' },
    data: { status: 'abandoned' },
  });
  if (updated.count === 0) return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
