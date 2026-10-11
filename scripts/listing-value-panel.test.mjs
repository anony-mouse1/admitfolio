// The "What you get" panel's pure logic: grouping, the meta column, and the
// per-essay price.
//
// Every shape asserted here was measured against the live catalogue on
// 2026-09-18, read only: 192 purchasable listings, 563 essays, 75 listings
// repeating a prompt label, 61 once the question text is taken into account,
// 383 rows after grouping, at most 8 groups in a listing, at most 9 essays in
// one group, prices from $20 to $346.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// The real lib/publicListing.ts, transpiled and imported the way the other
// tests import lib/*.ts. Nothing is re-declared here, so a change to the
// grouping rules that this file does not expect fails it rather than passing
// against a copy. Its two runtime imports are inlined as nested data URLs;
// the third is a type and the transpile erases it.
const compile = (path) => ts.transpileModule(
  fs.readFileSync(new URL(path, import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } },
).outputText;
const dataUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;

const relink = (source, specifier, target) => {
  const statement = `from '${specifier}'`;
  assert.ok(source.includes(statement), `expected an import ${statement} in lib/publicListing.ts`);
  return source.replace(statement, `from '${target}'`);
};

let publicListing = compile('../lib/publicListing.ts');
publicListing = relink(publicListing, './schools', dataUrl(compile('../lib/schools.ts')));
publicListing = relink(publicListing, './listingSchool', dataUrl(compile('../lib/listingSchool.ts')));

const listing = (essays, extra = {}) => ({
  id: 'l1',
  school: 'Cornell University',
  targetSchool: null,
  admitTags: [],
  price: 100,
  teaser: null,
  openingLine: null,
  appliedMajors: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  essays,
  seller: { displayName: 'A seller', backgroundTags: [] },
  ...extra,
});

const essay = (prompt, question = null, wordCount = null) => ({ prompt, question, wordCount });

const {
  essayGroups,
  essayGroupMeta,
  perEssayPrice,
} = await import(dataUrl(publicListing));

let checks = 0;
const check = (name, fn) => { fn(); checks += 1; };

/* ------------------------------ grouping ------------------------------ */

check('four identical prompts collapse to one row', () => {
  const groups = essayGroups(listing([
    essay('UC · Personal Insight Question'),
    essay('UC · Personal Insight Question'),
    essay('UC · Personal Insight Question'),
    essay('UC · Personal Insight Question'),
  ]));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 4);
  assert.equal(groups[0].label, 'UC · Personal Insight Question');
});

check('the largest run measured in the catalogue is one row of nine', () => {
  const groups = essayGroups(listing(Array.from({ length: 9 }, () => essay('UC · Personal Insight Question'))));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 9);
});

check('same prompt with DIFFERENT question text stays separate rows', () => {
  // The 14 listings that repeat a prompt label but carry distinct seller text.
  // Grouping on the prompt alone would merge these and delete the only words on
  // the sheet that say what they are.
  const groups = essayGroups(listing([
    essay('Other supplement', 'Describe a community you belong to.'),
    essay('Other supplement', 'What would you change about your high school?'),
    essay('Other supplement', 'Name a book you argued with.'),
  ]));
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map((g) => g.count), [1, 1, 1]);
});

check('the row heading is the preset prompt, never the seller question', () => {
  // essayLabel substitutes the question on "Other" rows. The panel prints the
  // question underneath, so using it here rendered the same sentence twice.
  const q = 'Why are you interested in the major you indicated as your first choice?';
  const groups = essayGroups(listing([essay('Other supplement', q)]));
  assert.equal(groups[0].label, 'Other supplement');
  assert.equal(groups[0].question, q);
  assert.ok(!groups[0].label.startsWith('Why are you'), 'the question leaked into the heading');
});

check('same prompt AND same question do collapse', () => {
  const groups = essayGroups(listing([
    essay('Other supplement', 'Why this college?'),
    essay('Other supplement', 'Why this college?'),
  ]));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
});

check('blank and null question text are the same key', () => {
  const groups = essayGroups(listing([
    essay('Short answer', null),
    essay('Short answer', '   '),
  ]));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].question, null);
});

check('rows keep the seller submission order', () => {
  const groups = essayGroups(listing([
    essay('Short answer'),
    essay('Common App · Personal Statement'),
    essay('Short answer'),
  ]));
  assert.deepEqual(groups.map((g) => g.label), ['Short answer', 'Common App · Personal Statement']);
  assert.deepEqual(groups.map((g) => g.count), [2, 1]);
});

/* ---------------------------- the meta column ---------------------------- */

check('a single-group listing prints no count, the header already said it', () => {
  const groups = essayGroups(listing(Array.from({ length: 4 }, () => essay('UC · Personal Insight Question'))));
  assert.equal(essayGroupMeta(groups[0], groups.length), null);
});

check('a multi-group listing prints the count on the grouped row only', () => {
  const groups = essayGroups(listing([
    essay('Common App · Personal Statement'),
    essay('Why-school · Supplement'),
    essay('Why-school · Supplement'),
  ]));
  assert.equal(essayGroupMeta(groups[0], groups.length), null);
  assert.equal(essayGroupMeta(groups[1], groups.length), '2 essays');
});

