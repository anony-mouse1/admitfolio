import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { emailAllowed, DEV_LOGIN_CODE, CODE_TTL_MS } from '@/lib/config';
import { sendLoginCode } from '@/lib/email';

export const runtime = 'nodejs';

const RESEND_COOLDOWN_MS = 60 * 1000;

const sixDigits = () => String(crypto.randomInt(100000, 1000000));

export async function POST(req: Request) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
  const email = String(body?.email || '').trim();
  if (!emailAllowed(email)) {
    return NextResponse.json({ error: 'Please enter a valid .edu email address.' }, { status: 400 });
  }

  const lower = email.toLowerCase();

  // Per-email cooldown so the endpoint can't be scripted to bomb an inbox or
  // burn the Resend quota. issuedAt is recovered from the stored expiry.
  if (!DEV_LOGIN_CODE) {
    const existing = await prisma.loginCode.findUnique({ where: { email: lower } });
    const issuedAt = existing ? existing.expiresAt.getTime() - CODE_TTL_MS : 0;
    if (existing && Date.now() - issuedAt < RESEND_COOLDOWN_MS) {
      return NextResponse.json(
        { error: 'We just sent you a code. Check your inbox, or try again in a minute.' },
        { status: 429 },
      );
    }
  }

  const code = DEV_LOGIN_CODE || sixDigits();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await prisma.loginCode.upsert({
    where: { email: lower },
    update: { code, expiresAt, attempts: 0 },
    create: { email: lower, code, expiresAt, attempts: 0 },
  });

  if (DEV_LOGIN_CODE) {
    console.log(`[dev] DEV_LOGIN_CODE active - code for ${email} is ${DEV_LOGIN_CODE} (no email sent)`);
    return NextResponse.json({ ok: true, simulated: true, dev: true });
  }

  const result = await sendLoginCode(email, code);
  if (!result.ok) {
    console.error('Resend error', result.status, result.detail);
    return NextResponse.json(
      { error: 'Could not send the email right now. Please try again.' },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, simulated: !!result.simulated });
}
