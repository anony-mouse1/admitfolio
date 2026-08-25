import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/adminAuth';
import { getSellerDashboardView } from '@/lib/sellerDashboardView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ sellerId: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { sellerId } = await params;

  const view = await getSellerDashboardView(sellerId);
  if (!view) return NextResponse.json({ error: 'Seller not found' }, { status: 404 });

  console.info(JSON.stringify({
    event: 'admin_seller_dashboard_previewed',
    adminEmail: admin.email,
    sellerId,
    previewedAt: new Date().toISOString(),
  }));

  return NextResponse.json(view);
}
