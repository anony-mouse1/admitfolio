import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyUploadToken } from '@/lib/uploadToken';
import { supabaseAdmin, ESSAYS_BUCKET, MAX_PDF_BYTES } from '@/lib/supabase';
import { PROOF_PREFIX } from '@/lib/admitProof';

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
    return NextResponse.json({ error: 'This letter has already been verified.' }, { status: 409 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A PDF file is required.' }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: 'PDF must be 4MB or smaller.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Magic bytes, not the client's content-type.
  if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    return NextResponse.json({ error: 'File must be a PDF.' }, { status: 400 });
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
