#!/usr/bin/env node

// The read time in lib/guides.ts, recomputed from a rendered article.
//
//   npx next start -p 3000        # or npx next dev -p 3000
//   node scripts/guide-read-time.mjs
//   APP_URL=https://admitfolio.com node scripts/guide-read-time.mjs
//
// Why this exists. f453223 corrected all seven read times, every one of which
// overstated its article and one by more than three times, and recorded the
// method only in its commit message: "the visible text of the rendered
// production pages, table of contents included, at 225 words a minute, the
// midpoint of 200 to 250, and rounded to the nearest minute." That sentence
// does not say which parts of the page were counted, and the next person to add
// an article has to guess. This is the answer, reverse engineered from the
// seven published numbers and then pinned against them.
//
// The scope is the article's own text: the headline, the dek, the stat block,
// the table of contents, the summary and the body. It excludes site chrome (the
// nav, the footer, the back link, the category pill and the byline) and it
// excludes the related-guides cards and the closing call to action, which are
// navigation rather than reading. That scope reproduces all seven published
// counts to within two words, which is entity and apostrophe tokenising noise.
//
// Plain fetch, no browser, no database. Reads only.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const WORDS_PER_MINUTE = 225;

// The counts f453223 published, and the ones this script has to reproduce.
const PUBLISHED = {
  'how-to-take-inspiration-from-college-essays': 882,
  'common-app-essay-examples': 547,
  'uc-piq-examples': 771,
  'how-to-start-a-college-essay': 705,
  'why-this-college-essay-examples': 710,
  'college-essay-format': 660,
  'common-app-essay-word-count': 579,
};
const TOLERANCE = 2;

const toDataUrl = (source) => {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
};

// lib/guides.ts imports lib/site.ts for guideUrl, which a data URL cannot
// resolve by relative path. Transpile that first and point the import at it,
// the same way scripts/sitemap.test.mjs does.
const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const site = toDataUrl(await read('lib/site.ts'));
const registrySource = await read('lib/guides.ts');
assert.ok(registrySource.includes("from './site'"), 'expected lib/guides.ts to import ./site');
const { guides } = await import(toDataUrl(registrySource.replace("from './site'", `from '${site}'`)));

const text = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&#x27;|&#39;/gi, "'")
  .replace(/&quot;/gi, '"')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&[a-z]+;|&#\d+;/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const countWords = (html) => {
  const words = text(html);
  return words ? words.split(' ').length : 0;
};

// The inner HTML of the first element carrying a class containing `fragment`.
// CSS module class names are hashed but the authored name survives inside them.
function region(html, fragment) {
  const open = new RegExp(`<(\\w+)[^>]*class="[^"]*${fragment}[^"]*"[^>]*>`).exec(html);
  if (!open) return null;
  const tag = open[1];
  const scan = new RegExp(`<(/?)${tag}\\b`, 'g');
  scan.lastIndex = open.index + open[0].length;
  let depth = 1;
  let match;
  while ((match = scan.exec(html))) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return html.slice(open.index + open[0].length, match.index);
  }
  return html.slice(open.index + open[0].length);
}

function articleWords(html, slug) {
  const need = (fragment) => {
    const found = region(html, fragment);
    assert.ok(found !== null, `${slug}: no .${fragment} on the rendered page`);
    return found;
  };
  // The header holds the pill, the h1, the dek and the byline. Only the h1 and
  // the dek are the article; the other two are chrome and are subtracted.
  const header = need('articleHeader');
  const chrome = countWords(region(header, 'pill') || '') + countWords(region(header, 'byline') || '');
  return countWords(header) - chrome
    + countWords(need('articleStat'))
    + countWords(need('articleToc'))
    + countWords(need('articleSummary'))
    + countWords(need('articleBody'));
}

const minutes = (words) => Math.round(words / WORDS_PER_MINUTE);
const label = (words) => `${minutes(words)} min read`;

console.log(`\n${appUrl}  at ${WORDS_PER_MINUTE} words a minute\n`);
console.log('slug'.padEnd(44), 'words', 'computed', 'registry', 'published');

let failures = 0;
for (const guide of guides) {
  const response = await fetch(`${appUrl}/guides/${guide.slug}`);
  assert.equal(response.status, 200, `/guides/${guide.slug} answered ${response.status}`);
  const words = articleWords(await response.text(), guide.slug);
  const computed = label(words);
  const published = PUBLISHED[guide.slug];
  const drift = published === undefined ? '' : `${published} (${Math.abs(words - published)} off)`;
  const agrees = computed === guide.readTime;
  const reproduces = published === undefined || Math.abs(words - published) <= TOLERANCE;
  if (!agrees || !reproduces) failures += 1;
  console.log(
    guide.slug.padEnd(44),
    String(words).padStart(5),
    computed.padStart(8),
    `${guide.readTime.padStart(8)}${agrees ? ' ' : ' <- registry disagrees'}`,
    `${drift}${reproduces ? '' : ' <- method no longer reproduces the published count'}`,
  );
}

console.log('');
if (failures) {
  console.error(`${failures} article(s) need attention. Put the computed value in lib/guides.ts.`);
  process.exit(1);
}
console.log('every read time in lib/guides.ts is what the rendered article counts to.');
