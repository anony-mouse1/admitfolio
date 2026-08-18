// Fill Listing.openingLine with the first sentence of the seller's own essay.
//
//   node --env-file=.env scripts/extract-opening-lines.mjs           (dry run)
//   node --env-file=.env scripts/extract-opening-lines.mjs --confirm (writes)
//
// Only listings with an empty `teaser` are touched, and only ones that do not
// already have an openingLine, so it is safe to re-run and cheap the second time.
//
// Terms §Ownership grants the right to "excerpt ... and market" a listed essay
// (app/terms/page.tsx), so no consent step is needed.
//
// WHY THIS IS FIDDLY, from a previous attempt that got it wrong several ways:
//
//  - Sellers paste the college's prompt into the top of their own PDF, so the
//    first block of text is very often the question rather than the essay. The
//    defences below are, in order of how much work they do: a blocklist of the
//    UC and Common App prompts, the listing's own `question` field, and a
//    second-person/imperative test. Prompts are written in the second person
//    ("Tell us about a time you..."), essays in the first.
//  - Do NOT require first person to accept a line. The best openings in this
//    corpus are third-person scene setting ("The new student stumbled while
//    others moved in synchrony").
//  - MLA running heads ("Surname 3") and "By <Name>" bylines carry the seller's
//    real name. If they survive, a real name lands on a public card.
//  - pdfjs emits the spaces between words as their own text items in many PDFs.
//    Drop those items and words glue together ("bush filled" -> "bushfilled").
//  - Node 20 has no Promise.withResolvers, which pdfjs 5 needs, and no global
//    WebSocket, which @supabase/supabase-js needs for its realtime client. Hence
//    the polyfill below and the plain fetch calls to the storage REST API.

