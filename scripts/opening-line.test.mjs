import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { junkReason, openingKey } from './extract-opening-lines.mjs';

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
  openingKey('“Why’s it bleeding?” I asked.'),
  openingKey('Why’s it bleeding I asked'),
);

const decisionSource = await readFile(new URL('../lib/listingDecision.ts', import.meta.url), 'utf8');
const reviewSource = await readFile(new URL('../lib/reviewRunner.ts', import.meta.url), 'utf8');
assert.match(decisionSource, /decision === 'approved'[\s\S]+ensureListingOpeningLine\(id\)/);
assert.match(reviewSource, /ensureListingOpeningLine\(listing\.id\)/);

console.log('opening-line tests passed');
