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

const schools = await importTypeScript(new URL('../lib/schools.ts', import.meta.url));

assert.equal(schools.nationalUniversityRank('Princeton University'), 1);
assert.equal(schools.nationalUniversityRank('MIT'), 2);
assert.equal(schools.nationalUniversityRank('Harvard'), 3);
assert.equal(schools.nationalUniversityRank('Stanford'), 4);
assert.equal(schools.nationalUniversityRank('Yale University'), 4, 'ties must share a rank');
assert.equal(schools.nationalUniversityRank('Cornell University'), 12);
assert.equal(schools.nationalUniversityRank('Columbia University'), 15);
assert.equal(schools.nationalUniversityRank('UC Berkeley'), 15);
assert.equal(schools.nationalUniversityRank('Penn State'), null, 'Penn State must not inherit UPenn rank');
assert.equal(schools.nationalUniversityRank('Binghamton University'), null, 'schools outside the top 50 use the fallback order');

console.log('university rank tests passed');
