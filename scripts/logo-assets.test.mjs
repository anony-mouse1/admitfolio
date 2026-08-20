import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const component = await readFile(path.join(root, 'components/LogoBadge.tsx'), 'utf8');
const mapBody = component.match(/const HIGH_RES_LOGOS:[\s\S]*?= \{([\s\S]*?)\n\};/)?.[1];

assert.ok(mapBody, 'HIGH_RES_LOGOS map must remain readable by this regression test');

const sources = [...mapBody.matchAll(/:\s*'([^']+)'/g)].map((match) => match[1]);
assert.ok(sources.length > 0, 'HIGH_RES_LOGOS must contain logo sources');

for (const source of sources) {
  assert.match(source, /\.(?:webp|svg)$/i, `${source} must be WebP or SVG`);

  if (!source.startsWith('/')) continue;
  const bytes = await readFile(path.join(root, 'public', source));
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', `${source} must be a real WebP file`);
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', `${source} must be a real WebP file`);
}

assert.doesNotMatch(component, /google\.com\/s2\/favicons/, 'LogoBadge must not fall back to remote bitmap favicons');

const localLogoFiles = await readdir(path.join(root, 'public/mockup-assets/university-logos'));
assert.ok(localLogoFiles.length > 0, 'local university logos must exist');
assert.deepEqual(
  localLogoFiles.filter((file) => !file.endsWith('.webp')),
  [],
  'every local university logo must be WebP',
);

console.log(`logo asset tests passed (${sources.length} mapped logos, ${localLogoFiles.length} local WebP files)`);
