import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../app/api/seller/profile/route.ts', import.meta.url), 'utf8');

assert.match(route, /await currentSeller\(\)/, 'profile changes must require an awaited seller session');
for (const field of ['currentUniversity', 'currentMajor', 'graduationYear']) {
  assert.match(route, new RegExp(`${field}: seller\\.${field}`), `GET must return ${field}`);
  assert.match(route, new RegExp(`${field},`), `POST must save ${field}`);
}
assert.doesNotMatch(route, /anonymity/, 'reusable profile must not store a cross-listing anonymity choice');

console.log('seller profile tests passed');
