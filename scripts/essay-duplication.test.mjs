import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// lib/essayDuplication imports lib/schools and lib/listingSchool, and
// transpileModule does not resolve imports, so each dependency is inlined as a
// nested data URL the same way scripts/seller-drafts.test.mjs does it.
const compile = (path) => ts.transpileModule(
  fs.readFileSync(new URL(path, import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } },
).outputText;
const dataUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;

const schools = dataUrl(compile('../lib/schools.ts'));
const listingSchool = dataUrl(compile('../lib/listingSchool.ts'));
const duplication = compile('../lib/essayDuplication.ts')
  .replace("from './schools'", `from '${schools}'`)
  .replace("from './listingSchool'", `from '${listingSchool}'`);
const { conflictsForSameSchool, findSameSchoolConflict } = await import(dataUrl(duplication));

const listing = (targetSchool, admits = []) => ({ targetSchool, admitTags: JSON.stringify(admits) });

// The case the rule exists for: the same file twice for one college.
assert.equal(
  conflictsForSameSchool(listing('Harvard University'), 'Harvard College'),
  true,
  'the same college spelled differently is still the same college',
);
assert.equal(conflictsForSameSchool(listing('Yale'), 'Yale University'), true);

// The case the rule used to break: one Common App essay across two colleges.
assert.equal(
  conflictsForSameSchool(listing('Harvard University'), 'Yale University'),
  false,
  'one Common App essay is submitted to every school, so reuse across colleges is legitimate',
);
assert.equal(conflictsForSameSchool(listing('Stanford'), 'MIT'), false);

// Free text must resolve, never substring match.
assert.equal(
  conflictsForSameSchool(listing('Penn State'), 'University of Pennsylvania'),
  false,
  'Penn State is not UPenn',
);
assert.equal(
  conflictsForSameSchool(listing('University of Pennsylvania'), 'UPenn'),
  true,
  'UPenn is University of Pennsylvania',
);

// Legacy rows with no explicit target.
assert.equal(
  conflictsForSameSchool(listing(null, ['Cornell University']), 'Cornell'),
  true,
  'a legacy listing with exactly one admit resolves to that college',
);
assert.equal(
  conflictsForSameSchool(listing(null, ['Cornell University']), 'Brown'),
  false,
  'a legacy listing with one admit does not conflict with a different college',
);
assert.equal(
  conflictsForSameSchool(listing(null, ['Duke', 'Emory']), 'Emory'),
  true,
  'a legacy listing with several admits conflicts with any college it claims',
);
assert.equal(
  conflictsForSameSchool(listing(null, ['Duke', 'Emory']), 'Rice'),
  false,
  'and not with a college it does not claim',
);

// An unresolvable incoming college keeps the older, stricter answer.
assert.equal(conflictsForSameSchool(listing('Harvard'), null), true);
assert.equal(conflictsForSameSchool(listing('Harvard'), '   '), true);

// The finder returns the offending row, or null when every reuse is allowed.
const candidates = [
  { listing: listing('Yale University') },
  { listing: listing('Harvard University') },
];
assert.equal(findSameSchoolConflict(candidates, 'Harvard College'), candidates[1]);
assert.equal(findSameSchoolConflict(candidates, 'Princeton'), null);
assert.equal(findSameSchoolConflict([], 'Harvard'), null);

// The rule is enforced from three routes. It drifted apart once already
// between client and server, so every caller must go through the shared module
// and none may keep an unscoped cross-listing block.
const routes = {
  'app/api/seller/drafts/[id]/finalize/route.ts': 'draft finalize',
  'app/api/submit-listing/route.ts': 'direct submit',
  'app/api/upload-essay/route.ts': 'essay upload',
};
for (const [path, label] of Object.entries(routes)) {
  const source = fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  assert.match(source, /findSameSchoolConflict/, `${label} must use the shared duplicate rule`);
  assert.doesNotMatch(
    source,
    /already in another active listing/,
    `${label} must not keep the old message that blocked reuse across colleges`,
  );
}

console.log('essay duplication tests passed');
