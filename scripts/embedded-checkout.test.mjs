import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const route = read('app/api/checkout/route.ts');
const page = read('app/page.tsx');
// The detail sheet moved to its own component so the collection pages can open
// it in place. The homepage still owns the checkout, so obscured stays here and
// the aria-hidden it drives is asserted where the sheet now lives.
const sheet = read('components/ListingDetail.tsx');
// The checkout dialog moved too, for the same reason. app/page.tsx keeps only
// which listing is open and what the URL says.
const checkout = read('components/ListingCheckout.tsx');
const browser = read('components/CollectionBrowser.tsx');
const component = read('components/EmbeddedListingCheckout.tsx');
const commerce = read('lib/commerce.ts');
const styles = read('app/globals.css');

assert.match(route, /clientSecret:\s*session\.client_secret/);
assert.doesNotMatch(route, /url:\s*session\.url/);
assert.match(checkout, /<EmbeddedListingCheckout/);
assert.match(checkout, /Where should we send your essays\?/);
assert.match(checkout, /deliveryEmail=\{deliveryEmail\}/);
assert.match(checkout, /buy-stripe-card/);
assert.match(checkout, /Link, Apple Pay, or card/);
assert.match(page, /url\.searchParams\.set\('checkout', item\.listingId\);[\s\S]*pushState\(\{ checkout: item\.listingId \}/);
// A collection page must write ?checkout= against its own path, never '/'.
// Writing it against the homepage is what threw a buyer out of the page they
// were reading at the moment they decided to buy.
assert.match(browser, /\$\{basePath\}\?checkout=/, 'the collection checkout URL must be the collection');
assert.doesNotMatch(browser, /location\.assign/, 'and it must not navigate away');
assert.match(browser, /ANALYTICS_EVENTS\.checkoutStarted/, 'Checkout Started must still fire on a fresh click');
assert.match(checkout, /ANALYTICS_EVENTS\.checkoutEmailSubmitted/, 'and the email stage from the shared dialog');
// Both surfaces record a view, or a checkout from a collection page has no
// preceding step and the funnel does not add up.
for (const [name, source] of [['app/page.tsx', page], ['components/CollectionBrowser.tsx', browser]]) {
  assert.match(source, /ANALYTICS_EVENTS\.listingViewed/, `${name} must record Listing Viewed`);
  assert.match(source, /trackedViews|trackedListingViews/, `${name} must record it once per listing`);
}
// Restoring checkout from the URL must not re-fire Checkout Started and must
// not re-push the entry the visitor is already standing on. The origin argument
// carries both: only 'url' takes the branch that does neither.
assert.match(page, /get\('checkout'\)[\s\S]*checkoutItemForListing\(listing\), 'url'\)/);
assert.match(
  page,
  /const openBuy = useCallback\(\(item: CheckoutItem, origin: BuyOrigin \| 'url'\) => \{\s*if \(origin === 'url'\)/,
  'the URL restore must be the branch that skips the push and the event',
);

// Closing checkout pops the entry opening it pushed. Pushing instead is what
// sent Back forward into the payment screen: the stack read browse, listing,
// checkout, listing, so the entry behind the visitor was the checkout they had
// just closed. All four in-page affordances share this one path.
assert.match(
  page,
  /const closeBuy = useCallback\(\(\) => \{\s*if \(buyPushedRef\.current\) \{[\s\S]{0,400}?window\.history\.back\(\);/,
  'closeBuy must pop the entry openBuy pushed',
);
const closeBuyBody = /const closeBuy = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[curItem\.listingId\]\);/.exec(page);
assert.ok(closeBuyBody, 'closeBuy must still be a useCallback keyed on the open listing');
assert.doesNotMatch(closeBuyBody[0], /pushState/, 'closeBuy must never push a history entry');
// The fallback, for a pasted or reloaded ?checkout= link with nothing of ours
// behind it. It replaces rather than pushes, so Back still leaves the site.
assert.match(
  page,
  /const closeBuy = useCallback\(\(\) => \{[\s\S]*setBuyOpen\(false\);[\s\S]*url\.searchParams\.set\('listing', curItem\.listingId\);[\s\S]*url\.hash = 'browse';\s*window\.history\.replaceState\(/,
);

// The control has to name where it actually goes. From a card the sheet never
// opened, so closing returns to the catalogue, not to a listing.
assert.match(page, /openBuy\(\{[\s\S]{0,400}?\}, 'browse'\)/, 'a card unlock must return to the catalogue');
assert.match(page, /openBuy\(\{[\s\S]{0,400}?\}, 'listing'\)/, 'a sheet unlock must return to the listing');
assert.match(page, /<ListingCheckout[^>]*returnTo=\{buyReturn\}/, 'and the dialog must be told which');
assert.match(
  checkout,
  /const backLabel = returnTo === 'listing' \? 'Back to listing' : 'Back to essays'/,
  'both labels live in the dialog, not in either caller',
);
assert.match(checkout, /aria-label=\{backLabel\}/, 'the x and the mobile pill must name the same destination');
assert.doesNotMatch(checkout, /Back to listing<\/button>/, 'no hard-coded destination survives on the back control');

// Collection pages reach checkout only from the open sheet, so the ref starts
// false on both entry paths. Boolean(!initialCheckoutId) read as the opposite
// of its own name: true when nothing had been pushed.
assert.match(browser, /const checkoutPushedRef = useRef\(false\)/, 'nothing is pushed before openCheckout runs');
assert.doesNotMatch(browser, /useRef\(Boolean\(!initialCheckoutId\)\)/);
assert.match(page, /obscured=\{buyOpen\}/);
assert.match(browser, /obscured=\{checkoutOpen\}/, 'the collection sheet must dim under checkout too');
assert.match(sheet, /aria-hidden=\{obscured \|\| undefined\}/);
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
