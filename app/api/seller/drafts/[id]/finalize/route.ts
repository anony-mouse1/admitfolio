import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { prisma } from '@/lib/prisma';
import { authenticatedSeller } from '@/lib/authenticatedSeller';
import { sanitizeSellerDraftState } from '@/lib/sellerDraft';
import { normalizeAnonymity } from '@/lib/anonymity';
import { schoolKey } from '@/lib/admitProof';
import { sameSchool } from '@/lib/schools';
import { packageFloor, schoolTier, TIER } from '@/lib/pricing';
import { isAdminEmail, TEST_EMAILS } from '@/lib/config';
import { sendAdminSubmissionNotification, sendSubmissionConfirmation } from '@/lib/email';
import { reviewListing } from '@/lib/reviewRunner';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const seller = await authenticatedSeller();
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const draft = await prisma.sellerApplicationDraft.findFirst({
    where: { id, sellerId: seller.id },
    include: {
      assets: { where: { status: 'ready' } },
      sourceListing: {
        include: { essays: true },
      },
    },
  });
  if (!draft) return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
  if (draft.status === 'submitted' && draft.finalizedListingId) {
    return NextResponse.json({ ok: true, listingId: draft.finalizedListingId, alreadyFinalized: true });
  }
  if (draft.status !== 'draft') {
    return NextResponse.json({ error: 'This draft is already being finalized. Please refresh.' }, { status: 409 });
  }
  if (draft.sourceListing && !['rejected', 'removed'].includes(draft.sourceListing.status)) {
    return NextResponse.json({ error: 'Only a rejected or removed listing can be revised.' }, { status: 409 });
  }

  const state = sanitizeSellerDraftState(draft.state);
  if (!state.currentUniversity) return NextResponse.json({ error: 'Add your current university.' }, { status: 400 });
  if (!state.applicationSystem) return NextResponse.json({ error: 'Choose an application type.' }, { status: 400 });
  if (!state.targetSchool || !state.admits.some((school) => sameSchool(school, state.targetSchool))) {
    return NextResponse.json({ error: 'Choose which admitted college this listing is for.' }, { status: 400 });
  }
  if (state.essays.length === 0 || state.essays.some((essay) => !essay.prompt)) {
    return NextResponse.json({ error: 'Add the prompt for every essay.' }, { status: 400 });
  }

  const assetFor = (kind: string, clientKey: string) =>
    draft.assets.find((asset) => asset.kind === kind && asset.clientKey === clientKey);
  const essayFiles = state.essays.map((essay) => {
    const asset = assetFor('essay', essay.clientKey);
    if (asset) return { storagePath: asset.storagePath, contentHash: asset.contentHash, mimeType: asset.mimeType };
    const source = draft.sourceListing?.essays.find((item) => item.id === essay.sourceEssayId);
    return source ? { storagePath: source.pdfPath, contentHash: source.contentHash, mimeType: 'application/pdf' } : null;
  });
  if (essayFiles.some((file) => !file?.storagePath || file.mimeType !== 'application/pdf' || !file.contentHash)) {
    return NextResponse.json({ error: 'Upload a PDF for every essay before submitting.' }, { status: 400 });
  }
  const essayHashes = essayFiles.map((file) => file!.contentHash!);
  if (new Set(essayHashes).size !== essayHashes.length) {
    return NextResponse.json({ error: 'The same essay file was added more than once.' }, { status: 400 });
  }

  const priceFloor = packageFloor(schoolTier(state.targetSchool), state.essays.length);
  if (state.packagePrice == null || state.packagePrice < priceFloor) {
    return NextResponse.json(
      { error: `Your ${TIER[schoolTier(state.targetSchool)].label} package floor is $${priceFloor}. You can charge that or more.` },
      { status: 400 },
    );
  }

  const reusedEssay = await prisma.essay.findFirst({
    where: {
      contentHash: { in: essayHashes },
      listing: {
        sellerId: seller.id,
        id: draft.sourceListingId ? { not: draft.sourceListingId } : undefined,
        status: { in: ['pending', 'approved'] },
        essays: { every: { pdfPath: { not: null } }, some: {} },
      },
    },
    select: { id: true },
  });
  if (reusedEssay) {
    return NextResponse.json(
      { error: 'One of these essay files is already in another active listing.' },
      { status: 409 },
    );
  }

  const proofKeys = [...new Set(state.admits.map(schoolKey).filter(Boolean))];
  const existingProofs = await prisma.admitProof.findMany({
    where: { sellerId: seller.id, schoolKey: { in: proofKeys } },
  });
  for (const label of state.admits) {
    const key = schoolKey(label);
    const existing = existingProofs.find((proof) => proof.schoolKey === key);
    if (existing?.status === 'verified' || (existing?.status === 'pending' && existing.pdfPath)) continue;
    const clientKey = key.replace(/\s+/g, '-');
    if (!assetFor('admitProof', clientKey)) {
      return NextResponse.json({ error: `Upload proof for ${label} before submitting.` }, { status: 400 });
    }
  }

  let listingId: string;
  try {
    listingId = await prisma.$transaction(async (tx) => {
      const claimed = await tx.sellerApplicationDraft.updateMany({
        where: { id: draft.id, sellerId: seller.id, status: 'draft', revision: draft.revision },
        data: { status: 'finalizing' },
      });
      if (claimed.count !== 1) throw new Error('DRAFT_FINALIZE_CONFLICT');

      const listing = await tx.listing.create({
        data: {
          sellerId: seller.id,
          school: state.currentUniversity,
          targetSchool: state.targetSchool,
          applicationSystem: state.applicationSystem,
          gradYear: state.graduationYear || null,
          major: state.currentMajor || null,
          appliedMajors: state.appliedMajors || null,
          admitTags: JSON.stringify(state.admits),
          anonymity: normalizeAnonymity(state.anonymity),
          pricingMode: 'package',
          packagePrice: state.packagePrice,
          teaser: state.teaser || null,
          sellerNote: state.sellerNote || null,
          status: 'pending',
          essays: {
            create: state.essays.map((essay, index) => ({
              prompt: essay.prompt,
              question: essay.question,
              price: null,
              pdfPath: essayFiles[index]!.storagePath,
              contentHash: essayFiles[index]!.contentHash,
              sortOrder: index,
            })),
          },
        },
        select: { id: true },
      });

      for (const label of state.admits) {
        const key = schoolKey(label);
        const existing = existingProofs.find((proof) => proof.schoolKey === key);
        if (existing?.status === 'verified' || (existing?.status === 'pending' && existing.pdfPath)) continue;
        const asset = assetFor('admitProof', key.replace(/\s+/g, '-'))!;
        if (existing) {
          await tx.admitProof.update({
            where: { id: existing.id },
            data: {
              schoolLabel: label,
              pdfPath: asset.storagePath,
              status: 'pending',
              adminNote: null,
              reviewedAt: null,
              aiCheckedAt: null,
              aiGenuine: null,
              aiNote: null,
              version: { increment: 1 },
            },
          });
        } else {
          await tx.admitProof.create({
            data: { sellerId: seller.id, schoolKey: key, schoolLabel: label, pdfPath: asset.storagePath },
          });
        }
      }

      await tx.draftAsset.updateMany({
        where: { draftId: draft.id, status: 'ready' },
        data: { status: 'finalized' },
      });
      await tx.sellerApplicationDraft.update({
        where: { id: draft.id },
        data: { status: 'submitted', finalizedListingId: listing.id, submittedAt: new Date() },
      });
      return listing.id;
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'DRAFT_FINALIZE_CONFLICT') {
      return NextResponse.json({ error: 'This draft changed in another session. Please refresh.' }, { status: 409 });
    }
    throw error;
  }

  const notify = await sendAdminSubmissionNotification({
    school: state.targetSchool,
    sellerEmail: seller.email,
    essayCount: state.essays.length,
    admitTags: state.admits,
    isTest: isAdminEmail(seller.email) || TEST_EMAILS.has(seller.email),
  });
  if (!notify.ok) console.error('admin submission notification failed:', notify.status, notify.detail);
  const confirm = await sendSubmissionConfirmation(seller.email, {
    school: state.targetSchool,
    essayCount: state.essays.length,
  });
  if (!confirm.ok) console.error('submission confirmation failed:', confirm.status, confirm.detail);

  waitUntil(
    reviewListing(listingId)
      .then((outcome) => console.log(`[review:draft] ${listingId}: ${outcome}`))
      .catch((error) => console.error(`[review:draft] ${listingId} failed:`, error)),
  );
  return NextResponse.json({ ok: true, listingId });
}
