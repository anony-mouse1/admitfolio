import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentAdmin } from '@/lib/adminAuth';
import { sameSchool } from '@/lib/schools';
import { parseAdmitTags } from '@/lib/listingSchool';

export const runtime = 'nodejs';

// Confirm the college an older package was written for. This changes only its
// catalogue title; the seller's current university and acceptance claims stay
// separate and untouched.
export async function POST(req: Request) {
  if (!await currentAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { id?: string; targetSchool?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const id = String(body?.id || '');
  const requestedSchool = String(body?.targetSchool || '').replace(/[\r\n]/g, ' ').trim().slice(0, 80);
  if (!id || !requestedSchool) {
    return NextResponse.json({ error: 'Listing and college are required.' }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({
    where: { id },
    select: { targetSchool: true, admitTags: true },
  });
  if (!listing) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
  if (listing.targetSchool) {
    return NextResponse.json({ error: 'This listing already has a confirmed college.' }, { status: 409 });
  }

  const admittedSchools = parseAdmitTags(listing.admitTags);
  const canonicalSchool = admittedSchools.find((school) => sameSchool(school, requestedSchool));
  if (!canonicalSchool) {
    return NextResponse.json(
      { error: 'The listing college must be one of the seller’s accepted schools.' },
      { status: 400 },
    );
  }

  const result = await prisma.listing.updateMany({
    where: { id, targetSchool: null },
    data: { targetSchool: canonicalSchool },
  });
  if (result.count !== 1) {
    return NextResponse.json({ error: 'The listing changed. Refresh and try again.' }, { status: 409 });
  }

  return NextResponse.json({ ok: true, targetSchool: canonicalSchool });
}
