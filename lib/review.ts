import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY, REVIEW_MODEL } from '@/lib/config';
import { supabaseAdmin, ESSAYS_BUCKET } from '@/lib/supabase';

// The automated reviewer panel. Each pending submission is screened by three
// specialized Claude "lenses" running concurrently; they vote. A submission is
// auto-approved ONLY when every lens passes with high confidence and no
// concerns. Anything else - a fail, low/medium confidence, any concern, or a
// review error - is flagged for the human admin. We never auto-reject.

type Confidence = 'high' | 'medium' | 'low';
type LensVerdict = { pass: boolean; confidence: Confidence; concerns: string[] };

// One lens's verdict as the admin console renders it. Persisted as JSON on the
// listing so the full review is readable later - including for auto-approved
// submissions, where the aggregate `reasons` is empty by design.
export type LensReport = {
  key: string;
  label: string;
  pass: boolean;
  confidence: Confidence;
  concerns: string[];
};

export type PanelResult = {
  decision: 'approved' | 'flagged';
  confidence: Confidence;
  reasons: string; // human-readable, shown to the admin on flagged listings
  suggestion: 'approve' | 'reject' | null; // pre-fills the flagged action; null when unreviewed
  lenses: LensReport[]; // per-lens breakdown; empty when the panel could not run
};

// Minimal shape the panel needs from a listing (with essays included).
export type ReviewableListing = {
  school: string;
  major: string | null;
  appliedMajors: string | null;
  admitTags: string; // JSON array string
  essays: {
    id: string;
    prompt: string;
    question: string | null;
    wordCount: number | null;
    pdfPath: string | null;
  }[];
};

type EssayPdf = {
  prompt: string;
  question: string | null;
  wordCount: number | null;
  base64: string;
};

// Download every uploaded essay PDF from the private Supabase bucket and encode
// it as base64 so it can ride along as a document block in the review request.
export async function fetchEssayPdfsBase64(listing: ReviewableListing): Promise<EssayPdf[]> {
  const pdfs: EssayPdf[] = [];
  for (const essay of listing.essays) {
    if (!essay.pdfPath) continue;
    const { data, error } = await supabaseAdmin.storage.from(ESSAYS_BUCKET).download(essay.pdfPath);
    if (error || !data) {
      throw new Error(`failed to download ${essay.pdfPath}: ${error?.message ?? 'no data'}`);
    }
    const buf = Buffer.from(await data.arrayBuffer());
    pdfs.push({
      prompt: essay.prompt,
      question: essay.question,
      wordCount: essay.wordCount,
      base64: buf.toString('base64'),
    });
  }
  return pdfs;
}

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['pass', 'confidence', 'concerns'],
  properties: {
    pass: { type: 'boolean' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    concerns: { type: 'array', items: { type: 'string' } },
  },
} as const;

type Lens = { key: string; label: string; system: string };

const LENSES: Lens[] = [
  {
    key: 'authenticity',
    label: 'Authenticity',
    system:
      'You are reviewing a college-admission essay submitted to a marketplace where admitted students sell their real essays. ' +
      'Judge AUTHENTICITY and INTEGRITY: is this a genuine, human-written, coherent first-person college essay - not AI-generated boilerplate, not a plagiarized or generic template - and is it consistent with the claimed school, major, and prompt? ' +
      'pass=false if it reads as machine-generated, templated, plagiarized, or clearly inconsistent with the stated metadata. ' +
      'confidence reflects how sure you are. List concrete concerns; empty array if none.',
  },
  {
    key: 'policy',
    label: 'Policy & safety',
    system:
      'You are a content-policy reviewer for a college-essay marketplace. ' +
      'Check POLICY and SAFETY: the file must be a real, readable essay (not blank, corrupt, or the wrong document); it must contain no contact information or attempts to take the transaction off-platform, no exposed sensitive personal data (e.g. SSNs, home addresses, phone numbers), and nothing offensive, hateful, or otherwise inappropriate. ' +
      'pass=false if any of these are violated. confidence reflects certainty. List concrete concerns; empty array if none.',
  },
  {
    key: 'quality',
    label: 'Quality & fit',
    system:
      'You are a quality reviewer for a college-essay marketplace. ' +
      'Judge QUALITY and CONSISTENCY: the essay should meet a reasonable quality bar for a piece that got a student admitted, be on-topic for the stated prompt/question, and roughly match the claimed word count. ' +
      'pass=false if it is very low quality, off-topic, or grossly inconsistent with the claimed word count. confidence reflects certainty. List concrete concerns; empty array if none.',
  },
];

