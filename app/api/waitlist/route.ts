import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Best-effort per-IP throttle (in-memory, per instance) so the open endpoint
// can't be used to spray rows into the table.
const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 6;
function throttled(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  if (throttled(ip)) {
    return NextResponse.json({ error: 'Too many attempts. Please wait a minute.' }, { status: 429 });
  }

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
