import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentSeller } from '@/lib/sellerAuth';
import { replaceAdmitProofFile } from '@/lib/admitProofUpload';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = currentSeller();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const seller = await prisma.seller.findUnique({
    where: { email: session.email },
    select: { id: true },
  });
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const proof = await prisma.admitProof.findFirst({
    where: { id: params.id, sellerId: seller.id },
    select: { id: true, sellerId: true, schoolKey: true, status: true, version: true, pdfPath: true },
  });
  if (!proof) return NextResponse.json({ error: 'Proof not found.' }, { status: 404 });
  if (proof.status !== 'rejected' && proof.pdfPath) {
    return NextResponse.json(
      { error: 'Only a rejected or missing proof can be uploaded from the dashboard.' },
      { status: 409 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A proof file is required.' }, { status: 400 });
  }

  const result = await replaceAdmitProofFile(proof, file);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
