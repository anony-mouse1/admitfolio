import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe, SITE_URL } from '@/lib/stripe';
import { isAdminEmail, TEST_EMAILS } from '@/lib/config';
import { sameSchool, schoolShortName } from '@/lib/schools';

export const runtime = 'nodejs';

function parseTags(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

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
  // Must match the browse card's headline. The card leads with the school that
  // admitted the seller, not `listing.school` (which is the university they
  // currently attend), so building this from `listing.school` would show the
  // buyer a different school name on the Stripe page than the one they clicked.
  const admitTags = parseTags(listing.admitTags);
  const headline = admitTags.find((t) => sameSchool(t, listing.school)) || admitTags[0] || listing.school;
  const name = `${schoolShortName(headline)} · ${count} essay${count === 1 ? '' : 's'} (Admitfolio)`;

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
      // buyerIp rides through Stripe metadata because THIS request comes from
      // the buyer's browser. The webhook that writes the Purchase row is called
      // by Stripe, so its own x-forwarded-for is Stripe's address - reading it
      // there would record our payment processor and look like buyer data.
      metadata: { listingId: listing.id, buyerIp: ip.slice(0, 100) },
      success_url: `${SITE_URL}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/?checkout=canceled`,
    });
    return NextResponse.json({ ok: true, url: session.url });
  } catch (e) {
    console.error('stripe checkout create failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 });
  }
}
