import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/adminAuth';
import { applyListingDecision } from '@/lib/listingDecision';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!currentAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { id?: string; decision?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
  const id = String(body?.id || '');
  const decision = String(body?.decision || '');
  if (!id) return NextResponse.json({ error: 'Listing id required.' }, { status: 400 });
  if (!['approved', 'rejected'].includes(decision)) {
    return NextResponse.json({ error: 'decision must be approved or rejected.' }, { status: 400 });
  }

  const note = body?.note ? String(body.note) : null;
  // human: true - this decision came from a person in the console, so it stamps
  // humanReviewedAt and clears the listing off the audit queue.
  const result = await applyListingDecision(id, decision as 'approved' | 'rejected', note, {
    human: true,
  });
  if (!result.ok) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, status: result.status });
}
