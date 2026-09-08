import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const listings = read('app/api/listings/route.ts');
// The catalog query moved out of the route into a server-only module so the
// server-rendered collection pages can reuse it. The launch gate moved with it,
// which is why these assertions follow it there.
const catalog = read('lib/publicCatalog.ts');
const checkout = read('app/api/checkout/route.ts');
const upload = read('app/api/upload-essay/route.ts');
const reader = read('components/EssayReader.tsx');
const config = read('next.config.js');
const terms = read('app/terms/page.tsx');
const privacy = read('app/privacy/page.tsx');
const site = read('lib/site.ts');
const packageJson = JSON.parse(read('package.json'));
const adminAuth = read('lib/adminAuth.ts');
const sellerAuth = read('lib/sellerAuth.ts');
const layout = read('app/layout.tsx');
const styles = read('app/globals.css');
const page = read('app/page.tsx');
const sheet = read('components/ListingDetail.tsx');
const checkoutDialog = read('components/ListingCheckout.tsx');

assert.equal(packageJson.dependencies.next, '16.3.2');
assert.equal(packageJson.dependencies.react, '19.2.8');
assert.equal(packageJson.dependencies['react-dom'], '19.2.8');
assert.equal(packageJson.scripts.lint, 'tsc --noEmit');
assert.match(adminAuth, /await cookies\(\)/, 'Next 16 cookie access must stay asynchronous');
assert.match(sellerAuth, /await cookies\(\)/, 'Next 16 cookie access must stay asynchronous');
assert.match(site, /'hello@admitfolio\.com'/, 'public contact email must default to the canonical inbox');

for (const route of [catalog, checkout]) {
  assert.match(route, /marketplaceIsLaunched\(\)/, 'public commerce routes must enforce launch state');
}
assert.ok(
  catalog.indexOf('marketplaceIsLaunched()') < catalog.indexOf('prisma.listing.findMany'),
  'catalog launch gate must run before querying listings',
);
// Every reader of the catalog now inherits that gate, so the route must go
// through the module rather than querying listings itself.
assert.match(listings, /publicCatalogListings\(\)/, 'the catalog route must read through the shared module');
assert.doesNotMatch(listings, /prisma\./, 'the catalog route must not query the database directly');
assert.match(catalog, /^import 'server-only';/m, 'the catalog module must never reach a browser bundle');
assert.match(listings, /status: 503/, 'a closed marketplace must still answer 503 from the catalog route');
assert.ok(
  checkout.indexOf('marketplaceIsLaunched()') < checkout.indexOf('stripe.checkout.sessions.create'),
  'checkout launch gate must run before creating a Stripe session',
);

assert.match(upload, /essay\.pdfPath/);
assert.match(upload, /listing\.aiReviewStartedAt/);
assert.match(upload, /listing\.aiReviewedAt/);
assert.match(upload, /upsert:\s*false/);
assert.match(upload, /contentHash}-\$\{randomUUID\(\)\}\.pdf/);
assert.doesNotMatch(upload, /upload\(path, buffer, \{ contentType: 'application\/pdf', upsert: true \}\)/);

assert.match(reader, /getTextContent\(\)/);
assert.match(reader, /role="document"/);
assert.match(reader, /Accessible text of purchased essay/);
assert.match(reader, /aria-hidden="true"/);
assert.equal(JSON.parse(read('node_modules/pdfjs-dist/package.json')).version, '6.2.108');

for (const header of [
  'Content-Security-Policy',
  'X-Frame-Options',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'Permissions-Policy',
]) {
  assert.ok(config.includes(header), `missing security header: ${header}`);
}
assert.match(config, /frame-ancestors 'none'/);
assert.match(config, /frame-src 'self'/);
assert.match(config, /https:\/\/checkout\.stripe\.com/);
assert.match(layout, /fonts\.googleapis\.com/);
assert.match(layout, /fonts\.gstatic\.com/);
assert.match(styles, /html\s*\{[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overscroll-behavior-x:\s*none;/);
assert.match(styles, /@supports \(overflow:\s*clip\)\s*\{\s*html, body \{ overflow-x:\s*clip; \}\s*\}/);
assert.match(styles, /\.trust-marquee\s*\{[\s\S]*?contain:\s*paint;[\s\S]*?touch-action:\s*pan-y;/);
assert.match(checkoutDialog, /modal-overlay buy-overlay/);
assert.match(sheet, /sheet-x mobile-page-close/);
assert.match(styles, /\.sheet\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?border-radius:\s*0;/);
assert.match(styles, /\.buy-overlay \.modal\.buy-modal\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?border-radius:\s*0;/);

assert.doesNotMatch(terms, /Sales are split 60\/40/);
assert.doesNotMatch(terms, /Purchasing is not yet live/);
assert.doesNotMatch(privacy, /when purchasing launches/i);
assert.doesNotMatch(privacy, /Access records are kept for 24 months/);
assert.doesNotMatch(privacy, /waitlist/i);
assert.match(privacy, /sign up for product updates/i);
assert.match(privacy, /Anthropic/);
assert.match(privacy, /admission letters or/);

console.log('launch hardening tests passed');
