import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/adminAuth';
import { getSellerDirectory } from '@/lib/sellerDashboardView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!currentAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ sellers: await getSellerDirectory() });
}
