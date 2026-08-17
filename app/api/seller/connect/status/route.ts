import { NextResponse } from 'next/server';
import { currentSeller } from '@/lib/sellerAuth';
import { prisma } from '@/lib/prisma';
import { sellerPayoutStatus } from '@/lib/sellerPayoutStatus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = currentSeller();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const seller = await prisma.seller.findUnique({
    where: { email: session.email },
    select: { id: true },
  });
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const status = await sellerPayoutStatus(seller.id);
  return NextResponse.json({ ok: true, ...status });
}
