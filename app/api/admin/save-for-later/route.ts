import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentAdmin } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { id, saved: boolean }
//
// Shelves a listing, or takes it back off the shelf. This is a private admin
// bookmark and nothing more: it does not touch `status`, so it never publishes
// or unpublishes anything, and no email goes to the seller. Separate from
// /api/admin/decision for exactly that reason - a decision is a message to a
// student, this is a note to yourself.
export async function POST(req: Request) {
  if (!currentAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { id?: string; saved?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const id = String(body?.id || '');
  if (!id) return NextResponse.json({ error: 'Missing listing id.' }, { status: 400 });

  const listing = await prisma.listing.findUnique({ where: { id }, select: { id: true } });
  if (!listing) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });

  const updated = await prisma.listing.update({
    where: { id: listing.id },
    data: { savedAt: body?.saved === false ? null : new Date() },
    select: { id: true, savedAt: true },
  });

  return NextResponse.json({ ok: true, listing: updated });
}
