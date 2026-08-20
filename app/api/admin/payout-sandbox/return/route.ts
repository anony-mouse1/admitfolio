import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/adminAuth';
import { SITE_URL } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function GET() {
  if (!currentAdmin()) return NextResponse.redirect(`${SITE_URL}/admin`);
  return NextResponse.redirect(`${SITE_URL}/admin/payout-sandbox?returned=1`);
}
