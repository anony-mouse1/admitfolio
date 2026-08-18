import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyUploadToken } from '@/lib/uploadToken';
import { supabaseAdmin, ESSAYS_BUCKET, MAX_PDF_BYTES } from '@/lib/supabase';
import { createHash } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { reviewListing } from '@/lib/reviewRunner';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Receives one PDF per request (multipart FormData: token, essayId, file),
// keeping each request well under Vercel's 4.5MB body limit.

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const token = verifyUploadToken(String(form.get('token') || ''));
  if (!token) {
    return NextResponse.json({ error: 'Upload session expired. Please resubmit.' }, { status: 401 });
  }

  const essayId = String(form.get('essayId') || '');
  const essay = essayId ? await prisma.essay.findUnique({
    where: { id: essayId },
    include: { listing: { select: { sellerId: true } } },
  }) : null;
  if (!essay) return NextResponse.json({ error: 'Essay not found.' }, { status: 404 });
  if (essay.listingId !== token.listingId) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A PDF file is required.' }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: 'PDF must be 4MB or smaller.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Check magic bytes rather than trusting the client's content-type.
  if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    return NextResponse.json({ error: 'File must be a PDF.' }, { status: 400 });
  }

  const contentHash = createHash('sha256').update(buffer).digest('hex');
  const duplicate = await prisma.essay.findFirst({
    where: {
      id: { not: essay.id },
      contentHash,
      OR: [
        { listingId: essay.listingId },
        {
          listing: {
            sellerId: essay.listing.sellerId,
            status: { in: ['pending', 'approved'] },
            essays: { every: { pdfPath: { not: null } }, some: {} },
          },
        },
      ],
    },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: 'This exact essay is already part of another active listing. Keep each essay in one package so buyers are never charged twice for the same file.' },
      { status: 409 },
    );
  }

  const path = `listings/${essay.listingId}/${essay.id}.pdf`;
  const { error } = await supabaseAdmin.storage
    .from(ESSAYS_BUCKET)
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true });
  if (error) {
    console.error('essay upload failed:', error.message);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }

  await prisma.essay.update({ where: { id: essay.id }, data: { pdfPath: path, contentHash } });

  // Proofs upload first and essays upload in order, so the request that stores
  // the final essay is the first point where the complete submission is ready.
  // Start its review after returning to the seller. The five-minute cron stays
  // as a fallback for interrupted uploads and background-function failures.
  const ready = await prisma.listing.findFirst({
    where: {
      id: essay.listingId,
      status: 'pending',
      aiReviewedAt: null,
      essays: { every: { pdfPath: { not: null } }, some: {} },
    },
    select: { id: true },
  });
  if (ready) {
    waitUntil(
      reviewListing(ready.id)
        .then((outcome) => console.log(`[review:upload] ${ready.id}: ${outcome}`))
        .catch((error) => console.error(`[review:upload] ${ready.id} failed:`, error)),
    );
  }

  return NextResponse.json({ ok: true });
}
