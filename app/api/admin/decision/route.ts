import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentAdmin } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!currentAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { id?: string; decision?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
  const id = String(body?.id || '');
  const decision = String(body?.decision || '');
  if (!id) return NextResponse.json({ error: 'Listing id required.' }, { status: 400 });
  if (!['approved', 'rejected'].includes(decision)) {
    return NextResponse.json({ error: 'decision must be approved or rejected.' }, { status: 400 });
  }

  try {
    const listing = await prisma.listing.update({
      where: { id },
      data: {
        status: decision,
        adminNote: body?.note ? String(body.note) : null,
        reviewedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true, status: listing.status });
  } catch {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
  }
}
