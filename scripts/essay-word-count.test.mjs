// The word counting rules, and a real PDF round trip through pdfjs.
//
// Pure node: no server, no database, no network. The PDF is built in memory
// with pdf-lib, the same way scripts/opening-line.test.mjs builds one.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  countWords,
  isPlausibleWordCount,
  isPreamble,
  wordCountFromBlocks,
  MAX_PLAUSIBLE_WORDS,
  MIN_PLAUSIBLE_WORDS,
} from './essay-word-count.mjs';
import {
  itemsToLines,
  linesToBlocks,
  loadPdfjsForTextExtraction,
} from './extract-opening-lines.mjs';

let checks = 0;
const check = (fn) => { fn(); checks += 1; };

/* ------------------------------ countWords ------------------------------ */

check(() => assert.equal(countWords('one two three'), 3));
check(() => assert.equal(countWords('  leading and   trailing  '), 3));
check(() => assert.equal(countWords(''), 0));

check(() => {
  // A contraction, a hyphenated word and a number are one word each, which is
  // how a word processor counts and therefore how the seller counted.
  assert.equal(countWords("don't count 1,200 self-aware words"), 5);
});

check(() => {
  // pdfjs emits stray punctuation as its own text item. A bare dash, bullet or
  // quote mark is not a word.
  assert.equal(countWords('real words — here • and "so" on'), 6);
});

check(() => {
  // Non-Latin script still counts: \p{L} is not [a-z].
  assert.equal(countWords('我 的 名字 is Mei'), 5);
});

/* ------------------------------ isPreamble ------------------------------ */

check(() => assert.equal(isPreamble('Word count: 630 / 650 max', null), true));
check(() => assert.equal(isPreamble('Common Application Personal Statement Word count: 630', null), true));
check(() => assert.equal(isPreamble('Words: 412', null), true));
check(() => assert.equal(isPreamble('(650 words)', null), true));
check(() => assert.equal(isPreamble('Written by Jordan Alvarez', null), true));
check(() => assert.equal(isPreamble('By Jordan Alvarez', null), true));
check(() => assert.equal(isPreamble('Jordan Alvarez', null), true));
check(() => assert.equal(isPreamble('My Essay', null), true));

check(() => {
  // A known Common App option, verbatim.
  const prompt = 'Describe a topic, idea, or concept you find so engaging that it makes you lose all track of time. Why does it captivate you? What or who do you turn to when you want to learn more?';
  assert.equal(isPreamble(prompt, null), true);
});

check(() => {
  // A UC Personal Insight Question, verbatim.
  const piq = 'What would you say is your greatest talent or skill? How have you developed and demonstrated that talent over time?';
  assert.equal(isPreamble(piq, null), true);
});

check(() => {
  // The listing's own recorded question, which is the only defence for a
  // college-specific prompt that is not on either known list.
  const own = 'Tell us about a place or environment where you feel perfectly content. What do you do there and why is it meaningful to you?';
  assert.equal(isPreamble(own, own), true);
  assert.equal(isPreamble(own, null), false, 'unknown prompts are only caught via Essay.question');
});

check(() => {
  // Real prose must survive, including the shapes the opening-line extractor
  // deliberately rejects. Rejecting these would undercount by a paragraph.
  assert.equal(isPreamble('The kiln cracked on a Tuesday and I spent the rest of the year learning why.', null), false);
  // Second person: a student addressing the reader.
  assert.equal(isPreamble('You would have laughed at me, standing there with a broken mould in my hands.', null), false);
  // Imperative opening with no full stop, which is a legitimate short answer.
  assert.equal(isPreamble('Describe the smell of a workshop at six in the morning and you have my childhood', null), false);
  // A five word sentence.
  assert.equal(isPreamble('I was seven years old.', null), false);
});

/* -------------------------- wordCountFromBlocks -------------------------- */

check(() => {
  const blocks = [
    'Jordan Alvarez',
    'Word count: 612 / 650',
    'The kiln cracked on a Tuesday and I spent the rest of the year learning why.',
    'It took four more firings before I understood what the clay had been telling me.',
  ];
  // 16 + 15 = 31 words of prose, preamble dropped.
  assert.equal(wordCountFromBlocks(blocks, null), 31);
});

check(() => {
  // Once prose starts, everything after it counts, even a block that would have
  // been read as preamble on its own. A student quoting the question back at
  // themselves mid-essay is their writing.
  const blocks = [
    'I have rebuilt the same carburettor nine times and it still surprises me.',
    'My Essay',
  ];
  assert.equal(wordCountFromBlocks(blocks, null), 13 + 2);
});

check(() => assert.equal(wordCountFromBlocks([], null), null));
check(() => assert.equal(wordCountFromBlocks(['Jordan Alvarez'], null), null, 'preamble only is null, not zero'));

/* --------------------------- plausibility guard --------------------------- */

