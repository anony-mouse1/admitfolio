import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe, SITE_URL } from '@/lib/stripe';
import { isAdminEmail, TEST_EMAILS } from '@/lib/config';

export const runtime = 'nodejs';

// Best-effort per-IP throttle (in-memory, per serverless instance - same
// approach as the admin login lockout). Checkout is cheap but shouldn't be
// free to hammer.
const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;
function throttled(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  if (!stripe) {
    return NextResponse.json({ error: 'Payments are not configured yet.' }, { status: 503 });
  }

  const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  if (throttled(ip)) {
    return NextResponse.json({ error: 'Too many attempts. Please wait a minute.' }, { status: 429 });
  }

  let body: { listingId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const listing = body?.listingId
    ? await prisma.listing.findUnique({
        where: { id: String(body.listingId) },
        include: { seller: { select: { email: true } }, essays: { select: { id: true } } },
      })
    : null;
  const isTest = listing && (isAdminEmail(listing.seller.email) || TEST_EMAILS.has(listing.seller.email.toLowerCase()));
  if (!listing || listing.status !== 'approved' || isTest || !listing.packagePrice || listing.packagePrice < 1) {
    return NextResponse.json({ error: 'This listing is not available for purchase.' }, { status: 404 });
  }

  const count = listing.essays.length;
  const name = `${listing.school} · ${count} essay${count === 1 ? '' : 's'} (Admitfolio)`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: listing.packagePrice * 100,
            product_data: { name },
          },
        },
      ],
      metadata: { listingId: listing.id },
      success_url: `${SITE_URL}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/?checkout=canceled`,
    });
    return NextResponse.json({ ok: true, url: session.url });
  } catch (e) {
    console.error('stripe checkout create failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 });
  }
}
