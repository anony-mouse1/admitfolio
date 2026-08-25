import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAccessToken } from '@/lib/accessToken';
import { supabaseAdmin, ESSAYS_BUCKET } from '@/lib/supabase';
import { watermarkPdf } from '@/lib/watermark';
import { makePurchaseFingerprint } from '@/lib/purchaseFingerprint';
import { clientIpFromHeaders } from '@/lib/requestIp';
import { SESSION_SECRET } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Download + watermark of a multi-page PDF. 60s is the Hobby ceiling.
export const maxDuration = 60;

// GET /api/essay/<essayId>?t=<accessToken>
//
// The only route that serves a purchased essay. Replaces handing the buyer a
// Supabase signed URL, which had three problems: the URL was shareable with
// anyone for its lifetime, it delivered the original file byte-for-byte, and it
// bypassed us entirely so a read left no trace.
//
// Now every read is authenticated against the purchase, logged with the caller's
// IP, and served as a copy watermarked for that specific buyer.
export async function GET(req: Request, { params }: { params: Promise<{ essayId: string }> }) {
  const token = new URL(req.url).searchParams.get('t');
  const verified = verifyAccessToken(token);
  if (!verified) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const purchase = await prisma.purchase.findUnique({
    where: { id: verified.purchaseId },
    include: { listing: { include: { essays: { select: { id: true, pdfPath: true } } } } },
  });
  if (!purchase || !purchase.listing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // The token proves which PURCHASE the caller holds; it says nothing about
  // which essay they asked for. Without this check a valid token would read any
  // essay on the platform by id.
  const { essayId } = await params;
  const essay = purchase.listing.essays.find((e) => e.id === essayId);
  if (!essay) {
    return NextResponse.json({ error: 'Not part of this purchase' }, { status: 403 });
  }
  if (!essay.pdfPath) {
    return NextResponse.json({ error: 'No PDF for this essay' }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin.storage.from(ESSAYS_BUCKET).download(essay.pdfPath);
  if (error || !data) {
    console.error('essay download failed:', essay.pdfPath, error?.message);
    return NextResponse.json({ error: 'Could not load this essay' }, { status: 502 });
  }

  const original = Buffer.from(await data.arrayBuffer());
  const viewedAt = new Date();

  // Log the read before serving. Non-fatal: a logging outage must not lock a
  // paying buyer out of what they bought, but it is awaited so the row is
  // written even though the function may freeze right after responding.
  const ip = clientIpFromHeaders(req.headers);
  try {
    await prisma.essayView.create({
      data: {
        purchaseId: purchase.id,
        essayId: essay.id,
        ip,
        userAgent: req.headers.get('user-agent')?.slice(0, 400) || null,
      },
    });
  } catch (e) {
    console.error('essay view logging failed:', e instanceof Error ? e.message : e);
  }

  const fingerprint = purchase.deliveryFingerprint ||
    makePurchaseFingerprint(purchase.id, purchase.buyerEmail, SESSION_SECRET);
  let body: Buffer;
  try {
    body = await watermarkPdf(original, { fingerprint, viewedAt });
  } catch (e) {
    // A PDF too malformed to stamp must not be served unmarked - an unwatermarked
    // copy is exactly what this route exists to prevent.
    console.error('watermarking failed:', essay.pdfPath, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not prepare this essay' }, { status: 502 });
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': 'application/pdf',
      // Inline, and named with the same non-reversible fingerprint. If it is
      // saved anyway, the filename carries the attribution too.
      'Content-Disposition': `inline; filename="admitfolio-${fingerprint}.pdf"`,
      // Never cached by a proxy or CDN: the body is buyer-specific.
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
