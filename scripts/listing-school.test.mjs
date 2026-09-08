import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function importTypeScript(path) {
  const source = await readFile(path, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const listingSchool = await importTypeScript(new URL('../lib/listingSchool.ts', import.meta.url));
const schools = await importTypeScript(new URL('../lib/schools.ts', import.meta.url));

assert.equal(
  listingSchool.catalogSchool({
    school: 'Villanova University',
    targetSchool: 'USC',
    admitTags: ['Villanova', 'USC'],
  }),
  'USC',
  'the explicit target must win over the university the seller attends',
);
assert.equal(
  listingSchool.catalogSchool({ school: 'Villanova University', admitTags: ['USC', 'Villanova'] }),
  null,
  'a multi-admit legacy listing must wait for confirmation instead of using its first admit',
);
assert.equal(
  listingSchool.catalogSchool({ school: 'Villanova University', admitTags: ['USC'] }),
  'USC',
  'a one-admit legacy listing has only one possible target',
);
assert.equal(listingSchool.catalogSchool({ school: 'Villanova University', admitTags: [] }), null);
assert.equal(
  listingSchool.needsTargetSchoolReview({ school: 'Stanford University', admitTags: ['Stanford', 'Harvard'] }),
  true,
);
assert.equal(
  listingSchool.listingHeadline({
    school: 'Stanford University',
    admitTags: ['Stanford', 'Harvard'],
    essays: [
      { prompt: 'UC · Personal Insight Question' },
      { prompt: 'UC · Personal Insight Question' },
      { prompt: 'UC · Personal Insight Question' },
      { prompt: 'UC · Personal Insight Question' },
    ],
  }),
  'Stanford University',
  'a general legacy UC package must use the university the seller attends',
);
assert.equal(
  listingSchool.listingHeadline({
    school: 'University of Washington',
    admitTags: ['Stanford', 'University of Washington'],
    essays: [
      { prompt: 'Common App · Personal Statement' },
      { prompt: 'Community essay' },
    ],
  }),
  'University of Washington',
  'a general Common App package must use the university the seller attends',
);
assert.equal(
  listingSchool.listingHeadline({
    school: 'Stanford University',
    admitTags: ['Stanford', 'UCLA'],
    essays: [
      { prompt: 'Common App · Personal Statement' },
      { prompt: 'UC · Personal Insight Question' },
    ],
  }),
  'Stanford University',
  'a mixed general package must still show the university the seller attends',
);
assert.equal(
  listingSchool.listingHeadline({
    school: 'University of Washington',
    targetSchool: 'Stanford University',
    admitTags: ['Stanford University', 'University of Washington'],
    essays: [{ prompt: 'Common App · Personal Statement' }],
  }),
  'Stanford University',
  'an exact listing college must still win everywhere',
);

// Live regression case, 2026-08-16: Deepesh attends Georgia Tech but submitted
// three separate school packages. The seller dashboard used Listing.school for
// every title and collapsed all three onto Georgia Tech.
const deepeshListings = [
  {
    school: 'Georgia Institute of Technology',
    admitTags: ['Georgia Institute of Technology'],
  },
  {
    school: 'Georgia Institute of Technology',
    admitTags: ['University of Michigan'],
  },
  {
    school: 'Georgia Institute of Technology',
    admitTags: ['The University of North Carolina at Chapel Hill'],
  },
];
const deepeshTitles = deepeshListings.map(listingSchool.catalogSchool);
assert.deepEqual(deepeshTitles, [
  'Georgia Institute of Technology',
  'University of Michigan',
  'The University of North Carolina at Chapel Hill',
]);
assert.equal(new Set(deepeshTitles).size, 3, 'Deepesh\'s three listings must not collapse onto Georgia Tech');

assert.deepEqual(listingSchool.parseAdmitTags('["USC","Villanova"]'), ['USC', 'Villanova']);
assert.deepEqual(listingSchool.parseAdmitTags('not json'), []);

assert.equal(schools.sameSchool('UNC Charlotte', 'University of North Carolina at Charlotte'), true);
assert.equal(schools.sameSchool('UNC Charlotte', 'UNC Chapel Hill'), false);
assert.equal(schools.sameSchool('University of Michigan-Dearborn', 'UM Dearborn'), true);
assert.equal(schools.sameSchool('UM Dearborn', 'UM Flint'), false);
assert.equal(schools.sameSchool('UT El Paso', 'UTEP'), true);
assert.equal(schools.sameSchool('UT El Paso', 'UT Austin'), false);
for (const option of ['UNC Chapel Hill', 'UNC Charlotte', 'UNC Greensboro', 'UNC Wilmington', 'Michigan (Ann Arbor)', 'Michigan-Dearborn', 'Michigan-Flint', 'UT El Paso', 'UT Rio Grande Valley', 'UT Tyler']) {
  assert.ok(schools.SCHOOL_OPTIONS.includes(option), `missing school picker option: ${option}`);
}

// Live regression case, 2026-09-08: seven seller-typed names resolved to a
// different and more selective institution than the seller was actually admitted
// to, and that wrong name was published on the "Accepted at" line of a site whose
// whole claim is verified admits. Two causes, both visible here:
//
//   a short key matching inside a longer name, so 'amherst' claimed
//   "UMass Amherst" and 'dartmouth' claimed "Umass Dartmouth";
//
//   longest-match handing a campus to its own system's flagship, so
//   'university of north carolina' (28) out-ranked 'north carolina charlotte'
//   (24) whenever the seller left out the word "at".
//
// Every fix is a key or an entry. The matching logic in lib/schools.ts is
// deliberately untouched.
const CORRECTED_SCHOOLS = [
  ['UMass Amherst', 'umass.edu', 'UMass Amherst'],
  ['UMASS Amherst', 'umass.edu', 'UMass Amherst'],
  ['Umass Dartmouth', 'umassd.edu', 'UMass Dartmouth'],
  ['George Washington University', 'gwu.edu', 'George Washington'],
  ['University of Maryland Baltimore County', 'umbc.edu', 'UMBC'],
  ['University of North Carolina Charlotte', 'charlotte.edu', 'UNC Charlotte'],
  ['University of North Carolina Greensboro', 'uncg.edu', 'UNC Greensboro'],
  // Not in the catalogue yet. Same hole as the two campuses above, closed here
  // before a seller can fall into it.
  ['University of North Carolina Wilmington', 'uncw.edu', 'UNC Wilmington'],
];
for (const [typed, domain, short] of CORRECTED_SCHOOLS) {
  assert.deepEqual(
    schools.schoolInfo(typed),
    { domain, short },
    `${typed} must not resolve to a different institution`,
  );
}

// The other half of the same fix, and the half a correction like this quietly
// breaks: every school those names used to be mistaken for must still resolve to
// itself, and the longer spellings that always worked must keep working.
const UNCHANGED_SCHOOLS = [
  ['Amherst College', 'amherst.edu'],
  ['Dartmouth College', 'dartmouth.edu'],
  ['Washington University in St. Louis', 'wustl.edu'],
  ['Washington University at St. Louis', 'wustl.edu'],
  ['WashU', 'wustl.edu'],
  ['University of Washington', 'washington.edu'],
  ['University of Maryland', 'umd.edu'],
  ['University of Maryland - College Park', 'umd.edu'],
  ['UMD', 'umd.edu'],
  ['UMass Boston', 'umb.edu'],
  ['University of Massachusetts Boston', 'umb.edu'],
  ['UNC Chapel Hill', 'unc.edu'],
  ['The University of North Carolina at Chapel Hill', 'unc.edu'],
  ['University of North Carolina at Charlotte', 'charlotte.edu'],
  ['North Carolina State', 'ncsu.edu'],
  ['Boston College', 'bc.edu'],
  ['Boston University', 'bu.edu'],
];
for (const [typed, domain] of UNCHANGED_SCHOOLS) {
  assert.equal(schools.schoolInfo(typed)?.domain, domain, `${typed} must still resolve to ${domain}`);
}

// A seller admitted to both a campus and the school it used to be confused with
// now gets two chips on "Accepted at" instead of one. collegeAdmitTags in
// app/page.tsx drops any tag that sameSchool already matched, so before this fix
// one live listing showed two admits where the seller had four.
assert.equal(schools.sameSchool('UMass Amherst', 'Amherst College'), false);
assert.equal(schools.sameSchool('Umass Dartmouth', 'Dartmouth College'), false);
assert.equal(schools.sameSchool('George Washington University', 'Washington University in St. Louis'), false);
assert.equal(schools.sameSchool('University of Maryland Baltimore County', 'University of Maryland'), false);
assert.equal(schools.sameSchool('University of North Carolina Charlotte', 'UNC Chapel Hill'), false);
assert.equal(
  schools.sameSchool('University of North Carolina Charlotte', 'University of North Carolina Greensboro'),
  false,
);
// The spellings that do mean the same school must still match, or the
// target-must-be-one-of-your-admits check in app/api/submit-listing/route.ts
// starts rejecting honest submissions.
assert.equal(schools.sameSchool('UMass Amherst', 'University of Massachusetts Amherst'), true);
assert.equal(schools.sameSchool('George Washington University', 'GWU'), true);
assert.equal(schools.sameSchool('University of Maryland Baltimore County', 'UMBC'), true);

// "Duke Kunshan College" has the same shape as the seven above: Duke Kunshan
// University is a separate degree-granting school in Kunshan, China, and 'duke'
// matches inside it. It is deliberately left resolving to Duke, because
// splitting it lowers what a live listing claims and that is Fatimah's call, not
// a silent fix. Pinned so the decision stays visible.
assert.equal(schools.schoolInfo('Duke Kunshan College')?.domain, 'duke.edu');

console.log('listing school tests passed');
