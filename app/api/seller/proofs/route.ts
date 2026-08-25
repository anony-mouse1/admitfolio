import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentSeller } from '@/lib/sellerAuth';
import { PROOF_LABEL, type ProofStatus } from '@/lib/admitProof';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    proofs: seller.admitProofs.map((proof) => {
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
    }),
  });
}
