import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: Request) {
  let body: {
    buyerEmail?: string;
    listingId?: string;
    essayId?: string;
    itemLabel?: string;
    amount?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const buyerEmail = String(body?.buyerEmail || '').trim();
  if (!emailRe.test(buyerEmail)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
  }

  // listingId is optional - the sample catalog on the landing page isn't in the
  // DB yet, so we still record the purchase intent with a label + amount.
  let listingId: string | null = body?.listingId ? String(body.listingId) : null;
  if (listingId) {
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) listingId = null;
  }

  const amount = body?.amount != null ? Math.round(Number(body.amount)) : 0;
  const purchase = await prisma.purchase.create({
    data: {
      buyerEmail,
      listingId,
      essayId: body?.essayId ? String(body.essayId) : null,
      itemLabel: body?.itemLabel ? String(body.itemLabel) : null,
      amount,
    },
  });

  return NextResponse.json({ ok: true, purchaseId: purchase.id });
}
