import 'server-only';
import { PDFDocument } from 'pdf-lib';
import { prisma } from '@/lib/prisma';
import { listingProofKeys, PROOF_PREFIX } from '@/lib/admitProof';
import { ESSAYS_BUCKET, MAX_PDF_BYTES, supabaseAdmin } from '@/lib/supabase';

type ProofForUpload = {
  id: string;
  sellerId: string;
  schoolKey: string;
  status: string;
  version: number;
};

export type ProofUploadResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function replaceAdmitProofFile(
  proof: ProofForUpload,
  file: File,
): Promise<ProofUploadResult> {
  if (proof.status === 'verified') {
    return { ok: false, status: 409, error: 'This proof has already been verified.' };
  }
  if (file.size > MAX_PDF_BYTES) {
    return { ok: false, status: 400, error: 'PDF must be 4MB or smaller.' };
  }

  const uploaded = Buffer.from(await file.arrayBuffer());
  const isPdf = uploaded.subarray(0, 5).equals(Buffer.from('%PDF-'));
  const isPng = uploaded.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = uploaded[0] === 0xff && uploaded[1] === 0xd8 && uploaded[2] === 0xff;
  if (!isPdf && !isPng && !isJpeg) {
    return { ok: false, status: 400, error: 'Proof must be a PDF, PNG, or JPG.' };
  }

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

  const nextVersion = proof.version + 1;
  const path = `${PROOF_PREFIX}/${proof.sellerId}/${proof.id}/v${nextVersion}.pdf`;
  const { error } = await supabaseAdmin.storage
    .from(ESSAYS_BUCKET)
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true });
  if (error) {
    console.error('admit proof upload failed:', error.message);
    return { ok: false, status: 500, error: 'Upload failed. Please try again.' };
  }

  const pendingListings = await prisma.listing.findMany({
    where: { sellerId: proof.sellerId, status: 'pending' },
    select: { id: true, admitTags: true, targetSchool: true },
  });
  const relatedListingIds = pendingListings
    .filter((row) => listingProofKeys(row.admitTags, row.targetSchool).includes(proof.schoolKey))
    .map((row) => row.id);

  await prisma.$transaction([
    prisma.admitProof.update({
      where: { id: proof.id },
      data: {
        pdfPath: path,
        status: 'pending',
        adminNote: null,
        reviewedAt: null,
        aiCheckedAt: null,
        aiGenuine: null,
        aiNote: null,
        version: nextVersion,
      },
    }),
    prisma.listing.updateMany({
      where: { id: { in: relatedListingIds }, status: 'pending' },
      data: {
        aiReviewStartedAt: null,
        aiReviewedAt: null,
        aiDecision: null,
        aiConfidence: null,
        aiReasons: null,
        aiSuggestion: null,
        aiLenses: null,
      },
    }),
  ]);

  return { ok: true };
}
