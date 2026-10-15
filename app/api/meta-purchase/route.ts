import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { META_CONSENT_COOKIE, purchaseForMeta } from '@/lib/metaTracking';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  const consent = req.headers.get('cookie')?.split(';').some(v => v.trim() === `${META_CONSENT_COOKIE}=v1.allowed`);
  if (req.headers.get('origin') !== origin || !consent || req.headers.get('sec-gpc') === '1') {
    return NextResponse.json({ purchase: null }, { status: 403, headers });
  }
  let sessionId: unknown;
  try { sessionId = (await req.json()).sessionId; } catch {
    return NextResponse.json({ purchase: null }, { status: 400, headers });
  }
  if (typeof sessionId !== 'string' || sessionId.length > 255 || !/^cs_live_[A-Za-z0-9]+$/.test(sessionId)) {
    return NextResponse.json({ purchase: null }, { status: 400, headers });
  }
  const purchase = await prisma.purchase.findUnique({
    where: { stripeSessionId: sessionId },
    select: { stripeSessionId: true, grossAmountCents: true, amount: true, currency: true, createdAt: true },
  });
  const eventId = `purchase_${createHash('sha256').update(`meta:${sessionId}`).digest('hex')}`;
  return NextResponse.json({ purchase: purchaseForMeta(purchase, sessionId, eventId) }, { headers });
}