check('word count renders for one essay', () => {
  const groups = essayGroups(listing([
    essay('Common App · Personal Statement', null, 631),
    essay('Short answer', null, 98),
  ]));
  assert.equal(essayGroupMeta(groups[0], groups.length), '631 words');
});

check('a group whose counts agree prints "each"', () => {
  const groups = essayGroups(listing([
    essay('Short answer', null, 98),
    essay('Short answer', null, 98),
    essay('Common App · Personal Statement', null, 600),
  ]));
  assert.equal(essayGroupMeta(groups[0], groups.length), '2 essays · 98 words each');
});

check('a group whose counts differ prints a range', () => {
  const groups = essayGroups(listing([
    essay('Why-school · Supplement', null, 288),
    essay('Why-school · Supplement', null, 219),
    essay('Common App · Personal Statement', null, 600),
  ]));
  assert.equal(essayGroupMeta(groups[0], groups.length), '2 essays · 219 to 288 words');
});

check('ONE null in a group suppresses the whole length, no partial claim', () => {
  const groups = essayGroups(listing([
    essay('Why-school · Supplement', null, 288),
    essay('Why-school · Supplement', null, null),
    essay('Common App · Personal Statement', null, 600),
  ]));
  assert.equal(groups[0].words, null);
  assert.equal(essayGroupMeta(groups[0], groups.length), '2 essays');
});

check('a null count in the FIRST position also suppresses it', () => {
  // Order matters to the accumulator, so both directions are checked.
  const groups = essayGroups(listing([
    essay('Why-school · Supplement', null, null),
    essay('Why-school · Supplement', null, 288),
    essay('Common App · Personal Statement', null, 600),
  ]));
  assert.equal(groups[0].words, null);
  assert.equal(essayGroupMeta(groups[0], groups.length), '2 essays');
});

check('today\'s catalogue: every count null means the meta is a count or nothing', () => {
  const groups = essayGroups(listing([
    essay('Common App · Personal Statement'),
    essay('Why-school · Supplement'),
    essay('Why-school · Supplement'),
  ]));
  assert.equal(essayGroupMeta(groups[0], groups.length), null);
  assert.equal(essayGroupMeta(groups[1], groups.length), '2 essays');
  for (const g of groups) assert.equal(g.words, null);
});

check('a zero word count is not treated as a missing one', () => {
  // wordCount is Int? in the schema. 0 is falsy, so a truthiness check here
  // would silently drop it; the guard is `!= null`.
  const groups = essayGroups(listing([essay('Short answer', null, 0)]));
  assert.deepEqual(groups[0].words, { min: 0, max: 0 });
});

/* --------------------------- per-essay price --------------------------- */

check('per-essay price rounds UP, never down and never to nearest', () => {
  // $100 over 6 essays is $16.67. Floor would advertise $16, nearest $17, and
  // both let a reader multiply back to less than the package price printed
  // immediately above.
  const six = [essay('a'), essay('b'), essay('c'), essay('d'), essay('e'), essay('f')];
  assert.equal(perEssayPrice(listing(six, { price: 100 })), 17);
  // $110 over 6 is $18.33, where nearest rounds DOWN to 18 and ceil does not.
  assert.equal(perEssayPrice(listing(six, { price: 110 })), 19);
});

check('the measured worst case, $346 over 18 essays, prints $20', () => {
  const essays = Array.from({ length: 18 }, (_, i) => essay(`p${i}`));
  assert.equal(perEssayPrice(listing(essays, { price: 346 })), 20);
});

check('exact division is exact', () => {
  assert.equal(perEssayPrice(listing([essay('a'), essay('b'), essay('c'), essay('d')], { price: 96 })), 24);
  assert.equal(perEssayPrice(listing([essay('a'), essay('b'), essay('c'), essay('d'), essay('e')], { price: 140 })), 28);
});

check('any remainder at all rounds up', () => {
  assert.equal(perEssayPrice(listing([essay('a'), essay('b')], { price: 45 })), 23);
  // One cent over is still a whole dollar up: $41 over 20 is $2.05.
  const twenty = Array.from({ length: 20 }, (_, i) => essay(`p${i}`));
  assert.equal(perEssayPrice(listing(twenty, { price: 41 })), 3);
});

check('single essay gets no per-essay line', () => {
  assert.equal(perEssayPrice(listing([essay('a')], { price: 20 })), null);
});

check('no price, no line', () => {
  assert.equal(perEssayPrice(listing([essay('a'), essay('b')], { price: null })), null);
  assert.equal(perEssayPrice(listing([essay('a'), essay('b')], { price: 0 })), null);
});

check('across the whole catalogue range, unit x count never falls below the price', () => {
  // The property that matters, stated as the reader would check it: multiply
  // the printed unit back up and you must not land under what you are charged.
  // Every price the catalogue carries, every plausible essay count.
  for (let price = 20; price <= 346; price += 1) {
    for (let n = 2; n <= 18; n += 1) {
      const unit = perEssayPrice(listing(Array.from({ length: n }, (_, i) => essay(`p${i}`)), { price }));
      assert.ok(unit * n >= price, `${price} over ${n} printed ${unit}, which multiplies back to ${unit * n}`);
      // And never gratuitously high: at most a dollar above the true figure.
      assert.ok(unit - price / n < 1, `${price}/${n} gave ${unit}`);
    }
  }
});

console.log(`listing-value-panel: ${checks} checks passed`);
