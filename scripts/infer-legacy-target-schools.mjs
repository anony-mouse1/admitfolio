// Recover the target school for legacy listings from the seller's own essay
// metadata and PDF text. The old onboarding saved only the multi-school
// "Schools you got into with these essays" array, so array order and the
// seller's current university are deliberately ignored.
//
//   node --env-file=.env scripts/infer-legacy-target-schools.mjs
//   node --env-file=.env scripts/infer-legacy-target-schools.mjs --confirm
//
// Dry-run is the default. The script prints only listing ids and school labels,
// never essay text or seller information.

if (!Promise.withResolvers) {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import ts from 'typescript';

const require = createRequire(import.meta.url);
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

const CONFIRM = process.argv.includes('--confirm');
const BUCKET = 'essays';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');

// Reuse the application's school aliases instead of maintaining a second map
// in a one-off data script. TypeScript is already a project dependency.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schoolSource = fs.readFileSync(path.join(root, 'lib/schools.ts'), 'utf8');
const schoolOutput = ts.transpileModule(schoolSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: 'lib/schools.ts',
}).outputText;
const schoolModule = path.join(os.tmpdir(), `admitfolio-schools-${process.pid}.cjs`);
fs.writeFileSync(schoolModule, schoolOutput);
const { schoolInfo } = require(schoolModule);

const prisma = new PrismaClient();

function parseAdmits(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).map((v) => v.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function normalise(value) {
  return ` ${String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

function occurrences(haystack, needle) {
  if (!needle.trim() || needle.trim().length < 4) return 0;
  let count = 0;
  let from = 0;
  while ((from = haystack.indexOf(needle, from)) !== -1) {
    count++;
    from += needle.length;
  }
  return count;
}

function schoolNeedles(label) {
  const info = schoolInfo(label);
  const raw = normalise(label);
  const canonical = info ? normalise(info.short) : '';
  return [...new Set([raw, canonical].filter((value) => value.trim().length >= 4))];
}

async function download(storagePath) {
  const encoded = storagePath.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encoded}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!response.ok) throw new Error(`download ${storagePath}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function pdfText(storagePath) {
  const doc = await pdfjs.getDocument({
    data: await download(storagePath),
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str || '').join(' '));
    }
  } finally {
    await doc.destroy();
  }
  return pages.join(' ');
}

function scoreSchools(admits, metadataText, documents) {
  const metadata = normalise(metadataText);
  const firstPages = normalise(documents.map((text) => text.slice(0, 1800)).join(' '));
  const fullText = normalise(documents.join(' '));
  return admits.map((school) => {
    const needles = schoolNeedles(school);
    const metadataHits = Math.max(...needles.map((needle) => occurrences(metadata, needle)), 0);
    const headingHits = Math.max(...needles.map((needle) => occurrences(firstPages, needle)), 0);
    const fullHits = Math.max(...needles.map((needle) => occurrences(fullText, needle)), 0);
    return {
      school,
      score: metadataHits * 8 + headingHits * 4 + fullHits,
      metadataHits,
      headingHits,
      fullHits,
    };
  }).sort((a, b) => b.score - a.score);
}

const listings = await prisma.listing.findMany({
  where: { status: 'approved', targetSchool: null },
  orderBy: { createdAt: 'asc' },
  select: {
    id: true,
    admitTags: true,
    teaser: true,
    sellerNote: true,
    essays: {
      orderBy: { sortOrder: 'asc' },
      select: { prompt: true, question: true, pdfPath: true },
    },
  },
});

const ambiguous = listings.filter((listing) => parseAdmits(listing.admitTags).length > 1);
const inferred = [];
let downloadFailures = 0;

for (let index = 0; index < ambiguous.length; index++) {
  const listing = ambiguous[index];
  const admits = parseAdmits(listing.admitTags);
  const documents = [];
  for (const essay of listing.essays) {
    if (!essay.pdfPath) continue;
    try {
      documents.push(await pdfText(essay.pdfPath));
    } catch {
      downloadFailures++;
    }
  }
  const metadataText = [
    listing.teaser,
    listing.sellerNote,
    ...listing.essays.flatMap((essay) => [essay.prompt, essay.question]),
  ].filter(Boolean).join(' ');
  const scores = scoreSchools(admits, metadataText, documents);
  const first = scores[0];
  const second = scores[1];
  // A school must appear in a prompt/question or near the start of a PDF. A
  // lone mention deep in an essay can be another institution discussed by the
  // writer, so it is not enough to relabel a paid product.
  const strongEvidence = first && (first.metadataHits > 0 || first.headingHits > 0);
  const clearLead = first && (!second || second.score === 0 || first.score - second.score >= 4);
  if (strongEvidence && clearLead) inferred.push({ id: listing.id, targetSchool: first.school, score: first.score });
  process.stdout.write(`\rChecked ${index + 1} of ${ambiguous.length}`);
}

console.log(`\n\n${ambiguous.length} approved multi-school listings have no saved target school`);
console.log(`${inferred.length} have one school supported by their prompts or PDF headings`);
console.log(`${ambiguous.length - inferred.length} still have no safe one-school answer in the saved submission`);
console.log(`${downloadFailures} PDF download or parsing failures`);
for (const row of inferred) console.log(`${row.id}\t${row.targetSchool}\tscore ${row.score}`);

if (!CONFIRM) {
  console.log('\nDRY RUN. Nothing written. Re-run with --confirm only after reviewing every inferred row.');
  await prisma.$disconnect();
  fs.unlinkSync(schoolModule);
  process.exit(0);
}

const results = await prisma.$transaction(
  inferred.map((row) => prisma.listing.updateMany({
    where: { id: row.id, status: 'approved', targetSchool: null },
    data: { targetSchool: row.targetSchool },
  })),
);
console.log(`\nWrote ${results.reduce((sum, result) => sum + result.count, 0)} target schools.`);
await prisma.$disconnect();
fs.unlinkSync(schoolModule);
