import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentSeller } from '@/lib/sellerAuth';
import { getSellerDashboardView } from '@/lib/sellerDashboardView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The logged-in seller's listings with per-listing and per-essay sales
// aggregates, for the dashboard.

export async function GET() {
  const session = currentSeller();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const seller = await prisma.seller.findUnique({
    where: { email: session.email },
    select: { id: true },
  });
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const view = await getSellerDashboardView(seller.id);
  if (!view) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(view.dashboard);
}
