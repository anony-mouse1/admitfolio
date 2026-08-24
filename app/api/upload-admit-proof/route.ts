import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyUploadToken } from '@/lib/uploadToken';
import { replaceAdmitProofFile } from '@/lib/admitProofUpload';

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

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A proof file is required.' }, { status: 400 });
  }
  const result = await replaceAdmitProofFile(proof, file);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
