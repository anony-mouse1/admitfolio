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
const styles = read('app/globals.css');

assert.match(route, /clientSecret:\s*session\.client_secret/);
assert.doesNotMatch(route, /url:\s*session\.url/);
assert.match(page, /<EmbeddedListingCheckout/);
assert.match(page, /Where should we send your essays\?/);
assert.match(page, /deliveryEmail=\{buyDeliveryEmail\}/);
assert.match(page, /buy-stripe-card/);
assert.match(page, /Link, Apple Pay, or card/);
assert.match(page, /url\.searchParams\.set\('checkout', item\.listingId\);[\s\S]*pushState\(\{ checkout: item\.listingId \}/);
assert.match(page, /get\('checkout'\)[\s\S]*checkoutItemForListing\(listing\), false, false\)/);
assert.match(page, /const closeBuy = useCallback\(\(\) => \{[\s\S]*setBuyOpen\(false\);[\s\S]*url\.searchParams\.set\('listing', curItem\.listingId\);[\s\S]*url\.hash = 'browse';/);
assert.match(page, /obscured=\{buyOpen\}/);
assert.match(page, /aria-hidden=\{obscured \|\| undefined\}/);
assert.doesNotMatch(page, /setDetailId\(null\);[\s\S]{0,160}openBuy\(/);
assert.match(styles, /@keyframes checkoutPageIn[\s\S]*translateX\(44px\)/);
assert.match(styles, /\.modal-overlay\.buy-overlay \{[\s\S]*z-index: 130;[\s\S]*animation: checkoutPageIn \.38s/);
assert.match(styles, /\.modal-overlay\.buy-overlay \.buy-modal \{[\s\S]*animation: none;/);
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
assert.match(styles, /\.modal-overlay\.buy-overlay\s*\{[\s\S]*align-items:\s*stretch;\s*padding:\s*0;[\s\S]*backdrop-filter:\s*none;/);
assert.match(styles, /\.modal-overlay\.buy-overlay \.buy-modal\s*\{[\s\S]*width:\s*100%;\s*max-width:\s*none;\s*height:\s*100dvh;\s*max-height:\s*none;[\s\S]*border-radius:\s*0;/);

console.log('embedded checkout wiring tests passed');
