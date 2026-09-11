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
// Absence assertions must be about what the component RENDERS, not about prose.
// The file explains the two step flow it replaced, and quoting "Step 1 of 2" in
// a comment was enough to fail a doesNotMatch against the raw source.
const stripComments = (source) => source
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');
const checkoutRendered = stripComments(checkout);
const browser = read('components/CollectionBrowser.tsx');
const component = read('components/EmbeddedListingCheckout.tsx');
const commerce = read('lib/commerce.ts');
const styles = read('app/globals.css');

assert.match(route, /clientSecret:\s*session\.client_secret/);
assert.doesNotMatch(route, /url:\s*session\.url/);
assert.match(checkout, /<EmbeddedListingCheckout/);
assert.match(checkout, /buy-stripe-card/);

// ---- One screen. The two step flow is what 35 of 37 unlock clicks died on. ----
// The order panel used to be a ~750px restatement of the detail sheet, which put
// the submit button at y 847 in an 844px viewport on a 390px phone.
assert.doesNotMatch(checkoutRendered, /Step 1 of 2/, 'the delivery step must not come back');
assert.doesNotMatch(checkoutRendered, /Step 2 of 2/, 'nor the payment step');
assert.doesNotMatch(checkoutRendered, /buy-email-continue/, 'there is no Continue button to gate on');
assert.doesNotMatch(checkoutRendered, /Where should we send your essays\?/, 'the step 1 heading is gone');
assert.doesNotMatch(checkoutRendered, /buy-summary|buy-total|buy-delivery|buy-intro/, 'the tall order stack is gone');
assert.match(checkout, /buy-order-row/, 'the order panel is one row');

// The payment card and its header render from first paint, OUTSIDE the branch
// that swaps in Stripe. That is what makes the mount an in-place fill rather
// than a panel swap, so nothing above the card can move when it mounts.
const cardIndex = checkoutRendered.indexOf('buy-stripe-card');
const headIndex = checkoutRendered.indexOf('buy-stripe-head');
const branchIndex = checkoutRendered.indexOf('{mounted ? (');
assert.ok(cardIndex > -1 && headIndex > cardIndex, 'the card carries its header');
assert.ok(branchIndex > headIndex, 'the header is rendered before the mount branch, not inside it');
assert.match(
  checkout,
  /Card form loads here once you add your email/,
  'the header subtitle says what the empty card is waiting for',
);
assert.match(
  checkout,
  /mounted \? 'Encrypted from end to end' : 'Card form loads here/,
  'and it swaps rather than stacking a second line',
);
assert.match(checkout, /buy-stripe-idle/, 'the empty card shows a placeholder rather than collapsing');

// ---- Session creation is keyed on the CONFIRMED address, never the field. ----
// /api/checkout throttles above 8 per minute per IP (app/api/checkout/route.ts),
// and our buyers sit behind school NAT. Keying the mount on the raw input would
// open a session per keystroke pause.
assert.match(
  checkout,
  /key=\{`\$\{item\.listingId\}:\$\{confirmedEmail\}`\}/,
  'Stripe is keyed on the confirmed address so re-blurring one address cannot open a second session',
);
assert.match(checkout, /deliveryEmail=\{confirmedEmail\}/, 'and is handed the confirmed address');
assert.match(
  checkout,
  /const mounted = Boolean\(open && item\.listingId && confirmedEmail\)/,
  'nothing mounts until an address validates',
);

// ---- The event has to stay comparable with the two step numbers. ----
assert.match(checkout, /onBlur=\{\(event\) => commitDeliveryEmail\(event\.target\.value\)\}/, 'commit runs on blur');
// The value must come off the event. Reading it from state meant a blur in the
// same tick as the change, which is what autofill does, committed nothing.
assert.match(checkout, /commitDeliveryEmail = useCallback\(\(raw: string\)/, 'and reads the value from the event, not from a closure');
assert.match(
  checkout,
  /event\.key === 'Enter'[\s\S]{0,90}commitDeliveryEmail\(event\.currentTarget\.value\)/,
  'and on Enter, also from the event',
);
assert.doesNotMatch(
  checkoutRendered,
  /onChange=\{\(event\) => \{[^}]*trackConversion/,
  'and never on keystroke',
);
assert.match(
  checkout,
  /reportedEmails\.current\.has\(email\)[\s\S]{0,200}trackConversion\(ANALYTICS_EVENTS\.checkoutEmailSubmitted/,
  'Checkout Email Submitted is guarded so one address reports at most once',
);
assert.match(
  checkout,
  /checkoutEmailSubmitted,\s*\{\s*school:[\s\S]{0,60}value:/,
  'with the same two properties the earlier funnel numbers were measured on',
);
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
assert.match(page, /get\('checkout'\)[\s\S]*checkoutItemForListing\(listing\), false, false\)/);
assert.match(page, /const closeBuy = useCallback\(\(\) => \{[\s\S]*setBuyOpen\(false\);[\s\S]*url\.searchParams\.set\('listing', curItem\.listingId\);[\s\S]*url\.hash = 'browse';/);
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
// The one screen flow still sends the buyer confirmed address at session
// create, so a Link or saved card email cannot become the delivery address.
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
