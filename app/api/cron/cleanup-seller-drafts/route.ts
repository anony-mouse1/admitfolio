import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { CRON_SECRET } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { sellerDraftRetentionCutoff } from '@/lib/sellerDraftRetention';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(header: string): boolean {
  if (!CRON_SECRET) return false;
  const got = Buffer.from(header);
  const want = Buffer.from(`Bearer ${CRON_SECRET}`);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// Non-destructive retention only. Stale drafts leave the active dashboard but
// their structured state and uploads remain recoverable. This endpoint is not
// scheduled in vercel.json until production activation is explicitly approved.
export async function GET(req: Request) {
  if (!authorized(req.headers.get('authorization') || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const cutoff = sellerDraftRetentionCutoff();
  const result = await prisma.sellerApplicationDraft.updateMany({
    where: { status: 'draft', updatedAt: { lt: cutoff } },
    data: { status: 'abandoned' },
  });
  return NextResponse.json({ ok: true, cutoff, abandoned: result.count, deleted: 0 });
}
