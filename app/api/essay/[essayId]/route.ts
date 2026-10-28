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

type StorageFailure = { status: number | string | null; message: string };

async function downloadFromStorage(path: string): Promise<{ buffer: Buffer } | { failure: StorageFailure }> {
  const { data, error } = await supabaseAdmin.storage.from(ESSAYS_BUCKET).download(path);
  if (error || !data) {
    // storage-js errors carry the HTTP status as `status` (number) or
    // `statusCode` (string) depending on the error class; keep whichever exists.
    const e = error as (Error & { status?: number; statusCode?: string }) | null;
    return { failure: { status: e?.status ?? e?.statusCode ?? null, message: e?.message ?? 'no data' } };
  }
  return { buffer: Buffer.from(await data.arrayBuffer()) };
}

// Other storage objects holding the exact same bytes. A seller's file is
// reused across packages for different colleges (lib/essayDuplication) and
// every draft upload keeps its own object, so a copy often exists. Same hash
// means same bytes, so serving one is indistinguishable from the original.
async function alternatePaths(primary: string, contentHash: string | null): Promise<string[]> {
  if (!contentHash) return [];
  const [essays, drafts] = await Promise.all([
    prisma.essay.findMany({
      where: { contentHash, pdfPath: { not: null } },
      select: { pdfPath: true },
    }),
    prisma.draftAsset.findMany({
      where: { contentHash, kind: 'essay' },
      select: { storagePath: true },
    }),
  ]);
  const seen = new Set<string>([primary]);
  const out: string[] = [];
  for (const path of [...essays.map((e) => e.pdfPath), ...drafts.map((d) => d.storagePath)]) {
    if (path && !seen.has(path)) {
      seen.add(path);
      out.push(path);
    }
  }
  return out;
}

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
    include: { listing: { include: { essays: { select: { id: true, pdfPath: true, contentHash: true } } } } },
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

  // The essay's own object first. If storage cannot serve it, fall back to any
  // byte-identical copy (same SHA-256) the same file left under another listing
  // or draft, so a lost or unreadable object does not lock a paying buyer out
  // while it is being restored. Every failure is logged with the storage
  // status so the cause is visible in the function logs, and the last one is
  // echoed to the caller: the token already proves a purchase, and a bare
  // "could not load" has cost real support time.
  const paths = [essay.pdfPath, ...(await alternatePaths(essay.pdfPath, essay.contentHash))];
  let original: Buffer | null = null;
  let lastFailure: StorageFailure | null = null;
  for (const path of paths) {
    const result = await downloadFromStorage(path);
    if ('buffer' in result) {
      if (path !== essay.pdfPath) console.warn('essay served from duplicate object:', essay.pdfPath, '->', path);
      original = result.buffer;
      break;
    }
    lastFailure = result.failure;
    console.error('essay download failed:', path, lastFailure.status, lastFailure.message);
  }
  if (!original) {
    return NextResponse.json(
      { error: 'Could not load this essay', storage: lastFailure ?? { status: null, message: 'no data' } },
      { status: 502 },
    );
  }

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
