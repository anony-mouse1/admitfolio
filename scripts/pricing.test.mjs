import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'admitly-pricing-test-'));

try {
  for (const file of ['lib/schools.ts', 'lib/pricing.ts']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: file,
    }).outputText;
    fs.writeFileSync(path.join(outDir, path.basename(file, '.ts') + '.js'), output);
  }

  const { schoolTier, recommendedPackagePrice, RECOMMENDED_ESSAY_PRICE } = require(path.join(outDir, 'pricing.js'));

  for (const school of [
    'Wisconsin',
    'Maryland',
    'Virginia',
    'Michigan',
    'Pittsburgh',
    'North Carolina',
    'Rochester',
    'Miami',
    'Southern California',
  ]) {
    assert.equal(schoolTier(school), 2, `${school} should keep its Tier 2 floor`);
  }

  for (const school of [
    'James Madison University',
    'Michigan State University',
    'North Carolina State University',
    'Rochester Institute of Technology',
    'Virginia Commonwealth University',
    'Virginia Tech',
  ]) {
    assert.equal(schoolTier(school), 3, `${school} should not inherit a short-name Tier 2 match`);
  }

  assert.equal(schoolTier('Penn State'), 3, 'Penn State must not resolve as UPenn');
  assert.equal(schoolTier('University of Pennsylvania'), 1);
  assert.equal(schoolTier('University of Washington'), 2);

  assert.equal(recommendedPackagePrice(1), 15);
  assert.equal(recommendedPackagePrice(2), 19);
  assert.equal(recommendedPackagePrice(3), 19);
  assert.equal(recommendedPackagePrice(4), 24);
  assert.equal(recommendedPackagePrice(6), 24);
  assert.equal(recommendedPackagePrice(7), 29);
  assert.equal(recommendedPackagePrice(18), 29);
  assert.equal(RECOMMENDED_ESSAY_PRICE, 15);

  console.log('pricing tests passed');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
