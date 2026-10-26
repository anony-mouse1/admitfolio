import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// The Fatimah's Guide cross-promo: every placement's link, where the banner is
// allowed, and the copy. Pure: reads source files, renders nothing, no network.

async function importTypeScript(file) {
  const source = await readFile(file, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const root = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const promo = await importTypeScript(new URL('../lib/crossPromo.ts', import.meta.url));

// ---- Links ----
// The exact shape Fatimah's analytics reads: source, medium, campaign, then
// the optional content, and the #consult anchor last.
const base = 'https://fatimahs.guide/?utm_source=admitfolio';
assert.equal(promo.crossPromoUrl('banner'), `${base}&utm_medium=banner&utm_campaign=crosspromo#consult`);
assert.equal(
  promo.crossPromoUrl('blog', 'uc-piq-examples'),
  `${base}&utm_medium=blog&utm_campaign=crosspromo&utm_content=uc-piq-examples#consult`,
);
assert.equal(
  promo.crossPromoUrl('purchase', 'reading'),
  `${base}&utm_medium=purchase&utm_campaign=crosspromo&utm_content=reading#consult`,
);
assert.equal(
  promo.crossPromoUrl('purchase', 'success'),
  `${base}&utm_medium=purchase&utm_campaign=crosspromo&utm_content=success#consult`,
);

// ---- Where the banner shows ----
for (const p of ['/', '/guides', '/guides/uc-piq-examples', '/essays', '/legit', '/privacy', '/purchases', '/administer']) {
  assert.equal(promo.crossPromoBannerAllowed(p), true, `banner shows on ${p}`);
}
for (const p of ['/admin', '/admin/', '/admin/payout-sandbox', '/ADMIN', '/purchase/success', '/purchase/abc.def', '/PURCHASE/x', '/purchase']) {
  assert.equal(promo.crossPromoBannerAllowed(p), false, `banner stays off ${p}`);
}

// ---- Copy ----
const copy = promo.CROSS_PROMO_COPY;
const lines = [
  ...Object.values(copy.bannerLong), ...Object.values(copy.bannerShort),
  copy.guideHeading, copy.guideBody, copy.readingHeading, copy.purchaseBody, copy.button,
];
for (const line of lines) assert.doesNotMatch(line, /[–—]/, `no em or en dash in "${line}"`);
const joined = (parts) => parts.lead + parts.emphasis + parts.tail;
assert.equal(
  joined(copy.bannerLong),
  "Want 1:1 help with your applications? Book a free call with Fatimah, Admitfolio's founder (bring a parent).",
);
assert.equal(joined(copy.bannerShort), "Free 1:1 call with Fatimah, Admitfolio's founder. Bring a parent.");
assert.equal(copy.guideBody, "Book a free call with Fatimah, Admitfolio's founder (bring a parent).");
assert.equal(copy.purchaseBody, "Book a free 1:1 call with Fatimah, Admitfolio's founder (bring a parent).");
for (const line of lines) assert.doesNotMatch(line, /\bwith\b[^.?!]*\bwith\b/i, `one "with" per sentence in "${line}"`);

// ---- Placements ----
// Every guide closes with the card, after Admitfolio's own call to action, and
// tags it with its own slug (guideBySlug's argument is the directory name).
const guideDirs = fs.readdirSync(path.join(root, 'app/guides'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
assert.equal(guideDirs.length, 8, 'eight guides');
for (const dir of guideDirs) {
  const page = read(`app/guides/${dir}/page.tsx`);
  assert.match(page, new RegExp(`guideBySlug\\('${dir}'\\)`), `${dir} reads its own registry entry`);
  assert.equal(page.split('<CrossPromoCard guide={guide.slug} />').length - 1, 1, `${dir} renders the card once`);
  assert.ok(
    page.lastIndexOf('styles.articleCta') < page.indexOf('<CrossPromoCard'),
    `${dir} puts the card after Admitfolio's own call to action`,
  );
}
assert.match(read('components/CrossPromoCard.tsx'), /crossPromoUrl\('blog', guide\)/);
assert.match(read('components/CrossPromoCard.tsx'), /data-cross-promo-card/, 'the banner can see the card');

// Both purchase pages, each with its own content tag, and neither leaks the
// reading page's URL as a referrer.
for (const [file, content] of [['app/purchase/[token]/page.tsx', 'reading'], ['app/purchase/success/page.tsx', 'success']]) {
  const page = read(file);
  assert.match(page, new RegExp(`crossPromoUrl\\('purchase', '${content}'\\)`), `${file} tags utm_content=${content}`);
  assert.match(page, /target="_blank" rel="noopener noreferrer"/, `${file} opens a new tab without a referrer`);
}

// The banner is mounted once, in the root layout, and reads and writes
// localStorage only inside try.
assert.equal(read('app/layout.tsx').split('<CrossPromoBanner />').length - 1, 1);
const banner = read('components/CrossPromoBanner.tsx');
assert.match(banner, /crossPromoUrl\('banner'\)/);
for (const line of banner.split('\n').filter((l) => /localStorage\./.test(l))) {
  assert.match(line, /try \{/, `localStorage access is wrapped: ${line.trim()}`);
}

// None of it touches the database.
for (const file of ['lib/crossPromo.ts', 'components/CrossPromoBanner.tsx', 'components/CrossPromoCard.tsx']) {
  assert.doesNotMatch(read(file), /prisma/i, `${file} does not touch the database`);
}

console.log('cross promo tests passed');
