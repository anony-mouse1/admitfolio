import { NextResponse } from 'next/server';
import { publicCatalogListings } from '@/lib/publicCatalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public catalog of approved listings. Everything this route used to do lives
// in lib/publicCatalog.ts now, including the launch gate, so the collection
// pages under app/essays serve the same listings from the same query. This
// route is the JSON view of it and its response is unchanged.

export async function GET() {
  const listings = await publicCatalogListings();
  if (!listings) {
    return NextResponse.json(
      { error: 'The marketplace is not open yet.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
  return NextResponse.json({ ok: true, listings });
}
