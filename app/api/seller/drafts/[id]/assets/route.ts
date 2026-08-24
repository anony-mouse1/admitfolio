import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { prisma } from '@/lib/prisma';
import { authenticatedSeller } from '@/lib/authenticatedSeller';
import { safeDraftClientKey } from '@/lib/sellerDraft';
import { ESSAYS_BUCKET, MAX_PDF_BYTES, supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const seller = await authenticatedSeller();
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const draft = await prisma.sellerApplicationDraft.findFirst({
    where: { id: params.id, sellerId: seller.id, status: 'draft' },
    select: { id: true },
  });
  if (!draft) return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
  const kind = String(form.get('kind') || '');
  if (kind !== 'essay' && kind !== 'admitProof') {
    return NextResponse.json({ error: 'Asset kind must be essay or admitProof.' }, { status: 400 });
  }
  const clientKey = safeDraftClientKey(form.get('clientKey'));
  if (!clientKey) return NextResponse.json({ error: 'A valid file row is required.' }, { status: 400 });
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'A file is required.' }, { status: 400 });
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: 'Each file must be 4MB or smaller.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const isPdf = buffer.subarray(0, 5).equals(Buffer.from('%PDF-'));
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (kind === 'essay' && !isPdf) {
    return NextResponse.json({ error: 'Essays must be PDF files.' }, { status: 400 });
  }
  if (kind === 'admitProof' && !isPdf && !isPng && !isJpeg) {
    return NextResponse.json({ error: 'Proof must be a PDF, PNG, or JPG.' }, { status: 400 });
  }

  const existing = await prisma.draftAsset.findUnique({
    where: { draftId_kind_clientKey: { draftId: draft.id, kind, clientKey } },
    select: { id: true },
  });
  let storedBuffer = buffer;
  let storedMimeType = isPdf ? 'application/pdf' : isPng ? 'image/png' : 'image/jpeg';
  if (kind === 'admitProof' && !isPdf) {
    const document = await PDFDocument.create();
    const image = isPng ? await document.embedPng(buffer) : await document.embedJpg(buffer);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = image.width * scale;
    const height = image.height * scale;
    const page = document.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
    storedBuffer = Buffer.from(await document.save());
    storedMimeType = 'application/pdf';
  }

  const assetId = existing?.id || crypto.randomUUID();
  const storagePath = `drafts/${seller.id}/${draft.id}/${kind}/${assetId}`;
  const contentHash = crypto.createHash('sha256').update(storedBuffer).digest('hex');

  const { error } = await supabaseAdmin.storage
    .from(ESSAYS_BUCKET)
    .upload(storagePath, storedBuffer, { contentType: storedMimeType, upsert: true });
  if (error) {
    console.error('draft asset upload failed:', error.message);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }

  const asset = await prisma.draftAsset.upsert({
    where: { draftId_kind_clientKey: { draftId: draft.id, kind, clientKey } },
    create: {
      id: assetId,
      draftId: draft.id,
      kind,
      clientKey,
      fileName: file.name.slice(0, 200) || `${kind}.pdf`,
      mimeType: storedMimeType,
      sizeBytes: storedBuffer.length,
      storagePath,
      contentHash,
      status: 'ready',
    },
    update: {
      fileName: file.name.slice(0, 200) || `${kind}.pdf`,
      mimeType: storedMimeType,
      sizeBytes: storedBuffer.length,
      storagePath,
      contentHash,
      status: 'ready',
    },
    select: { id: true, kind: true, clientKey: true, fileName: true, mimeType: true, sizeBytes: true },
  });

  return NextResponse.json({ ok: true, asset });
}
