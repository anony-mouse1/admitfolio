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
assert.match(page, /Where should we send your essays\?/);
assert.match(page, /deliveryEmail=\{buyDeliveryEmail\}/);
assert.match(page, /buy-stripe-card/);
assert.match(page, /Link, Apple Pay, or card/);
assert.doesNotMatch(page, /window\.location\.href\s*=\s*data\.url/);
assert.match(component, /EmbeddedCheckoutProvider/);
assert.match(component, /JSON\.stringify\(\{ listingId, deliveryEmail \}\)/);
assert.match(component, /NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/);
assert.match(commerce, /ui_mode:\s*'embedded_page'/);
assert.match(commerce, /customer_email:\s*deliveryEmail/);
assert.match(commerce, /session\.customer_email \?\? session\.customer_details\?\.email/);
assert.doesNotMatch(commerce, /^\s*payment_method_types\s*:/m);
assert.match(commerce, /excluded_payment_method_types:\s*\['amazon_pay'/);
assert.match(commerce, /return_url:/);
assert.doesNotMatch(commerce, /success_url:/);
assert.doesNotMatch(commerce, /cancel_url:/);

console.log('embedded checkout wiring tests passed');