function buildUserContent(listing: ReviewableListing, pdfs: EssayPdf[]): Anthropic.MessageParam['content'] {
  const admits = safeParseTags(listing.admitTags);
  const meta =
    `Submission metadata:\n` +
    `- School (essays are for): ${listing.school}\n` +
    `- Seller's current major: ${listing.major ?? '(not given)'}\n` +
    `- Major(s) applied to with these essays: ${listing.appliedMajors ?? '(not given)'}\n` +
    `- Schools admitted to: ${admits.length ? admits.join(', ') : '(none listed)'}\n` +
    `- Essays in this submission (${pdfs.length}):\n` +
    pdfs
      .map(
        (p, i) =>
          `  ${i + 1}. prompt: ${p.prompt}` +
          (p.question ? ` — "${p.question}"` : '') +
          (p.wordCount != null ? ` (claimed word count: ${p.wordCount})` : ''),
      )
      .join('\n');

  // PDFs first, then the metadata + instruction text (documents before text).
  const content: Anthropic.MessageParam['content'] = pdfs.map((p) => ({
    type: 'document' as const,
    source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: p.base64 },
  }));
  content.push({
    type: 'text',
    text:
      `${meta}\n\n` +
      `Review the attached essay PDF(s) against your assigned criteria and return your verdict as JSON ` +
      `matching the required schema (pass, confidence, concerns).`,
  });
  return content;
}

async function runLens(
  client: Anthropic,
  lens: Lens,
  content: Anthropic.MessageParam['content'],
): Promise<LensVerdict> {
  try {
    // Cast keeps us resilient to output_config typing differences across SDK
    // minor versions; the wire shape follows the structured-outputs contract.
    const resp = await client.messages.create({
      model: REVIEW_MODEL,
      max_tokens: 4096,
      system: lens.system,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: VERDICT_SCHEMA } },
      messages: [{ role: 'user', content }],
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (resp.stop_reason === 'refusal') {
      return errVerdict('automated review was refused by the safety system');
    }
    const text = resp.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text;
    if (!text) return errVerdict('empty review response');
    const parsed = JSON.parse(text) as Partial<LensVerdict>;
    return normalizeVerdict(parsed);
  } catch (e) {
    return errVerdict(`review error: ${e instanceof Error ? e.message : 'unknown'}`);
  }
}

// Run the three lenses concurrently and aggregate into a single decision.
export async function runReviewPanel(
  listing: ReviewableListing,
  pdfs: EssayPdf[],
): Promise<PanelResult> {
  // Dev fallback: with no key configured we cannot review, so flag - never
  // silently auto-approve. Mirrors lib/email.ts's "simulate when unconfigured".
  if (!ANTHROPIC_API_KEY) {
    console.log(`[review:dev] no ANTHROPIC_API_KEY - flagging "${listing.school}" for manual review`);
    return {
      decision: 'flagged',
      confidence: 'low',
      reasons: 'Automated review is not configured (no ANTHROPIC_API_KEY); needs manual review.',
      suggestion: null,
      lenses: [],
    };
  }
  if (pdfs.length === 0) {
    return {
      decision: 'flagged',
      confidence: 'low',
      reasons: 'No essay PDFs were available to review.',
      suggestion: null,
      lenses: [],
    };
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const content = buildUserContent(listing, pdfs);
  const verdicts = await Promise.all(LENSES.map((lens) => runLens(client, lens, content)));

  const allPass = verdicts.every((v) => v.pass);
  const allHigh = verdicts.every((v) => v.confidence === 'high');
  const noConcerns = verdicts.every((v) => v.concerns.length === 0);
  const decision: PanelResult['decision'] =
    allPass && allHigh && noConcerns ? 'approved' : 'flagged';

  const confidence = verdicts
    .map((v) => v.confidence)
    .reduce((lo, c) => (CONFIDENCE_RANK[c] < CONFIDENCE_RANK[lo] ? c : lo), 'high' as Confidence);

  const labeledConcerns = LENSES.flatMap((lens, i) =>
    verdicts[i].concerns.map((c) => `[${lens.label}] ${c}`),
  );
  const reasons =
    decision === 'approved'
      ? ''
      : labeledConcerns.length > 0
        ? labeledConcerns.join('\n')
        : 'The panel passed the submission but not with full confidence.';

  const suggestion: PanelResult['suggestion'] =
    decision === 'approved' ? 'approve' : allPass ? 'approve' : 'reject';

  const lenses: LensReport[] = LENSES.map((lens, i) => ({
    key: lens.key,
    label: lens.label,
    pass: verdicts[i].pass,
    confidence: verdicts[i].confidence,
    concerns: verdicts[i].concerns,
  }));

  return { decision, confidence, reasons, suggestion, lenses };
}

function normalizeVerdict(v: Partial<LensVerdict>): LensVerdict {
  const confidence: Confidence =
    v.confidence === 'high' || v.confidence === 'medium' || v.confidence === 'low'
      ? v.confidence
      : 'low';
  return {
    pass: v.pass === true,
    confidence,
    concerns: Array.isArray(v.concerns) ? v.concerns.map(String).filter(Boolean) : [],
  };
}

function errVerdict(message: string): LensVerdict {
  return { pass: false, confidence: 'low', concerns: [message] };
}

function safeParseTags(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
