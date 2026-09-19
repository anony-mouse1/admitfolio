// How long an essay is, decided from text already pulled out of a PDF.
//
// No pdfjs, no Supabase, no Prisma, so scripts/essay-word-count.test.mjs can
// exercise every rule below against plain strings.
//
// It lives under scripts/ rather than lib/ for the same reason name-leak.mjs
// does: both the server path (lib/essayWordCount.ts) and the one-time backfill
// (scripts/backfill-essay-word-counts.mjs) import it, and the backfill is a
// plain .mjs that cannot import TypeScript. One implementation, so the number
// stored during review and the number stored by the backfill cannot disagree.
//
// The buyer-facing figure this produces is the only claim on the listing sheet
// that is computed rather than typed by a seller, so the bias is deliberately
// towards undercounting: a package that reads longer than advertised is a
// better failure than one that reads shorter.

import { KNOWN_PROMPTS, shingleMatch } from './extract-opening-lines.mjs';

// A token is a word when it contains at least one letter or digit. That keeps
// "don't", "3D" and "1,200" as one word each and drops a bare em dash, a bullet
// glyph and the stray punctuation pdfjs emits as its own text item.
const WORDY = /[\p{L}\p{N}]/u;

export function countWords(text) {
  return text.split(/\s+/).filter((token) => WORDY.test(token)).length;
}

// Sellers paste the college's prompt into the top of their own PDF. Counting it
// inflates the essay by the length of a question the buyer is not buying, which
// on a 650-word personal statement is around eight per cent.
//
// This test is deliberately narrower than junkReason in extract-opening-lines.
// That one decides whether a block is a good public hook and rejects plenty of
// real prose doing it: a paragraph addressed to the reader trips
// `second-person`, a short answer with no full stop trips `no-sentence-end`.
// Rejecting real prose here would undercount by a whole paragraph, so only the
// unambiguous signals are used.
export function isPreamble(block, question) {
  const text = (block || '').trim();
  if (!text) return true;

  // "Common Application Personal Statement Word count: 630 / 650 max"
  if (/\bword count\b/i.test(text)) return true;
  if (/^\s*(words?\s*[:\-]|\(?\d{1,4}\s*words)/i.test(text)) return true;

  // "Written by <Name>", "By <Name>"
  if (/\b(written|submitted)\s+by\s+[A-Z]/i.test(text)) return true;
  if (/^by\s+[A-Z][a-z]+\s+[A-Z][a-z]/i.test(text)) return true;

  // A bare name or title line with no sentence in it.
  if (text.split(/\s+/).length <= 4 && !/[.?!]/.test(text)) return true;

  // The prompt itself: one of the eight UC questions or seven Common App
  // options, or whatever this listing recorded in Essay.question.
  for (const prompt of KNOWN_PROMPTS) {
    if (shingleMatch(text, prompt) >= 0.6) return true;
  }
  const own = (question || '').trim();
  if (own && shingleMatch(text, own) >= 0.6) return true;

  return false;
}

/**
 * The word count for one essay, from the paragraph blocks of its PDF.
 *
 * Leading preamble is dropped. Once real prose starts everything after it
 * counts, because a prompt restated mid-essay is far rarer than a student
 * quoting a question back at themselves.
 *
 * Returns null when there is nothing to count, so a scanned PDF with no text
 * layer produces silence on the listing sheet rather than a zero.
 */
export function wordCountFromBlocks(blocks, question) {
  let started = false;
  let total = 0;
  for (const block of blocks) {
    if (!started && isPreamble(block, question)) continue;
    started = true;
    total += countWords(block);
  }
  return total > 0 ? total : null;
}

// Guards against a parse that goes wrong in a way that still returns a number.
// The longest single essay a college asks for is the Common App's 650 words. A
// package PDF holding several essays can legitimately run long, so the ceiling
// is loose and is only there to stop a garbled extraction putting something
// absurd on a public card.
export const MIN_PLAUSIBLE_WORDS = 5;
export const MAX_PLAUSIBLE_WORDS = 5000;

export function isPlausibleWordCount(n) {
  return n !== null && Number.isInteger(n) && n >= MIN_PLAUSIBLE_WORDS && n <= MAX_PLAUSIBLE_WORDS;
}
