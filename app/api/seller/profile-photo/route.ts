import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentSeller } from '@/lib/sellerAuth';
import { supabaseAdmin, ESSAYS_BUCKET } from '@/lib/supabase';

export const runtime = 'nodejs';

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const SIGNED_URL_TTL_S = 60 * 60;

// Sniff the real image type from magic bytes - never trust the client's
// content-type (same policy as the PDF upload).
function imageType(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

export async function POST(req: Request) {
  const session = currentSeller();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const seller = await prisma.seller.findUnique({ where: { email: session.email } });
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'An image file is required.' }, { status: 400 });
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: 'Photo must be 2MB or smaller.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const type = imageType(buffer);
  if (!type) {
    return NextResponse.json({ error: 'Photo must be a JPG, PNG, or WebP image.' }, { status: 400 });
  }

  const path = `profiles/${seller.id}.${type.ext}`;
  const { error } = await supabaseAdmin.storage
    .from(ESSAYS_BUCKET)
    .upload(path, buffer, { contentType: type.mime, upsert: true });
  if (error) {
    console.error('profile photo upload failed:', error.message);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }

  await prisma.seller.update({ where: { id: seller.id }, data: { photoPath: path } });

  const { data } = await supabaseAdmin.storage.from(ESSAYS_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_S);
  return NextResponse.json({ ok: true, photoUrl: data?.signedUrl || null });
}
