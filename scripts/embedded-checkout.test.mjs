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
const componentRendered = stripComments(component);
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
  /Card form opens here, you stay on this screen/,
  'the header subtitle promises the form opens in place',
);
assert.match(
  checkout,
  /mounted \? 'Encrypted from end to end' : 'Card form opens here/,
  'and it swaps rather than stacking a second line',
);
assert.match(checkout, /buy-stripe-idle/, 'the empty card shows a placeholder rather than collapsing');

// ---- A Stripe session is created ONLY by a deliberate click. ----
// Mounting on blur created a real Checkout Session every time the field lost
// focus with a valid address, and Stripe Link texts a verification code to
// anyone whose number is on a Link account: a returning buyer got an SMS for
// tabbing past the field, before deciding to buy.
assert.match(
  checkoutRendered,
  /onClick=\{startPayment\}/,
  'a click is what starts payment',
);
assert.match(
  checkoutRendered,
  /const startPayment = useCallback\(\(\) => \{[\s\S]{0,320}setMountedEmail\(email\)/,
  'and startPayment is the only place that sets the mounted address',
);
assert.equal(
  (checkoutRendered.match(/setMountedEmail\(/g) || []).length,
  3,
  'exactly three writers of mountedEmail: the reset, the retire-on-change, and the click',
);
assert.doesNotMatch(
  checkoutRendered,
  /onBlur=\{[^}]*startPayment/,
  'blur must never start payment',
);
assert.match(
  checkout,
  /key=\{`\$\{item\.listingId\}:\$\{mountedEmail\}`\}/,
  'Stripe is keyed on the address it was mounted for',
);
assert.match(checkout, /deliveryEmail=\{mountedEmail\}/, 'and is handed that address');
assert.match(
  checkout,
  /const mounted = Boolean\(open && item\.listingId && mountedEmail\)/,
  'nothing mounts until the buyer asks for it',
);
// An empty field gets the same message a malformed one does, but only from the
// click. commitDeliveryEmail must stay silent on blur, or an untouched input
// nags the moment focus leaves it.
assert.match(
  checkoutRendered,
  /if \(!raw\.trim\(\)\) setError\('Enter a valid delivery email\.'\);/,
  'clicking Continue with an empty field says why instead of only moving the cursor',
);
assert.match(
  checkoutRendered,
  /if \(!email\) \{\s*setError\(''\);\s*return '';/,
  'and blur on an empty field stays silent',
);

// Editing past the mounted address retires the mount, so a buyer can never pay
// on a session built for an address the field has since moved on from.
assert.match(
  checkoutRendered,
  /setMountedEmail\(\(current\) => \(current && current !== email \? '' : current\)\)/,
  'a changed address retires the mounted session',
);
// The control sits directly under the field, where the eye already is after
// typing, not inside the payment card where finding it meant looking away.
assert.match(styles, /\.buy-start-payment \{/, 'the control is styled as a compact button');
const fieldAt = checkoutRendered.indexOf('buy-email-field');
const controlAt = checkoutRendered.indexOf('buy-start-payment');
const cardAt = checkoutRendered.indexOf('buy-stripe-card');
assert.ok(fieldAt > -1 && controlAt > fieldAt, 'the control renders after the email field');
assert.ok(controlAt < cardAt, 'and before the payment card, not inside it');

// One derived validity, read by both the tick and the control, so the signal
// and the button can never disagree.
assert.match(
  checkoutRendered,
  /const emailIsValid = emailRe\.test\(deliveryEmail\.trim\(\)\.toLowerCase\(\)\)/,
  'validity is derived from the live field',
);
assert.match(checkoutRendered, /emailIsValid && <span className="buy-email-tick"/, 'the tick reads it');
assert.match(checkoutRendered, /aria-disabled=\{!emailIsValid\}/, 'and so does the control state');
// aria-disabled, not disabled: a disabled button cannot be clicked, so the
// empty-field message would be unreachable.
assert.doesNotMatch(
  checkoutRendered,
  /<button[^>]*className="buy-start-payment"[\s\S]{0,160}\sdisabled/,
  'the control is never hard disabled, or it could not explain itself',
);
// Assert the declaration that does the work, not merely that some rule with
// this selector exists: renaming the real rule slipped past the looser version
// because the :hover rule still matched.
assert.match(
  styles,
  /\.buy-start-payment\[aria-disabled='true'\] \{[^}]*opacity: \.5;/,
  'and it actually looks unavailable in that state',
);

// Enter routes through the control. It used to call commitDeliveryEmail, which
// is what gave Enter its own way into Stripe.
assert.match(
  checkoutRendered,
  /event\.key !== 'Enter'[\s\S]{0,240}startPayment\(\)/,
  'Enter triggers the same control as the click',
);
assert.doesNotMatch(
  checkoutRendered,
  /event\.key === 'Enter'[\s\S]{0,80}commitDeliveryEmail/,
  'and no longer has a path of its own',
);
// On a touch device Enter is the soft keyboard's Go key, pressed to dismiss the
// keyboard rather than to pay, and mounting there fires the Link SMS.
assert.match(
  checkoutRendered,
  /if \(!enterMeansProceed\(\)\) return;[\s\S]{0,90}startPayment\(\)/,
  'and it is gated so a soft keyboard Go cannot mount Stripe',
);
assert.match(
  checkoutRendered,
  /matchMedia\('\(hover: hover\) and \(pointer: fine\)'\)/,
  'gated on pointer capability, because an iPad in landscape is wide and a narrow desktop window is not touch',
);
assert.match(
  checkoutRendered,
  /typeof window\.matchMedia !== 'function'\) return false;/,
  'and an unknown device is treated as touch, since the cost of guessing wrong is an unasked-for text message',
);

// ---- The event has to stay comparable with the two step numbers. ----
assert.match(checkout, /onBlur=\{\(event\) => commitDeliveryEmail\(event\.target\.value\)\}/,
  'Checkout Email Submitted still reports on blur, unchanged, so the funnel numbers stay comparable');
// The value must come off the event. Reading it from state meant a blur in the
// same tick as the change, which is what autofill does, committed nothing.
assert.match(checkout, /commitDeliveryEmail = useCallback\(\(raw: string\)/, 'and reads the value from the event, not from a closure');
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
// ---- The content layer. Two layouts, not one responsive rule. ----
// The panel is rendered twice and shown in exactly one place: the left column
// on desktop, the payment card body on a phone.
assert.match(checkoutRendered, /buy-proof-desktop/, 'the panel renders in the left column');
assert.match(checkoutRendered, /buy-proof-mobile/, 'and inside the payment card body');
assert.match(styles, /@media \(min-width: 851px\)[\s\S]*?\.buy-proof-mobile \{ display: none; \}/,
  'the card copy is hidden on desktop');
// .buy-modal is overflow:hidden and height:100dvh, so each desktop column has
// to own its own overflow or the bottom of the Stripe form is unreachable with
// no scrollbar anywhere in the chain.
assert.match(
  styles,
  /\.modal-overlay\.buy-overlay \.buy-payment \{ max-height: 100dvh; overflow-y: auto; \}/,
  'the desktop payment column scrolls itself',
);
assert.match(styles, /@media \(max-width: 850px\)[\s\S]*?\.buy-proof-desktop \{ display: none; \}/,
  'and the column copy is hidden on a phone');

// The phone panel sits OUTSIDE the card, after it, so it survives the Stripe
// mount. Someone who commits an address and then hesitates at the card form is
// exactly who it is for, and the first build made it vanish at that moment.
const branchStart = checkoutRendered.indexOf('{mounted ? (');
const cardEnd = checkoutRendered.indexOf('buy-ticks');
assert.ok(branchStart > -1 && cardEnd > branchStart, 'the mount branch is intact');
assert.ok(
  checkoutRendered.indexOf('buy-proof-mobile') > branchStart
    && checkoutRendered.indexOf('buy-proof-mobile') < cardEnd,
  'the phone panel renders after the card and before the ticks, so the mount cannot remove it',
);
assert.doesNotMatch(
  checkoutRendered.slice(branchStart, checkoutRendered.indexOf('</div>', checkoutRendered.indexOf('buy-stripe-idle'))),
  /buy-proof-mobile/,
  'and it is not inside the branch Stripe replaces',
);

// ---- One Embedded Checkout object per page. ----
// Stripe.js allows exactly one and destroy() returns void, so a remount in the
// same React commit throws IntegrationError inside the library's own promise
// chain, which has no catch. The card then hangs on "Loading secure checkout"
// with nothing shown. Owning the lifecycle is what makes every remount path
// safe, so the provider components must stay gone.
assert.doesNotMatch(componentRendered, /EmbeddedCheckoutProvider/, 'the provider cannot manage this lifecycle');
assert.match(component, /createEmbeddedCheckoutPage/, 'we create the instance ourselves');
assert.match(component, /function runExclusive/, 'and serialise every create and destroy');
assert.match(component, /async function releaseSlot/, 'releasing the singleton before the next create');
assert.match(
  component,
  /releaseSlot\(\)[\s\S]{0,400}createEmbeddedCheckoutPage/,
  'the teardown is awaited before the create, not fired alongside it',
);
assert.match(
  component,
  /runExclusive\(releaseSlot\)/,
  'and unmount releases the slot through the same queue',
);
assert.match(component, /setLoading\(false\);?\s*\n?\s*\}?\);?/, 'a failed mount clears the loading state');
assert.match(
  component,
  /\}\)\.catch\(\(mountError: unknown\) => \{/,
  'the mount has a catch, so a throw can never leave the card spinning',
);

// Claims. Each one was checked against the live catalogue. Nothing here says an
// acceptance letter was checked, because 195 of the 201 on file never were.
assert.match(checkoutRendered, /The seller proved a college email/);
assert.match(checkoutRendered, /A review panel read the essays/);
assert.match(checkoutRendered, /A person made the final call/);
assert.match(checkoutRendered, /Your copy is yours/);
assert.doesNotMatch(
  checkoutRendered,
  /acceptance letter|letter (was |we )?(checked|verified)/i,
  'no acceptance letter claim, the data does not support one',
);
assert.match(checkoutRendered, /buy-ticks/, 'two tick lines sit under the card');
assert.match(checkoutRendered, /For inspiration only, never for copying/);

// The hook is full width under the row, not a third line inside it. Beside the
// badge it shared a line box with the close button gutter and wrapped early.
assert.ok(
  checkoutRendered.indexOf('buy-order-hook') > checkoutRendered.indexOf('buy-order-price'),
  'the hook renders after the price, outside the badge row',
);
// The fixed close pill is top-left, so the panel's top padding is what clears
// it. It must stay clear of the pill's 54px bottom edge.
assert.match(styles, /\.buy-overlay \.buy-order \{ padding-top: calc\(62px \+ env\(safe-area-inset-top\)\); \}/,
  'the order panel clears the fixed back pill without paying for a wordmark that is gone');

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
