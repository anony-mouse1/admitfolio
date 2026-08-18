import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe, SITE_URL } from '@/lib/stripe';
import { isAdminEmail, TEST_EMAILS } from '@/lib/config';
import { checkoutSessionParams, quoteListing } from '@/lib/commerce';
import { clientIpFromHeaders } from '@/lib/requestIp';

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

  const buyerIp = clientIpFromHeaders(req.headers);
  if (throttled(buyerIp || 'unknown')) {
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
        include: {
          seller: { select: { email: true } },
          essays: { select: { id: true, pdfPath: true } },
        },
      })
    : null;
  const isTest = listing && (isAdminEmail(listing.seller.email) || TEST_EMAILS.has(listing.seller.email.toLowerCase()));
  const result = quoteListing(listing, Boolean(isTest));
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: result.reason === 'school_unconfirmed' ? 409 : 404 },
    );
  }
  const { quote } = result;

  try {
    const session = await stripe.checkout.sessions.create(
      checkoutSessionParams(quote, buyerIp, SITE_URL),
    );
    return NextResponse.json({ ok: true, url: session.url });
  } catch (e) {
    console.error('stripe checkout create failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 });
  }
}