if (!Promise.withResolvers) {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

import { PrismaClient } from '@prisma/client';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'node:module';
// Rejects a candidate line containing the seller's own name. Lives in its own
// file so it can be tested without a database: node scripts/name-leak.test.mjs
import { nameLeak } from './name-leak.mjs';

const require = createRequire(import.meta.url);
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

const CONFIRM = process.argv.includes('--confirm');
const QUIET = process.env.QUIET === '1';
const CLIP_MAX = Number(process.env.CLIP_MAX || 150);
const BUCKET = 'essays';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');

async function download(path) {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!res.ok) throw new Error(`download ${path}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/* ----------------------------- text geometry ----------------------------- */

// Rebuild reading order from item positions: pdfjs emits in content-stream
// order, which is not reading order in plenty of generators.
function itemsToLines(items) {
  const rows = new Map();
  for (const it of items) {
    if (!it.str) continue; // keep whitespace-only items, they ARE the spaces
    const y = Math.round(it.transform[5] / 2) * 2;
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(it);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, its]) => {
      its.sort((a, b) => a.transform[4] - b.transform[4]);
      let text = '';
      let prevEnd = null;
      let h = 0;
      for (const it of its) {
        const x = it.transform[4];
        if (!it.str.trim()) {
          if (text && !/\s$/.test(text)) text += ' ';
          prevEnd = Math.max(prevEnd ?? x, x + (it.width || 0));
          continue;
        }
        h = Math.max(h, it.height || Math.abs(it.transform[3]) || 12);
        if (prevEnd !== null && x - prevEnd > h * 0.25 && !/\s$/.test(text)) text += ' ';
        text += it.str;
        prevEnd = x + (it.width || 0);
      }
      const left = Math.min(...its.map((i) => i.transform[4]));
      return { y, h, width: prevEnd - left, text: text.replace(/\s+/g, ' ').trim() };
    })
    .filter((l) => l.text && !isRunningHead(l.text));
}

// "Surname 3" on every page is MLA, and it carries a real name.
function isRunningHead(t) {
  return (
    /^\d{1,3}$/.test(t) ||
    /^page\s+\d{1,3}(\s+of\s+\d{1,3})?$/i.test(t) ||
    /^[A-Z][A-Za-z'’-]{1,20}\s+\d{1,3}$/.test(t) ||
    /^\d{1,3}\s+[A-Z][A-Za-z'’-]{1,20}$/.test(t)
  );
}

const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

function linesToBlocks(lines) {
  if (!lines.length) return [];
  const gaps = lines.slice(1).map((l, i) => lines[i].y - l.y);
  const medGap = median(gaps);
  const medWidth = median(lines.map((l) => l.width));
  const blocks = [];
  let cur = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const gap = prev.y - lines[i].y;
    // A short line ending in terminal punctuation ends a paragraph. Requiring it
    // to be properly short matters: at 0.75 of median width this over-split, and
    // a prompt got separated from the second-person text that would have caught it.
    const paraEnd = /[.?!"”']$/.test(prev.text) && prev.width < medWidth * 0.5;
    if ((medGap && gap > medGap * 1.6) || paraEnd) { blocks.push(cur); cur = []; }
    cur.push(lines[i]);
  }
  blocks.push(cur);
  return blocks.map((b) => b.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/* -------------------------------- filtering ------------------------------- */

const UC_PIQS = [
  'Describe an example of your leadership experience in which you have positively influenced others, helped resolve disputes or contributed to group efforts over time.',
  'Every person has a creative side, and it can be expressed in many ways: problem solving, original and innovative thinking, and artistically, to name a few. Describe how you express your creative side.',
  'What would you say is your greatest talent or skill? How have you developed and demonstrated that talent over time?',
  'Describe how you have taken advantage of a significant educational opportunity or worked to overcome an educational barrier you have faced.',
  'Describe the most significant challenge you have faced and the steps you have taken to overcome this challenge. How has this challenge affected your academic achievement?',
  'Think about an academic subject that inspires you. Describe how you have furthered this interest inside and/or outside of the classroom.',
  'What have you done to make your school or your community a better place?',
  'Beyond what has already been shared in your application, what do you believe makes you stand out as a strong candidate for admissions to the University of California?',
];
const COMMON_APP = [
  'Some students have a background, identity, interest, or talent that is so meaningful they believe their application would be incomplete without it. If this sounds like you, then please share your story.',
  'The lessons we take from obstacles we encounter can be fundamental to later success. Recount a time when you faced a challenge, setback, or failure. How did it affect you, and what did you learn from the experience?',
  'Reflect on a time when you questioned or challenged a belief or idea. What prompted your thinking? What was the outcome?',
  'Reflect on something that someone has done for you that has made you happy or thankful in a surprising way. How has this gratitude affected or motivated you?',
  'Discuss an accomplishment, event, or realization that sparked a period of personal growth and a new understanding of yourself or others.',
  'Describe a topic, idea, or concept you find so engaging that it makes you lose all track of time. Why does it captivate you? What or who do you turn to when you want to learn more?',
  "Share an essay on any topic of your choice. It can be one you've already written, one that responds to a different prompt, or one of your own design.",
];
const KNOWN_PROMPTS = [...UC_PIQS, ...COMMON_APP];

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

function shingles(s, n = 5) {
  const w = norm(s).split(' ');
  const out = new Set();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

// Symmetric, so it catches both "this block is the whole prompt" and "this block
// is a retyped fragment of it".
function shingleMatch(a, b) {
  const A = shingles(a), B = shingles(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const s of B) if (A.has(s)) hit++;
  const fwd = hit / B.size;
  hit = 0;
  for (const s of A) if (B.has(s)) hit++;
  return Math.max(fwd, hit / A.size);
}

const FIRST_PERSON = /\b(i|i'm|i've|i'd|i'll|my|me|mine|myself)\b/gi;
const SECOND_PERSON = /\b(you|your|yourself|tell us|describe|discuss|reflect on|explain|share|respond|elaborate|recount|prompt|essay option|word limit)\b/gi;
const count = (s, re) => (s.match(re) || []).length;

// Note the ['’]: these PDFs use curly apostrophes, and a straight-quote regex
// silently matches nothing.
const BYLINE_PREFIX = /^(written\s+by|submitted\s+by|by)\s+[A-Z][\w'’.-]*(\s+[A-Z][\w'’.-]*){0,3}\s*[–—\-:|]\s*/i;
const stripByline = (b) => b.replace(BYLINE_PREFIX, '').trim();

// Sellers label their own text: "Answer: It's the third time I've run up three
// flights of stairs...". The label is not part of the essay.
const stripLabel = (b) => b.replace(/^(answer|response|essay|my answer|my response)\s*[:\-–—]\s*/i, '').trim();

// Sellers head each supplement with the college it is for. Strip that so the
// prompt underneath is exposed to the tests below; a doubled header is never prose.
function stripSchoolHeader(block, names) {
  for (const n of names) {
    const re = new RegExp('^' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s:,.\\-–—]*', 'i');
    if (!re.test(block)) continue;
    const rest = block.replace(re, '').trim();
    if (!rest || re.test(rest)) return null;
    return rest;
  }
  return block;
}

function junkReason(block, question) {
  const words = block.split(/\s+/);
  // A block that never ends a sentence is a title or a header, not prose. This
  // used to be length-gated at 40 characters, which let through a 76-character
  // essay title ("My Opung's Gift: A Memoir of Love, Resilience, and ...").
  if (!/[.?!]/.test(block)) return 'no-sentence-end';
  // Anywhere in the block, not just at the start: sellers write
  // "Common Application Personal Statement Word count: 630 / 650 max" as one
  // header line, and anchoring to the start missed it.
  if (/\bword count\b/i.test(block)) return 'word-count';
  if (/^\s*(words?\s*[:\-]|\(?\d{1,4}\s*words)/i.test(block)) return 'word-count';
  // Students head their PDF with their own name.
  if (words.length <= 4 && words.every((w) => /^[A-Z][A-Za-z'’.-]*$/.test(w)) && !/[.?!]$/.test(block)) {
    return 'looks-like-a-name';
  }
  if (/\b(written|submitted)\s+by\s+[A-Z]/i.test(block)) return 'byline';
  if (/^by\s+[A-Z][a-z]+\s+[A-Z][a-z]/i.test(block)) return 'byline';
  for (const p of KNOWN_PROMPTS) if (shingleMatch(block, p) >= 0.6) return 'known-prompt';
  if (question && shingleMatch(block, question) >= 0.6) return 'listing-question';
  if (count(block, SECOND_PERSON) > count(block, FIRST_PERSON)) return 'second-person';
  if (/^(please|describe|discuss|explain|tell|reflect|recount|share|respond)\b/i.test(block)) return 'imperative-opening';
  return null;
}

const ABBREV = /\b(mr|mrs|ms|dr|st|jr|sr|prof|vs|u\.s|e\.g|i\.e|a\.m|p\.m)\.$/i;

// Up to two sentences: one is often too short to be a hook ("I was seven.").
function firstSentences(block) {
  const parts = [];
  const re = /([.?!]+["”’']?)(\s+)(?=["“'(]?[A-Z0-9])/g;
  let last = 0, m;
  while ((m = re.exec(block))) {
    const chunk = block.slice(last, m.index + m[1].length);
    if (ABBREV.test(chunk)) continue;
    parts.push(chunk.trim());
    last = m.index + m[0].length;
  }
  if (last < block.length) parts.push(block.slice(last).trim());
  if (!parts.length) return block;
  let out = parts[0];
  if (out.length < 60 && parts[1]) out += ' ' + parts[1];
  return out;
}

const CONTINUATION = /^(that (was|is|would|changed)|this (was|is|changed)|i['’]?(ve| have) also|i also|also[,\s]|additionally|furthermore|moreover|in addition|then[,\s]|so[,\s]|and (then|so)|it was then)\b/i;

function unusable(s) {
  const words = s.trim().split(/\s+/);
  if (words.length < 5) return 'too-few-words';
  if (CONTINUATION.test(s)) return 'continuation';
  if (/[ﬀ-ﬆ]/.test(s)) return 'ligature-soup';
  if (!/\s/.test(s)) return 'no-spaces';
  if (words.some((w) => w.length > 25)) return 'glued-text';
  if (s === s.toUpperCase()) return 'all-caps';
  if ((s.match(/[^\x20-\x7E‘’“”—–…]/g) || []).length / s.length > 0.05) return 'non-text-glyphs';
  return null;
}

// Some PDFs lose the opening quote of a line of dialogue.
function repairQuotes(s) {
  const marks = (s.match(/["“”]/g) || []).length;
  if (marks % 2 === 0 || /^["“]/.test(s)) return s;
  if (!/[,.!?]["”]/.test(s)) return s;
  return (s.includes('”') ? '“' : '"') + s;
}

function clip(t, max) {
  const s = t.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max), sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-]+$/, '') + '…';
}

function score(s) {
  let n = 0;
  if (/\b(i|my|me)\b/i.test(s)) n += 2;
  if (s.length >= 50 && s.length <= 120) n += 1;
  if (/\b\w+ed\b/i.test(s)) n += 1;
  if (/^["“]/.test(s)) n += 1; // dialogue openings are the best hooks
  return n;
}

function essaySpecificity(prompt, essayCount) {
  if (essayCount <= 1) return 0;
  // A Common App statement is often reused verbatim inside several different
  // college packages. Prefer the package's school-specific supplement so the
  // public hook distinguishes what the buyer is actually shopping for.
  if (/common app.*personal statement/i.test(prompt || '')) return -6;
  if (/(why-school|supplement|short answer|intellectual vitality|community|activity)/i.test(prompt || '')) return 3;
  return 0;
}

/* ---------------------------------- main --------------------------------- */

const prisma = new PrismaClient();

// `seller.name` is here only so nameLeak can reject a line containing it. It is
// never written anywhere and never printed.
const select = {
  id: true, sellerId: true, school: true, admitTags: true,
  seller: { select: { name: true } },
  essays: { select: { pdfPath: true, prompt: true, question: true }, orderBy: { sortOrder: 'asc' } },
};
const noTeaser = { status: 'approved', OR: [{ teaser: null }, { teaser: '' }] };

// Vercel applies the migration on merge to main, so before that lands the column
// exists in schema.prisma but not in the database. Rather than fail, fall back to
// extraction-only: every line still gets printed for review, and --confirm is
// refused because there is nowhere to put them.
let listings;
let columnLive = true;
try {
  listings = await prisma.listing.findMany({ where: { ...noTeaser, openingLine: null }, select, orderBy: { createdAt: 'asc' } });
} catch (e) {
  if (e?.code !== 'P2022') throw e;
  columnLive = false;
  listings = await prisma.listing.findMany({ where: noTeaser, select, orderBy: { createdAt: 'asc' } });
  console.log('NOTE: Listing.openingLine is not in the database yet, so this is a preview.');
  console.log('      Merge the migration to main (Vercel runs prisma migrate deploy), then re-run.\n');
}

console.log(`${listings.length} approved listings have no teaser and no opening line yet\n`);

const stats = { filled: 0, noText: 0, noCandidate: 0, failed: 0, nameRejected: 0, duplicateSkipped: 0 };
// Listings where a block was skipped because it held the seller's name. Counted
// so the dry run says how often the guard fired; the line itself is never
// printed, because printing it would put the name back on a screen.
const nameHits = new Set();
const results = [];
const usedOpenings = new Map();
const openingKey = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

if (columnLive) {
  const existing = await prisma.listing.findMany({
    where: { openingLine: { not: null } },
    select: { sellerId: true, openingLine: true },
  });
  for (const row of existing) {
    if (!usedOpenings.has(row.sellerId)) usedOpenings.set(row.sellerId, new Set());
    usedOpenings.get(row.sellerId).add(openingKey(row.openingLine));
  }
}

for (const l of listings) {
  let names = [];
  try {
    const tags = JSON.parse(l.admitTags);
    names = [l.school, ...(Array.isArray(tags) ? tags : [])].filter((s) => s && s.length > 3)
      .sort((a, b) => b.length - a.length);
  } catch { names = [l.school]; }
  const candidates = [];
  for (const essay of l.essays) {
    if (!essay.pdfPath) continue;
    let blocks, chars;
    try {
      const doc = await pdfjs.getDocument({
        data: new Uint8Array(await download(essay.pdfPath)),
        isEvalSupported: false,
        useSystemFonts: false,
      }).promise;
      let lines = itemsToLines((await (await doc.getPage(1)).getTextContent()).items);
      chars = lines.reduce((n, x) => n + x.text.length, 0);
      if (chars < 400 && doc.numPages > 1) {
        lines = lines.concat(itemsToLines((await (await doc.getPage(2)).getTextContent()).items));
      }
      blocks = linesToBlocks(lines);
      await doc.destroy();
    } catch (e) {
      stats.failed++;
      continue;
    }
    if (!chars) { stats.noText++; continue; }

    for (const raw of blocks.slice(0, 8)) {
      const block = stripSchoolHeader(stripLabel(stripByline(raw)), names);
      if (!block || junkReason(block, essay.question || '')) continue;
      const sentence = repairQuotes(firstSentences(block));
      if (unusable(sentence)) continue;
      // Do not break: fall through to the next block and take that opening
      // instead. Most essays that name the writer do it in the first paragraph
      // only, so the second one is usually clean.
      if (nameLeak(sentence, l.seller?.name)) {
        stats.nameRejected++;
        nameHits.add(l.id);
        continue;
      }
      candidates.push({
        raw: sentence,
        score: score(sentence) + essaySpecificity(essay.prompt, l.essays.length),
      });
      break;
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length) { stats.noCandidate++; continue; }
  if (!usedOpenings.has(l.sellerId)) usedOpenings.set(l.sellerId, new Set());
  const used = usedOpenings.get(l.sellerId);
  const chosen = candidates.find((candidate) => !used.has(openingKey(candidate.raw)));
  if (!chosen) { stats.duplicateSkipped++; continue; }
  used.add(openingKey(chosen.raw));
  results.push({ id: l.id, school: l.school, line: clip(chosen.raw, CLIP_MAX) });
  stats.filled++;
  if (!QUIET) process.stdout.write(`\r${results.length} extracted   `);
}

console.log('\n');
if (!QUIET) results.forEach((r, i) => console.log(`${String(i + 1).padStart(3)}. ${r.line}`));
console.log('\n', stats);
if (nameHits.size) {
  console.log(`\n${stats.nameRejected} block(s) across ${nameHits.size} listing(s) were skipped for`);
  console.log('holding the seller\'s own name. Those listings took a later block, or none.');
}

if (CONFIRM && !columnLive) {
  console.error('\nRefusing to write: Listing.openingLine does not exist in the database yet.');
  await prisma.$disconnect();
  process.exit(1);
}

if (!CONFIRM) {
  console.log('\nDRY RUN. Nothing written. Re-read every line above, then re-run with --confirm.');
  console.log('nameLeak now rejects the seller\'s own name, but it only knows the name on the');
  console.log('account: a nickname, a sibling or a friend named in the prose still gets through,');
  console.log('and so does a prompt the shingle test missed.');
  await prisma.$disconnect();
  process.exit(0);
}

for (const r of results) {
  await prisma.listing.update({ where: { id: r.id }, data: { openingLine: r.line } });
}
console.log(`\nwrote ${results.length} opening lines`);
await prisma.$disconnect();
