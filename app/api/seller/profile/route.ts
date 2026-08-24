import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentSeller } from '@/lib/sellerAuth';
import { PROFILE_TAGS } from '@/lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BIO = 300;
const MAX_NAME = 80;
const MAX_EDUCATION = 120;
const MAX_GRADUATION_YEAR = 12;

// Avatars are the seller's initials, rendered client-side - no photos.
function shape(seller: {
  name: string | null;
  bio: string | null;
  backgroundTags: string;
  currentUniversity: string | null;
  currentMajor: string | null;
  graduationYear: string | null;
}) {
  let backgroundTags: string[] = [];
  try {
    const parsed = JSON.parse(seller.backgroundTags);
    if (Array.isArray(parsed)) backgroundTags = parsed.map(String);
  } catch {
    /* ignore */
  }
  return {
    name: seller.name,
    bio: seller.bio,
    backgroundTags,
    currentUniversity: seller.currentUniversity,
    currentMajor: seller.currentMajor,
    graduationYear: seller.graduationYear,
  };
}

export async function GET() {
  const session = currentSeller();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const seller = await prisma.seller.findUnique({ where: { email: session.email } });
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({ ok: true, ...shape(seller) });
}

export async function POST(req: Request) {
  const session = currentSeller();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    name?: string;
    bio?: string;
    backgroundTags?: string[];
    currentUniversity?: string;
    currentMajor?: string;
    graduationYear?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const name = String(body?.name || '').trim().slice(0, MAX_NAME) || null;
  const bio = String(body?.bio || '').trim().slice(0, MAX_BIO) || null;
  const currentUniversity = String(body?.currentUniversity || '').trim().slice(0, MAX_EDUCATION) || null;
  const currentMajor = String(body?.currentMajor || '').trim().slice(0, MAX_EDUCATION) || null;
  const graduationYear = String(body?.graduationYear || '').trim().slice(0, MAX_GRADUATION_YEAR) || null;
  const allowed = new Set<string>(PROFILE_TAGS);
  const backgroundTags = Array.isArray(body?.backgroundTags)
    ? [...new Set(body.backgroundTags.map(String).filter((t) => allowed.has(t)))]
    : [];

  const seller = await prisma.seller.update({
    where: { email: session.email },
    data: {
      ...(body.name !== undefined ? { name } : {}),
      ...(body.bio !== undefined ? { bio } : {}),
      ...(body.backgroundTags !== undefined ? { backgroundTags: JSON.stringify(backgroundTags) } : {}),
      ...(body.currentUniversity !== undefined ? { currentUniversity } : {}),
      ...(body.currentMajor !== undefined ? { currentMajor } : {}),
      ...(body.graduationYear !== undefined ? { graduationYear } : {}),
    },
  });

  return NextResponse.json({ ok: true, ...shape(seller) });
}
