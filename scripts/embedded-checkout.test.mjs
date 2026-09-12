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
  /const startPayment = useCallback\(\(\) => \{[\s\S]{0,700}setMountedEmail\(email\)/,
  'and startPayment is the only place that sets the mounted address',
);
assert.equal(
  (checkoutRendered.match(/setMountedEmail\(/g) || []).length,
  4,
  'exactly four writers of mountedEmail: the reset, the retire-on-change, the click, and the dropped mount',
);
// confirmedEmail was write-only state whose comment described the aria-disabled
// control. Nothing read it, so it could only mislead the next reader about what
// "confirmed" meant.
assert.doesNotMatch(checkoutRendered, /confirmedEmail/, 'no write-only address state');
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

// ---- The control has no disabled state, real or announced. ----
// It always does something: a valid address mounts the payment form, an empty
// or malformed one says why. aria-disabled announced "unavailable" about a
// control that took the click and answered, and the dimmed styling said the
// same thing to everyone who could see it.
const controlTag = checkoutRendered.slice(
  checkoutRendered.indexOf('<button', checkoutRendered.indexOf('{!mounted && (')),
  checkoutRendered.indexOf('</button>', checkoutRendered.indexOf('{!mounted && (')),
);
assert.ok(controlTag.includes('buy-start-payment'), 'the control is the one under the field');
assert.doesNotMatch(controlTag, /\sdisabled/, 'the control is never hard disabled, or it could not explain itself');
assert.doesNotMatch(controlTag, /aria-disabled/, 'nor announced as disabled, which would be a lie about a control that works');
assert.doesNotMatch(
  styles,
  /\.buy-start-payment\[aria-disabled/,
  'and no styling is left behind to make it look unavailable',
);
// The message the control produces has to reach a screen reader, or making the
// button honest only fixes half of it.
assert.match(
  checkoutRendered,
  /id="deliveryEmailError"[^>]*role="alert"/,
  'the field message announces itself when it appears',
);
assert.match(
  checkoutRendered,
  /aria-describedby="deliveryEmailHint deliveryEmailError"/,
  'and is read again when startPayment sends focus back to the input',
);
// Invalid is about the address. A 429 is the server's problem with an address
// the field is still showing a valid tick for.
assert.match(
  checkoutRendered,
  /aria-invalid=\{error && !emailIsValid \? true : undefined\}/,
  'the input is marked invalid for a bad address, not for a failed request',
);
assert.match(checkoutRendered, /<small id="deliveryEmailHint">/, 'the hint it names exists');

// ---- A failed mount is dropped, so there is something to try again with. ----
// /api/checkout answers 429 at 8 per minute per IP, and the dead mount used to
// stay on screen, which kept `mounted` true, which is the one condition under
// which the control does not render. The buyer read "Please try again" with
// nothing to try it with.
assert.match(
  checkoutRendered,
  /const handleMountError = useCallback\(\(message: string\) => \{\s*setError\(message\);\s*setMountedEmail\(''\);\s*setRetryable\(true\);/,
  'a failed mount clears the mounted address so the control comes back',
);
assert.match(checkoutRendered, /onError=\{handleMountError\}/, 'and the mount reports its failures to it');
assert.doesNotMatch(checkoutRendered, /onError=\{setError\}/, 'not to a setter that only paints the message');
assert.match(
  checkoutRendered,
  /\{retryable \? 'Try again' : 'Continue to payment'\}/,
  'and the control that comes back says what it now does',
);
// The address is what must survive, or the retry costs a retype.
assert.doesNotMatch(
  checkoutRendered,
  /const handleMountError = useCallback\([\s\S]{0,240}setDeliveryEmail/,
  'dropping a failed mount must not clear the field the buyer typed',
);

// ---- The reset runs during render, not in an effect. ----
// An effect runs after the commit and React runs a child's effects before its
// parent's, so the effect version committed one render with the previous
// address still in mountedEmail and let the Stripe mount fire in it. Every
// close and reopen spent a real Checkout Session, and a real Link SMS, on a
// dialog whose email field the buyer could see was empty.
assert.match(
  checkoutRendered,
  /const \[session, setSession\] = useState\(\(\) => \(\{ open, listingId: item\.listingId \}\)\);\s*if \(session\.open !== open \|\| session\.listingId !== item\.listingId\) \{/,
  'the reset is a render-phase comparison, so no stale mount is ever committed',
);
assert.doesNotMatch(
  checkoutRendered,
  /useEffect\(\(\) => \{\s*if \(!open\) return;[\s\S]{0,200}setMountedEmail\(''\)/,
  'the effect that cleared it one commit too late must not come back',
);
assert.doesNotMatch(checkoutRendered, /useEffect/, 'and nothing else in the dialog needs an effect');

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
  'blur still validates and stores the address without starting payment');
// The value must come off the event. Reading it from state meant a blur in the
// same tick as the change, which is what autofill does, committed nothing.
assert.match(checkout, /commitDeliveryEmail = useCallback\(\(raw: string\)/, 'and reads the value from the event, not from a closure');
assert.doesNotMatch(
  checkoutRendered,
  /onChange=\{\(event\) => \{[^}]*trackConversion/,
  'and never on keystroke',
);
const commitStart = checkout.indexOf('const commitDeliveryEmail');
const paymentStart = checkout.indexOf('const startPayment');
const mountErrorStart = checkout.indexOf('const handleMountError');
assert.doesNotMatch(
  checkout.slice(commitStart, paymentStart),
  /checkoutEmailSubmitted/,
  'a valid blur must not inflate the explicit proceed stage',
);
assert.match(
  checkout.slice(paymentStart, mountErrorStart),
  /reportedEmails\.current\.has\(email\)[\s\S]{0,260}trackConversion\(ANALYTICS_EVENTS\.checkoutEmailSubmitted/,
  'Checkout Email Submitted is emitted by deliberate proceed and guarded so one address reports at most once',
);
assert.match(
  checkout,
  /checkoutEmailSubmitted,\s*\{\s*school:[\s\S]{0,60}value:/,
  'with the same two properties the earlier funnel numbers were measured on',
);

// ---- Checkout Email Invalid: the typo bucket, kept clean. ----
// Without it, a buyer who gave up on a mistyped address and a buyer who gave up
// on the price are the same number: both leave without a Checkout Email
// Submitted.
const commitBody = checkoutRendered.slice(
  checkoutRendered.indexOf('const commitDeliveryEmail'),
  checkoutRendered.indexOf('const startPayment'),
);
assert.match(
  commitBody,
  /if \(!emailRe\.test\(email\)\) \{[\s\S]{0,400}?reportedInvalid\.current\.has\(email\)[\s\S]{0,200}?trackConversion\(ANALYTICS_EVENTS\.checkoutEmailInvalid/,
  'Checkout Email Invalid fires in the malformed branch, guarded so one typo reports once',
);
// The empty-field branch returns before the regex runs, so nothing may be
// reported there. An untouched field is someone who has not started, not
// someone who got it wrong, and counting it would fill this bucket with every
// buyer who opened the dialog and left.
const emptyBranch = commitBody.slice(
  commitBody.indexOf('if (!email) {'),
  commitBody.indexOf('if (!emailRe.test(email))'),
);
assert.ok(emptyBranch.length > 0, 'the empty-field branch is still there');
assert.doesNotMatch(emptyBranch, /trackConversion/, 'an empty field reports nothing');
// It belongs to the field, not to the click. startPayment reaches it only by
// calling commitDeliveryEmail, so clicking Continue on a typo reports once, not
// twice.
const paymentBody = checkoutRendered.slice(
  checkoutRendered.indexOf('const startPayment'),
  checkoutRendered.indexOf('const handleMountError'),
);
assert.doesNotMatch(paymentBody, /checkoutEmailInvalid/, 'the click does not report the failure a second time');
assert.equal(
  (checkoutRendered.match(/ANALYTICS_EVENTS\.checkoutEmailInvalid/g) || []).length,
  1,
  'exactly one place reports it',
);
assert.match(
  checkoutRendered,
  /reportedInvalid\.current\.clear\(\);/,
  'and a new listing or a reopen starts the guard empty, like reportedEmails',
);

// ---- The Stripe mount lifecycle is untouched. ----
// This change adds a report inside a branch that already returned early. It
// must not have moved anything that decides when Stripe mounts.
assert.doesNotMatch(commitBody, /setMountedEmail\(email\)/, 'commitDeliveryEmail still never mounts');
assert.match(
  commitBody,
  /if \(!emailRe\.test\(email\)\) \{[\s\S]{0,600}?return '';/,
  'and a malformed address still returns empty, so no caller proceeds on it',
);
// The dependency list grew because the event reads item.school and item.price.
// Nothing here is an effect, so a new callback identity per listing changes no
// lifecycle, and the mount stays keyed on the listing and the address.
assert.match(
  checkoutRendered,
  /\}, \[item\.school, item\.price\]\);/,
  'commitDeliveryEmail declares the two values the event reads',
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
// There used to be an `assert.match(component, /EmbeddedCheckoutProvider/)`
// here. The provider was removed when this file took over the lifecycle, so
// the only occurrence left is in the comment explaining why it went, and the
// assertion passed on that. It said the opposite of the doesNotMatch below,
// and would have started failing the day someone reworded a comment.
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
assert.match(
  component,
  /if \(cancelled \|\| !host\) \{[\s\S]{0,360}await destroyCheckout\(instance\)/,
  'a create that resolves after unmount must await teardown before the queue advances',
);
assert.match(
  component,
  /async function destroyCheckout[\s\S]{0,500}setTimeout\(resolve, 0\)/,
  'every destroy path shares the macrotask teardown barrier',
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
