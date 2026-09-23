import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A crash used to show a blank screen, because neither error file existed.
// These are file conventions, so nothing imports them and nothing else would
// notice if one were deleted or stopped being a client component.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

for (const file of ['app/error.tsx', 'app/global-error.tsx']) {
  assert.ok(fs.existsSync(path.join(root, file)), `${file} exists, or a crash shows a blank screen`);
  const source = read(file);
  assert.match(source, /^'use client';/, `${file} is a client component, which Next requires of an error boundary`);
  assert.match(source, /export default function/, `${file} has a default export`);
  assert.match(source, /<ErrorScreen onRetry=\{retry\} \/>/, `${file} renders the shared screen and passes retry through`);
}

// global-error replaces the root layout, so nothing the layout provides is
// there: not the document, not globals.css, not the fonts.
const globalError = read('app/global-error.tsx');
assert.match(globalError, /<html lang="en">/, 'global-error renders its own html');
assert.match(globalError, /<body>/, 'global-error renders its own body');
assert.match(globalError, /import '\.\/globals\.css';/, 'global-error imports the site stylesheet itself');
assert.match(globalError, /href=\{FONT_STYLESHEET\}/, 'global-error links the site fonts itself');
assert.match(read('app/layout.tsx'), /href=\{FONT_STYLESHEET\}/, 'the layout links the same font stylesheet');

// The way back is a full page load to the homepage, and every string is plain.
const screen = read('components/ErrorScreen.tsx');
assert.match(screen, /<a className="btn-primary" href="\/">Back to the homepage<\/a>/, 'the screen links back to the homepage');
assert.match(screen, /<h1>Something went wrong\.<\/h1>/, 'the screen says something went wrong');
for (const file of ['app/error.tsx', 'app/global-error.tsx', 'components/ErrorScreen.tsx']) {
  assert.doesNotMatch(read(file), /—/, `${file} has no em dash`);
}
assert.match(read('app/globals.css'), /\.error-screen \{/, 'the screen has styles');

console.log('error page tests passed');
