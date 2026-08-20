import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  directIdentifierReason,
  junkReason,
  loadPdfjsForTextExtraction,
  openingKey,
  stripResaleNotice,
} from './extract-opening-lines.mjs';

// Reproduce the Vercel server-bundle condition: pdfjs cannot reach its optional
// native canvas shim, so it has no DOMMatrix to install for itself. Our lazy
// loader must make importing pdfjs safe before any production route uses it.
const originalGetBuiltinModule = process.getBuiltinModule;
process.getBuiltinModule = undefined;
delete globalThis.DOMMatrix;
const pdfjs = await loadPdfjsForTextExtraction();
assert.equal(typeof globalThis.DOMMatrix, 'function');
assert.equal(typeof pdfjs.getDocument, 'function');
const samplePdf = await PDFDocument.create();
const samplePage = samplePdf.addPage([300, 200]);
const sampleFont = await samplePdf.embedFont(StandardFonts.Helvetica);
samplePage.drawText('Admitfolio review route works', { x: 30, y: 120, size: 14, font: sampleFont });
const sampleBytes = await samplePdf.save();
const parsedPdf = await pdfjs.getDocument({
  data: new Uint8Array(sampleBytes),
  isEvalSupported: false,
  useSystemFonts: false,
}).promise;
const sampleText = (await (await parsedPdf.getPage(1)).getTextContent()).items
  .map((item) => item.str || '')
  .join(' ');
assert.match(sampleText, /Admitfolio review route works/);
await parsedPdf.destroy();
process.getBuiltinModule = originalGetBuiltinModule;

assert.equal(
  junkReason(
    'WBB SPECIFIC 1. What experiences and/or skills best prepare you for success in our World Bachelor in Business program? I learned to lead by listening.',
    '',
  ),
  'numbered-prompt',
);
assert.equal(
  junkReason('“Why’s it bleeding?” I asked, staring at the red swirl in the sink.', ''),
  null,
);
assert.equal(
  junkReason('Why are you interested in Rensselaer Polytechnic Institute? (250) The architecture program caught my attention.', ''),
  'prompt-with-word-limit',
);
assert.equal(
  junkReason('State your reasons for choosing architecture as your profession (500-750 words).', ''),
  'prompt-with-word-range',
);
assert.equal(
  junkReason("Rensselaer's Principles of Community supports access and inclusion by affirming the dignity of every person.", ''),
  'institutional-prompt',
);
assert.equal(
  junkReason("Virginia Tech's motto is 'Ut Prosim' which means 'That I May Serve'.", ''),
  'institutional-prompt',
);
assert.equal(
  openingKey('“Why’s it bleeding?” I asked.'),
  openingKey('Why’s it bleeding I asked'),
);
assert.equal(
  stripResaleNotice('Those who carry their heritage DO NOT RESELL OR REDISTRIBUTE within them.'),
  'Those who carry their heritage within them.',
);
assert.equal(directIdentifierReason('Email me at student@example.edu for details.'), 'email');
assert.equal(directIdentifierReason('The curtains at 123 Main Street were always blue.'), 'street-address');
assert.equal(directIdentifierReason('My phone screen lights up.'), null);

const decisionSource = await readFile(new URL('../lib/listingDecision.ts', import.meta.url), 'utf8');
const reviewSource = await readFile(new URL('../lib/reviewRunner.ts', import.meta.url), 'utf8');
const openingSource = await readFile(new URL('../lib/openingLine.ts', import.meta.url), 'utf8');
const pageSource = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
assert.match(decisionSource, /decision === 'approved'[\s\S]+ensureListingOpeningLine\(id\)/);
assert.match(reviewSource, /ensureListingOpeningLine\(listing\.id\)/);
assert.doesNotMatch(openingSource, /status: 'seller_teaser'/);
assert.match(pageSource, /listing\.openingLine \|\| listing\.teaser/);

console.log('opening-line tests passed');
