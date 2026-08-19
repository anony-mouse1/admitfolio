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

console.log('listing school tests passed');