check(() => assert.equal(isPlausibleWordCount(null), false));
check(() => assert.equal(isPlausibleWordCount(0), false));
check(() => assert.equal(isPlausibleWordCount(MIN_PLAUSIBLE_WORDS - 1), false));
check(() => assert.equal(isPlausibleWordCount(MIN_PLAUSIBLE_WORDS), true));
check(() => assert.equal(isPlausibleWordCount(650), true));
check(() => assert.equal(isPlausibleWordCount(MAX_PLAUSIBLE_WORDS), true));
check(() => assert.equal(isPlausibleWordCount(MAX_PLAUSIBLE_WORDS + 1), false));
check(() => assert.equal(isPlausibleWordCount(612.5), false));

/* --------------------------- a real PDF, end to end --------------------------- */

// Two pages. The opening-line extractor reads page 1 and only reaches page 2
// when page 1 holds under 400 characters, so a count that stops at page 1 is
// exactly the bug this asserts against.
const PAGE_ONE_BODY = Array.from({ length: 12 }, (_, i) =>
  `Line ${i + 1} of the first page carries eight ordinary words here.`);
const PAGE_TWO_BODY = Array.from({ length: 6 }, (_, i) =>
  `Line ${i + 1} of the second page carries eight ordinary words here.`);

const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
for (const body of [PAGE_ONE_BODY, PAGE_TWO_BODY]) {
  const page = pdf.addPage([612, 792]);
  body.forEach((line, i) => {
    page.drawText(line, { x: 72, y: 700 - i * 22, size: 12, font });
  });
}
const bytes = Buffer.from(await pdf.save());

const pdfjs = await loadPdfjsForTextExtraction();
const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false });
const doc = await task.promise;
const lines = [];
for (let page = 1; page <= doc.numPages; page += 1) {
  lines.push(...itemsToLines((await (await doc.getPage(page)).getTextContent()).items));
}
await task.destroy();

const total = wordCountFromBlocks(linesToBlocks(lines), null);

check(() => assert.equal(doc.numPages, 2));
check(() => {
  // 18 lines of 11 words. The assertion that matters is that page two is in
  // there at all: a page-one-only count would be 132.
  const expected = (PAGE_ONE_BODY.length + PAGE_TWO_BODY.length) * 11;
  assert.equal(total, expected, `expected ${expected} words across both pages, got ${total}`);
  assert.ok(total > PAGE_ONE_BODY.length * 11, 'page two was not counted');
});
check(() => assert.equal(isPlausibleWordCount(total), true));

/* ---- the two production callers must walk EVERY page, not just the first ---- */

// The test above proves wordCountFromBlocks adds up whatever it is given. What
// it cannot prove from here is that the server path and the backfill hand it
// every page: lib/essayWordCount.ts is server-only and imports Prisma, so it
// cannot be imported into a plain node test. These read the source instead,
// which is what launch-hardening.test.mjs does for the pdfjs reader.
//
// This is the failure mode that matters. lib/openingLine.ts reads page 1 and
// conditionally page 2, and a word count that inherited that shape would
// silently report a three page essay at one page.
for (const file of ['../lib/essayWordCount.ts', '../scripts/backfill-essay-word-counts.mjs']) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  check(() => assert.match(
    source,
    /for \(let page = 1; page <= doc\.numPages; page \+= 1\)/,
    `${file} must loop over every page`,
  ));
  check(() => assert.doesNotMatch(
    source,
    /doc\.getPage\(2\)/,
    `${file} must not special-case page 2 the way the opening-line extractor does`,
  ));
  check(() => assert.match(source, /isPlausibleWordCount/, `${file} must apply the plausibility guard`));
}

// And the server path must only ever fill a null.
const server = fs.readFileSync(new URL('../lib/essayWordCount.ts', import.meta.url), 'utf8');
check(() => assert.match(server, /updateMany/, 'must not use update(), which would overwrite'));
check(() => assert.match(server, /wordCount: null/, 'the write must be guarded on the column being null'));

const backfill = fs.readFileSync(new URL('../scripts/backfill-essay-word-counts.mjs', import.meta.url), 'utf8');

// Anchored to the updateMany itself, not to the file. `wordCount: null` also
// appears in the findMany that selects the work, so a looser match passed while
// the write was unguarded. The mutation pass is what found that.
check(() => assert.match(
  backfill,
  /prisma\.essay\.updateMany\(\{\s*where: \{ id: essay\.id, wordCount: null \},/,
  'the backfill write must be guarded on the column being null',
));
check(() => assert.match(backfill, /const COMMIT = process\.argv\.includes\('--commit'\)/, 'writes must require --commit'));

// Both halves, in this order. indexOf returns -1 for a missing needle, and
// -1 is less than every real index, so an ordering check alone passed when the
// guard was deleted outright.
const guardAt = backfill.indexOf('if (!COMMIT) continue;');
const writeAt = backfill.indexOf('prisma.essay.updateMany');
check(() => assert.notEqual(guardAt, -1, 'the dry-run guard must exist'));
check(() => assert.notEqual(writeAt, -1, 'the write must exist'));
check(() => assert.ok(guardAt < writeAt, 'the dry-run guard must come before the write'));

console.log(`essay-word-count: ${checks} checks passed`);
