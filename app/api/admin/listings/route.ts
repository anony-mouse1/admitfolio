import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentAdmin } from '@/lib/adminAuth';
import { isAdminEmail, TEST_EMAILS } from '@/lib/config';
import { supabaseAdmin, ESSAYS_BUCKET } from '@/lib/supabase';
import { schoolTier } from '@/lib/pricing';
import { schoolKey } from '@/lib/admitProof';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIGNED_URL_TTL_S = 3600;

export async function GET() {
  if (!currentAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await prisma.listing.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      essays: { orderBy: { sortOrder: 'asc' } },
      // The seller's own profile, so the console can show who is behind a
      // submission and what display name they actually consented to.
      seller: {
        select: {
          email: true,
          name: true,
          bio: true,
          photoPath: true,
          backgroundTags: true,
          // Acceptance letters are per SELLER, so a listing shows the subset
          // matching its own admitTags (matched on the normalised key).
          admitProofs: true,
        },
      },
    },
  });

  // One batch call for short-lived signed URLs to every uploaded PDF, essays and
  // acceptance letters alike. De-duplicated because one seller's letter is
  // reachable from every listing of theirs.
  const paths = [
    ...new Set([
      ...rows.flatMap((l) => l.essays.flatMap((e) => (e.pdfPath ? [e.pdfPath] : []))),
      ...rows.flatMap((l) => l.seller.admitProofs.flatMap((p) => (p.pdfPath ? [p.pdfPath] : []))),
    ]),
  ];
  const urlByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await supabaseAdmin.storage
      .from(ESSAYS_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_S);
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
    }
  }

  // Shape a clean payload for the console (parse admitTags JSON, expose seller email).
  const listings = rows.map((l) => {
    // The proofs relevant to THIS listing: one per distinct school it claims.
    // A claim with no row at all (every listing submitted before this feature
    // shipped) surfaces as `missing`, which is different from `pending` - the
    // seller was never asked, so there is nothing waiting on review.
    const byKey = new Map(l.seller.admitProofs.map((p) => [p.schoolKey, p]));
    const claimed = safeParse(l.admitTags);
    const seen = new Set<string>();
    const admitProofs = claimed.flatMap((label) => {
      const key = schoolKey(label);
      if (!key || seen.has(key)) return [];
      seen.add(key);
      const p = byKey.get(key);
      return [{
        id: p?.id ?? null,
        school: label,
        status: p ? p.status : 'missing',
        adminNote: p?.adminNote ?? null,
        pdfUrl: (p?.pdfPath && urlByPath.get(p.pdfPath)) || null,
        // What the review panel made of the letter. Advisory - it never sets
        // `status` - but it is the whole point of having the panel read them,
        // so it belongs beside the Verify button rather than in a log.
        aiGenuine: p?.aiGenuine ?? null,
        aiNote: p?.aiNote ?? null,
        aiCheckedAt: p?.aiCheckedAt ?? null,
      }];
    });
    return {
    id: l.id,
    school: l.school,
    gradYear: l.gradYear,
    major: l.major,
    appliedMajors: l.appliedMajors,
    admitTags: safeParse(l.admitTags),
    anonymity: l.anonymity,
    pricingMode: l.pricingMode,
    packagePrice: l.packagePrice,
    status: l.status,
    adminNote: l.adminNote,
    sellerNote: l.sellerNote,
    createdAt: l.createdAt,
    reviewedAt: l.reviewedAt,
    aiReviewedAt: l.aiReviewedAt,
    aiDecision: l.aiDecision,
    aiConfidence: l.aiConfidence,
    aiReasons: l.aiReasons,
    aiSuggestion: l.aiSuggestion,
    // Parsed here rather than in the client so the console gets a real array.
    aiLenses: safeParseLenses(l.aiLenses),
    humanReviewedAt: l.humanReviewedAt,
    // Your own shelf marker. Not shown to sellers anywhere.
    savedAt: l.savedAt,
    sellerEmail: l.seller.email,
    // Seller profile. `anonymity` above governs what BUYERS see; these fields
    // are what the seller filled in, shown to you regardless so you can check
    // the two line up before approving.
    sellerName: l.seller.name,
    sellerBio: l.seller.bio,
    sellerTags: safeParse(l.seller.backgroundTags),
    // `school` is the university the seller attends (the wizard's "Current
    // university"), so tier 1 here means they are AT a top school - which is
    // the prioritisation the console sorts and panels on.
    isT20: schoolTier(l.school) === 1,
    // Submissions from admin/test accounts are dummy data, not real students -
    // the console badges them so they're never mistaken for the real thing.
    isTest: isAdminEmail(l.seller.email) || TEST_EMAILS.has(l.seller.email.toLowerCase()),
    admitProofs,
    essays: l.essays.map((e) => ({
      id: e.id,
      prompt: e.prompt,
      question: e.question,
      price: e.price,
      wordCount: e.wordCount,
      pdfPath: e.pdfPath,
      pdfUrl: (e.pdfPath && urlByPath.get(e.pdfPath)) || null,
    })),
    };
  });

  return NextResponse.json({ listings });
}

function safeParse(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

type LensRow = {
  key: string;
  label: string;
  pass: boolean;
  confidence: string;
  concerns: string[];
  // A note for the reviewer rather than a vote (lib/review.ts). Rows written
  // before advisory checks existed have no flag, and every one of them voted,
  // so a missing flag reads as false.
  advisory: boolean;
};

// aiLenses is JSON written by the review panel. Older rows predate the column,
// so treat anything unparseable as "no breakdown available" rather than failing
// the whole console request.
function safeParseLenses(s: string | null): LensRow[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    if (!Array.isArray(v)) return [];
    return v.map((r) => ({
      key: String(r?.key ?? ''),
      label: String(r?.label ?? r?.key ?? 'Lens'),
      pass: r?.pass === true,
      confidence: String(r?.confidence ?? 'low'),
      concerns: Array.isArray(r?.concerns) ? r.concerns.map(String).filter(Boolean) : [],
      advisory: r?.advisory === true,
    }));
  } catch {
    return [];
  }
}
