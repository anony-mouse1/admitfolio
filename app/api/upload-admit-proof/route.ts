import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyUploadToken } from '@/lib/uploadToken';
import { supabaseAdmin, ESSAYS_BUCKET, MAX_PDF_BYTES } from '@/lib/supabase';
import { PROOF_PREFIX } from '@/lib/admitProof';
import { PDFDocument } from 'pdf-lib';

export const runtime = 'nodejs';

// One acceptance letter per request (multipart FormData: token, proofId, file),
// mirroring /api/upload-essay so both stay under Vercel's 4.5MB body limit.

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

  const proofId = String(form.get('proofId') || '');
  const proof = proofId ? await prisma.admitProof.findUnique({ where: { id: proofId } }) : null;
  if (!proof) return NextResponse.json({ error: 'Proof not found.' }, { status: 404 });

  // The upload token is scoped to a listing, so check the proof belongs to the
  // seller who owns that listing. Without this, a valid token for one listing
  // could overwrite any seller's letter.
  const listing = await prisma.listing.findUnique({
    where: { id: token.listingId },
    select: { sellerId: true },
  });
  if (!listing || listing.sellerId !== proof.sellerId) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  // A verified proof is evidence someone already checked. Letting a later upload
  // silently replace the file would let a seller swap in anything after review.
  if (proof.status === 'verified') {
    return NextResponse.json({ error: 'This proof has already been verified.' }, { status: 409 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A proof file is required.' }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: 'PDF must be 4MB or smaller.' }, { status: 400 });
  }

  const uploaded = Buffer.from(await file.arrayBuffer());
  const isPdf = uploaded.subarray(0, 5).equals(Buffer.from('%PDF-'));
  const isPng = uploaded.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = uploaded[0] === 0xff && uploaded[1] === 0xd8 && uploaded[2] === 0xff;
  if (!isPdf && !isPng && !isJpeg) {
    return NextResponse.json({ error: 'Proof must be a PDF, PNG, or JPG.' }, { status: 400 });
  }

  // The review pipeline and admin preview already speak PDF. Wrap a portal or
  // acceptance-email screenshot in a one-page PDF so the rest of the system
  // handles every proof consistently without forcing the seller to convert it.
  let buffer = uploaded;
  if (isPng || isJpeg) {
    const doc = await PDFDocument.create();
    const image = isPng ? await doc.embedPng(uploaded) : await doc.embedJpg(uploaded);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = image.width * scale;
    const height = image.height * scale;
    const page = doc.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
    buffer = Buffer.from(await doc.save());
  }

  const path = `${PROOF_PREFIX}/${proof.sellerId}/${proof.id}.pdf`;
  const { error } = await supabaseAdmin.storage
    .from(ESSAYS_BUCKET)
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true });
  if (error) {
    console.error('admit proof upload failed:', error.message);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }

  // A re-upload after a rejection goes back into the queue, and clears the note
  // explaining the old rejection so the seller isn't shown a stale reason.
  await prisma.admitProof.update({
    where: { id: proof.id },
    data: { pdfPath: path, status: 'pending', adminNote: null, reviewedAt: null },
  });

  return NextResponse.json({ ok: true });
}
