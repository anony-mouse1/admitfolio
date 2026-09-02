import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const component = await readFile(path.join(root, 'components/LogoBadge.tsx'), 'utf8');
const manifest = await readFile(path.join(root, 'lib/schoolLogos.ts'), 'utf8');
const sourceNotes = await readFile(path.join(root, 'public/assets/schools/SOURCES.md'), 'utf8');
const mapBody = manifest.match(/export const SCHOOL_LOGOS = \{([\s\S]*?)\n\} as const/)?.[1];

assert.ok(mapBody, 'shared SCHOOL_LOGOS manifest must remain readable by this regression test');
const entries = [...mapBody.matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)].map((match) => ({
  domain: match[1],
  source: match[2],
}));
assert.equal(entries.length, 75, 'every previously supported school must remain self-hosted');
assert.equal(new Set(entries.map(({ domain }) => domain)).size, entries.length, 'logo domains must be unique');

const sourcesByDomain = new Map(entries.map(({ domain, source }) => [domain, source]));
assert.equal(sourcesByDomain.get('stanford.edu'), '/assets/schools/stanford.svg');
assert.equal(sourcesByDomain.get('duke.edu'), '/assets/schools/duke.webp');
assert.equal(sourcesByDomain.get('indiana.edu'), '/assets/schools/indiana.webp');
assert.equal(sourcesByDomain.get('washington.edu'), '/assets/schools/washington.webp');

for (const { domain, source } of entries) {
  assert.match(source, /^\/assets\/schools\/[a-z0-9-]+\.(?:webp|svg)$/i, `${domain} must use the production asset namespace`);
  assert.doesNotMatch(source, /^https?:\/\//i, `${domain} must not load a remote logo`);
  const bytes = await readFile(path.join(root, 'public', source));
  if (source.endsWith('.webp')) {
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', `${source} must be a real WebP`);
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', `${source} must be a real WebP`);
  } else {
    const svg = bytes.toString('utf8');
    assert.match(svg.slice(0, 500), /<svg\b/i, `${source} must be a real SVG`);
    assert.doesNotMatch(svg, /<script\b/i, `${source} must not contain scripts`);
    assert.doesNotMatch(svg, /(?:href|xlink:href)=["']https?:\/\//i, `${source} must not fetch remote subresources`);
  }
}

const assetFiles = (await readdir(path.join(root, 'public/assets/schools'))).filter((file) => file !== 'SOURCES.md');
assert.equal(assetFiles.length, entries.length, 'the production asset directory must contain exactly the manifested files');
assert.deepEqual(assetFiles.sort(), entries.map(({ source }) => path.basename(source)).sort(), 'every asset must be manifested');

// The no-remote-marks rule is a whole-tree rule, not a LogoBadge rule. It was
// only ever enforced against LogoBadge.tsx, which is how
// public/hero-loop-embed.html came to request ten school marks from Google's
// favicon service, blocked by CSP on every homepage load.
const FAVICON_SERVICES = [
  /google\.com\/s2\/favicons/i,
  /icons\.duckduckgo\.com/i,
  /logo\.clearbit\.com/i,
  /besticon/i,
  /favicongrabber/i,
  /upload\.wikimedia\.org/i,
];
const REMOTE_IMAGE = /<img[^>]*\ssrc\s*=\s*["']https?:\/\//i;

async function sourceFiles(dir, extensions) {
  const out = [];
  let listing;
  try {
    listing = await readdir(path.join(root, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of listing) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.next', 'legacy'].includes(entry.name)) continue;
      out.push(...(await sourceFiles(rel, extensions)));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      // browse-mockup.html is gitignored, holds real seller data, and never
      // deploys, so it is deliberately out of scope here.
      if (entry.name === 'browse-mockup.html') continue;
      out.push(rel);
    }
  }
  return out;
}

const scanned = [
  ...(await sourceFiles('app', ['.ts', '.tsx'])),
  ...(await sourceFiles('components', ['.ts', '.tsx'])),
  ...(await sourceFiles('lib', ['.ts'])),
  ...(await sourceFiles('public', ['.html'])),
];
assert.ok(scanned.length > 20, 'the remote-mark scan must actually be reading the tree');
for (const file of scanned) {
  const text = await readFile(path.join(root, file), 'utf8');
  for (const service of FAVICON_SERVICES) {
    assert.doesNotMatch(text, service, `${file} must not fetch marks from a favicon or logo service`);
  }
  assert.doesNotMatch(text, REMOTE_IMAGE, `${file} must not load a remote image`);
}

assert.match(component, /schoolLogoSrc\(domain\)/, 'LogoBadge must use the shared helper');
assert.match(component, /logoSrc && !errored/, 'failed local assets must stop rendering the image');
assert.match(component, /\{letter\}/, 'unsupported schools must keep the deterministic monogram fallback');
assert.doesNotMatch(component, /https?:\/\//i, 'LogoBadge must not contain remote sources');
assert.doesNotMatch(component, /mockup-assets/i, 'LogoBadge must not use prototype asset paths');
assert.doesNotMatch(manifest, /https?:\/\//i, 'runtime manifest must contain same-origin paths only');
assert.doesNotMatch(manifest, /mockup-assets/i, 'runtime manifest must not use prototype asset paths');
assert.match(sourceNotes, /Retrieved 2026-08-24/, 'downloaded asset provenance must record its retrieval date');

console.log(`logo asset tests passed (${entries.length} self-hosted marks, ${scanned.length} files scanned, no runtime remote dependencies)`);
