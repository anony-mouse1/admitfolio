import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticatedSeller } from '@/lib/authenticatedSeller';
import { parseAdmitTags } from '@/lib/listingSchool';
import { matchesSellerApplication } from '@/lib/sellerApplications';

export const runtime = 'nodejs';

export async function PATCH(req: Request) {
  const seller = await authenticatedSeller();
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { school?: string; classYear?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
  const school = String(body.school || '').trim().slice(0, 120);
  const classYear = String(body.classYear || '').trim().slice(0, 12);
  if (!school) return NextResponse.json({ error: 'Application school is required.' }, { status: 400 });
  if (classYear && !/^20\d{2}$/.test(classYear)) {
    return NextResponse.json({ error: 'Class year must be a four-digit year.' }, { status: 400 });
  }

  const listings = await prisma.listing.findMany({
    where: { sellerId: seller.id },
    select: { id: true, school: true, targetSchool: true, admitTags: true },
  });
  const listingIds = listings.filter((listing) => {
    return matchesSellerApplication({
      school: listing.school,
      targetSchool: listing.targetSchool,
      admitTags: parseAdmitTags(listing.admitTags),
    }, school);
  }).map((listing) => listing.id);
  if (!listingIds.length) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

  await prisma.listing.updateMany({
    where: { id: { in: listingIds }, sellerId: seller.id },
    data: { gradYear: classYear || null },
  });
  return NextResponse.json({ ok: true, school, classYear: classYear || null, updatedListings: listingIds.length });
}
