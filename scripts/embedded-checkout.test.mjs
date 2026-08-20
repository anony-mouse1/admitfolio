import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const route = read('app/api/checkout/route.ts');
const page = read('app/page.tsx');
const component = read('components/EmbeddedListingCheckout.tsx');
const commerce = read('lib/commerce.ts');

assert.match(route, /clientSecret:\s*session\.client_secret/);
assert.doesNotMatch(route, /url:\s*session\.url/);
assert.match(page, /<EmbeddedListingCheckout/);
assert.doesNotMatch(page, /window\.location\.href\s*=\s*data\.url/);
assert.match(component, /EmbeddedCheckoutProvider/);
assert.match(component, /NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/);
assert.match(commerce, /ui_mode:\s*'embedded_page'/);
assert.match(commerce, /return_url:/);
assert.doesNotMatch(commerce, /success_url:/);
assert.doesNotMatch(commerce, /cancel_url:/);

console.log('embedded checkout wiring tests passed');
