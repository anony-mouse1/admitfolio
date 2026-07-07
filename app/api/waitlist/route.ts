import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: Request) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
  const email = String(body?.email || '').trim();
  if (!emailRe.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }
  const lower = email.toLowerCase();
  const existing = await prisma.waitlistEntry.findUnique({ where: { email: lower } });
  if (existing) return NextResponse.json({ ok: true, already: true });
  await prisma.waitlistEntry.create({ data: { email: lower } });
  return NextResponse.json({ ok: true, already: false });
}
