import 'server-only';
import { prisma } from '@/lib/prisma';
// WHAT THIS WRITES, AND WHEN. Read this before merging.
//
// ensureEssayWordCounts below performs a real write against the production
// database: prisma.essay.updateMany, filling Essay.wordCount. It is reached
// from lib/reviewRunner.ts, so it runs on every listing that passes through
// review after this deploys, which is three entry points: a seller finalizing a
// draft, the review cron picking up a pending listing, and the admin approval
// path. It is NOT limited to listings created after the deploy.
//
// It is guarded to fill blanks only. The updateMany matches `wordCount: null`,
// so a value that already exists is never overwritten and two paths reaching
// the same listing cannot fight.
//
// It is also not invisible. Essay.wordCount is already published by
// /api/listings, and essayGroupMeta in lib/publicListing.ts prints "N words" on
// a listing sheet row once that row has a count. So merging this starts showing
// lengths on listings reviewed afterwards while older ones stay blank, until
// the backfill fills the rest.
//
// WHY THIS IS ITS OWN BRANCH. This capture and
// scripts/backfill-essay-word-counts.mjs both shipped inside the listing value
// panel PR (#96), on the reading that only the backfill was a production write
// and the capture was not. That reading was wrong: both write, and Fatimah's
// "leave the production word count update out for now" covers both. They were
// lifted out of #96 and parked here so the panel PR is only the panel, which is
// what she reviewed, and so this work is intact if she wants it later.
//
// Nothing here has been run against production. The backfill is a hand-run
// step and stays unrun.

import {
  itemsToLines,
  linesToBlocks,
  loadPdfjsForTextExtraction,
} from '@/scripts/extract-opening-lines.mjs';
import { isPlausibleWordCount, wordCountFromBlocks } from '@/scripts/essay-word-count.mjs';

// Fill Essay.wordCount from the seller's own PDF.
//
// Five surfaces have rendered this field conditionally since it was added and
// so have rendered it never: the buyer's listing sheet, the admin panel, the
// seller dashboard and its total, and the reviewer's prompt. The wizard has
// never collected one and app/api/submit-listing writes `e?.wordCount` from a
// payload that has no such key, so every one of the 746 rows is null.
//
// WHY IT PARSES RATHER THAN REUSING THE OPENING-LINE RESULT
//
// lib/openingLine.ts already opens each PDF with pdfjs, but it reads page 1 and
// only falls through to page 2 when page 1 held under 400 characters, then
// stops at the first block it can use. That is the right shape for a one
// sentence hook and the wrong shape for a length: a three page essay would be
// counted at one page. This walks every page instead. It reuses that module's
// loader, its line assembly and its paragraph blocking, so there is one pdfjs
// setup and one text-geometry implementation in the repo, not two.
//
// WHY IT COSTS NO EXTRA DOWNLOAD
//
// It is handed buffers that lib/review.ts has already fetched for the review
// panel. Nothing here touches Supabase.

export type EssayPdfBuffer = { essayId: string; question: string | null; bytes: Buffer };

export type WordCountOutcome = {
  counted: number;
  stored: number;
  skipped: number;
  failed: number;
};

// A ceiling on the whole pass, not per file. pdfjs on a pathological PDF can
// take a long time, and this runs inside the same function invocation as the
// review panel, which has its own five minute budget to protect.
export const WORD_COUNT_BUDGET_MS = 20_000;

/** Count one already-downloaded PDF. Returns null for anything unreadable. */
export async function countWordsInPdf(bytes: Buffer, question: string | null): Promise<number | null> {
  const pdfjs = await loadPdfjsForTextExtraction();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: false,
  });
  const doc = await loadingTask.promise;
  try {
    const lines = [];
    for (let page = 1; page <= doc.numPages; page += 1) {
      lines.push(...itemsToLines((await (await doc.getPage(page)).getTextContent()).items));
    }
    const count = wordCountFromBlocks(linesToBlocks(lines), question);
    return isPlausibleWordCount(count) ? count : null;
  } finally {
    await loadingTask.destroy();
  }
}

/**
 * Store a word count for every essay that has no plausible one yet.
 *
 * Best effort in every direction. It only ever fills a null, so re-running is
 * free and a seller's own figure would never be overwritten if the wizard
 * started collecting one. A failed parse, an unreadable scan or a blown budget
 * leaves the row null, which every surface already renders as nothing at all.
 * It never throws.
 */
export async function ensureEssayWordCounts(pdfs: EssayPdfBuffer[]): Promise<WordCountOutcome> {
  const outcome: WordCountOutcome = { counted: 0, stored: 0, skipped: 0, failed: 0 };
  if (!pdfs.length) return outcome;

  const deadline = Date.now() + WORD_COUNT_BUDGET_MS;
  for (const pdf of pdfs) {
    if (Date.now() >= deadline) {
      outcome.skipped += pdfs.length - (outcome.counted + outcome.failed + outcome.skipped);
      break;
    }
    try {
      const count = await countWordsInPdf(pdf.bytes, pdf.question);
      if (count === null) {
        outcome.failed += 1;
        continue;
      }
      outcome.counted += 1;
      // updateMany with the null guard rather than update: the admin approval
      // path and the cron can both reach this for one listing, and whichever
      // arrives second must not rewrite a value the first one stored.
      const written = await prisma.essay.updateMany({
        where: { id: pdf.essayId, wordCount: null },
        data: { wordCount: count },
      });
      outcome.stored += written.count;
    } catch (error) {
      outcome.failed += 1;
      console.error(
        `word count failed for essay ${pdf.essayId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return outcome;
}
