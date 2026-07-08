import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyUploadToken } from '@/lib/uploadToken';
import { supabaseAdmin, ESSAYS_BUCKET, MAX_PDF_BYTES } from '@/lib/supabase';

export const runtime = 'nodejs';

// Receives one PDF per request (multipart FormData: token, essayId, file),
// keeping each request well under Vercel's 4.5MB body limit.

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

  const essayId = String(form.get('essayId') || '');
  const essay = essayId ? await prisma.essay.findUnique({ where: { id: essayId } }) : null;
  if (!essay) return NextResponse.json({ error: 'Essay not found.' }, { status: 404 });
  if (essay.listingId !== token.listingId) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A PDF file is required.' }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: 'PDF must be 4MB or smaller.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Check magic bytes rather than trusting the client's content-type.
  if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    return NextResponse.json({ error: 'File must be a PDF.' }, { status: 400 });
  }

  const path = `listings/${essay.listingId}/${essay.id}.pdf`;
  const { error } = await supabaseAdmin.storage
    .from(ESSAYS_BUCKET)
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true });
  if (error) {
    console.error('essay upload failed:', error.message);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }

  await prisma.essay.update({ where: { id: essay.id }, data: { pdfPath: path } });

  return NextResponse.json({ ok: true });
}
