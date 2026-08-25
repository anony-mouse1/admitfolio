import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentAdmin } from '@/lib/adminAuth';
import { PROOF_STATUSES, type ProofStatus } from '@/lib/admitProof';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { proofId, status: 'verified' | 'rejected', note? }
//
// The only path that can mark an acceptance letter verified. Deliberately
// separate from the listing decision endpoint: a listing can be approved while
// one of its admit claims is still unproven, and the two decisions carry
// different weight - approving a listing publishes it, verifying a proof is
// what lets the catalogue call that admit confirmed.
export async function POST(req: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { proofId?: string; status?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const status = String(body?.status || '');
  // 'pending' is intentionally not settable here: it is the state a seller
  // creates by uploading, not a decision an admin makes.
  if (!PROOF_STATUSES.includes(status as ProofStatus) || status === 'pending') {
    return NextResponse.json({ error: 'Status must be verified or rejected.' }, { status: 400 });
  }

  const proofId = String(body?.proofId || '');
  const proof = proofId ? await prisma.admitProof.findUnique({ where: { id: proofId } }) : null;
  if (!proof) return NextResponse.json({ error: 'Proof not found.' }, { status: 404 });

  // Nothing to look at means nothing to decide - guards against verifying a row
  // that was created at submission but never received a file.
  if (!proof.pdfPath) {
    return NextResponse.json({ error: 'No proof has been uploaded yet.' }, { status: 409 });
  }

  const note = String(body?.note || '').trim().slice(0, 500) || null;
  if (status === 'rejected' && !note) {
    return NextResponse.json(
      { error: 'Add a note so the seller knows what was wrong with the letter.' },
      { status: 400 },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.admitProof.updateMany({
      where: { id: proof.id, version: proof.version },
      data: { status, adminNote: note, reviewedAt: new Date() },
    });
    if (changed.count !== 1) return null;
    const run = await tx.verificationRun.findFirst({
      where: { proofId: proof.id, proofVersion: proof.version },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    await tx.verificationDecision.create({
      data: {
        proofId: proof.id,
        proofVersion: proof.version,
        runId: run?.id || null,
        actorType: 'admin',
        actorId: admin.email,
        status,
        note,
      },
    });
    return tx.admitProof.findUnique({
      where: { id: proof.id },
      select: { id: true, status: true, adminNote: true, reviewedAt: true },
    });
  });
  if (!updated) {
    return NextResponse.json({ error: 'This proof changed while it was being reviewed. Reload and try again.' }, { status: 409 });
  }

  return NextResponse.json({ ok: true, proof: updated });
}
