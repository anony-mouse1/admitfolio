// Fill Essay.wordCount for essays that were submitted before anything computed
// one. Every row in the catalogue is null: the wizard never collected a word
// count and /api/submit-listing wrote `e?.wordCount` from a payload with no
// such key, so the column has been plumbed end to end and populated nowhere.
//
//   node --env-file=.env.local scripts/backfill-essay-word-counts.mjs            (dry run)
//   node --env-file=.env.local scripts/backfill-essay-word-counts.mjs --commit   (writes)
//
// THIS HAS NOT BEEN RUN. Not even the dry run. DATABASE_URL in this checkout is
// the production Supabase project, and the contract covering this work
// authorises reads and not writes. It ships unrun for Fatimah to run, or to
// authorise being run.
//
// From merge onward new listings do not need it: lib/essayWordCount.ts stores a
// count during the review pass that already runs on every finalize. This exists
// only for the rows that predate that.
//
// SAFETY, in the order it matters:
//   - Dry run by default. --commit is the only thing that writes.
//   - Only ever fills a null. `updateMany` is guarded on `wordCount: null`, so a
//     value stored by the live path between the read and the write survives.
//   - Resumable. It selects the nulls that are left, so a run that dies halfway
//     is finished by running it again. Nothing is remembered between runs.
//   - Batched, with progress, so a long run is watchable and interruptible.
//   - Prints the number of rows it intends to touch, and waits, before writing.

if (!Promise.withResolvers) {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

import { PrismaClient } from '@prisma/client';
import {
  download,
  itemsToLines,
  linesToBlocks,
  loadPdfjsForTextExtraction,
} from './extract-opening-lines.mjs';
// The same rules lib/essayWordCount.ts uses during review, so the number this
// stores and the number the live path stores cannot disagree.
import { isPlausibleWordCount, wordCountFromBlocks } from './essay-word-count.mjs';


const COMMIT = process.argv.includes('--commit');
const BATCH = Number(process.env.BATCH || 25);
// Seconds between printing the plan and the first write, so an accidental
// --commit can still be stopped with ctrl-C after the numbers are on screen.
const HOLD_SECONDS = Number(process.env.HOLD_SECONDS || 10);

const prisma = new PrismaClient();

async function countOne(essay) {
  const bytes = await download(essay.pdfPath);
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
    const count = wordCountFromBlocks(linesToBlocks(lines), essay.question);
    return isPlausibleWordCount(count) ? count : null;
  } finally {
    await loadingTask.destroy();
  }
}

function summarise(counts) {
  if (!counts.length) return 'none';
  const sorted = [...counts].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return `min ${sorted[0]}, p25 ${at(0.25)}, median ${at(0.5)}, p75 ${at(0.75)}, max ${sorted[sorted.length - 1]}`;
}

async function main() {
  // Resumable by construction: this is the work that is LEFT, not a fixed list
  // computed once. A rerun after a crash simply finds fewer rows.
  const pending = await prisma.essay.findMany({
    where: { wordCount: null, pdfPath: { not: null } },
    select: {
      id: true,
      pdfPath: true,
      question: true,
      listing: { select: { status: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const noPdf = await prisma.essay.count({ where: { wordCount: null, pdfPath: null } });
  const alreadySet = await prisma.essay.count({ where: { wordCount: { not: null } } });
  const byStatus = pending.reduce((acc, e) => {
    acc[e.listing.status] = (acc[e.listing.status] || 0) + 1;
    return acc;
  }, {});

  console.log(`mode                : ${COMMIT ? 'COMMIT, this run WILL write' : 'DRY RUN, nothing will be written'}`);
  console.log(`already have a count: ${alreadySet}`);
  console.log(`no PDF, unfixable   : ${noPdf}`);
  console.log(`ROWS IT INTENDS TO TOUCH: ${pending.length}`);
  console.log(`  by listing status : ${JSON.stringify(byStatus)}`);
  console.log(`batch size          : ${BATCH}`);
  console.log('');

  if (!pending.length) {
    console.log('Nothing to do.');
    await prisma.$disconnect();
    return;
  }

  if (COMMIT) {
    console.log(`Writing in ${HOLD_SECONDS}s. Ctrl-C now to stop.`);
    await new Promise((r) => setTimeout(r, HOLD_SECONDS * 1000));
    console.log('');
  }

  const counted = [];
  let written = 0;
  let unreadable = 0;
  let failed = 0;

  for (let start = 0; start < pending.length; start += BATCH) {
    const batch = pending.slice(start, start + BATCH);
    for (const essay of batch) {
      let count = null;
      try {
        count = await countOne(essay);
      } catch (error) {
        failed += 1;
        console.error(`  ${essay.id}: ${error instanceof Error ? error.message : error}`);
        continue;
      }
      if (count === null) {
        unreadable += 1;
        continue;
      }
      counted.push(count);
      if (!COMMIT) continue;
      // Guarded on null so a count stored by lib/essayWordCount.ts while this
      // was running is never overwritten.
      const result = await prisma.essay.updateMany({
        where: { id: essay.id, wordCount: null },
        data: { wordCount: count },
      });
      written += result.count;
    }
    const done = Math.min(start + BATCH, pending.length);
    console.log(
      `progress ${done}/${pending.length}  counted ${counted.length}  ` +
      `${COMMIT ? `written ${written}  ` : ''}no text ${unreadable}  errors ${failed}`,
    );
  }

  console.log('');
  console.log(`counted    : ${counted.length}`);
  console.log(`distribution: ${summarise(counted)}`);
  console.log(`no text    : ${unreadable}  (scanned PDFs and the like; these stay null)`);
  console.log(`errors     : ${failed}`);
  if (COMMIT) {
    console.log(`WRITTEN    : ${written}`);
  } else {
    console.log('');
    console.log('DRY RUN. Nothing was written.');
    console.log('Read the distribution above before committing: a number that looks wrong for a');
    console.log('college essay means the extraction is wrong, and it would land on public cards.');
    console.log('Re-run with --commit to write.');
  }
  await prisma.$disconnect();
}

await main();
