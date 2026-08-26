import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentSeller } from '@/lib/sellerAuth';
import { authenticatedSeller } from '@/lib/authenticatedSeller';
import { PROOF_LABEL, schoolKey, type ProofStatus } from '@/lib/admitProof';
import { parseAdmitTags } from '@/lib/listingSchool';
import { matchesSellerApplication, sellerApplicationSchool } from '@/lib/sellerApplications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ProofRow = {
  id: string;
  schoolLabel: string;
  status: string;
  adminNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  pdfPath: string | null;
};

function shapeProof(proof: ProofRow) {
  const status = proof.status as ProofStatus;
  return {
    id: proof.id,
    school: proof.schoolLabel,
    status,
    statusLabel: PROOF_LABEL[status] || 'Awaiting review',
    note: status === 'rejected' ? proof.adminNote : null,
    reviewedAt: proof.reviewedAt,
    submittedAt: proof.createdAt,
    hasFile: Boolean(proof.pdfPath),
    canReplace: status === 'rejected' || !proof.pdfPath,
  };
}

export async function GET() {
  const session = await currentSeller();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const seller = await prisma.seller.findUnique({
    where: { email: session.email },
    select: {
      admitProofs: {
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          schoolLabel: true,
          status: true,
          adminNote: true,
          reviewedAt: true,
          createdAt: true,
          pdfPath: true,
        },
      },
    },
  });
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({
    ok: true,
    proofs: seller.admitProofs.map(shapeProof),
  });
}

export async function POST(req: Request) {
  const seller = await authenticatedSeller();
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { school?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
  const school = String(body.school || '').trim().slice(0, 120);
  if (!school) return NextResponse.json({ error: 'Application school is required.' }, { status: 400 });

  const listings = await prisma.listing.findMany({
    where: { sellerId: seller.id },
    select: { school: true, targetSchool: true, admitTags: true },
  });
  const application = listings.find((listing) => matchesSellerApplication({
    school: listing.school,
    targetSchool: listing.targetSchool,
    admitTags: parseAdmitTags(listing.admitTags),
  }, school));
  if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

  const applicationSchool = sellerApplicationSchool({
    school: application.school,
    targetSchool: application.targetSchool,
    admitTags: parseAdmitTags(application.admitTags),
  });
  const applicationSchoolKey = schoolKey(applicationSchool);
  const proof = await prisma.admitProof.upsert({
    where: { sellerId_schoolKey: { sellerId: seller.id, schoolKey: applicationSchoolKey } },
    update: {},
    create: {
      sellerId: seller.id,
      schoolKey: applicationSchoolKey,
      schoolLabel: applicationSchool,
      status: 'pending',
    },
    select: {
      id: true,
      schoolLabel: true,
      status: true,
      adminNote: true,
      reviewedAt: true,
      createdAt: true,
      pdfPath: true,
    },
  });

  return NextResponse.json({ ok: true, proof: shapeProof(proof) });
}
