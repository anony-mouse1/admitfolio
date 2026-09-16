// Pure rules for buyer attribution: what gets recorded at landing, what gets
// read back at checkout, and what reaches Stripe metadata. No server, no
// browser, no network, so this is a test:* script.
//
// Every assertion here is about a value that ends up in the Stripe Dashboard's
// Metadata panel on a real payment, so the privacy ones matter as much as the
// correctness ones.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'admitfolio-visit-source-test-'));

try {
  for (const file of [
    'lib/site.ts',
    'lib/redactAnalyticsUrl.ts',
    'lib/visitSource.ts',
    'lib/schools.ts',
    'lib/listingSchool.ts',
    'lib/pricing.ts',
    'lib/publicListing.ts',
    'lib/collectionSummary.ts',
    'lib/collections.ts',
    'lib/guides.ts',
    'lib/commerce.ts',
  ]) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: file,
    }).outputText;
    fs.writeFileSync(path.join(outDir, path.basename(file, '.ts') + '.js'), output);
  }

  const {
    LANDING_STORAGE_KEY,
    MAX_SOURCE_VALUE,
    pathLabel,
    readLanding,
    recordLanding,
    referrerLabel,
    utmLabel,
    visitSource,
  } = require(path.join(outDir, 'visitSource.js'));
  const {
    MAX_METADATA_VALUE,
    SOURCE_VALUE_LIMIT,
    VISIT_SOURCE_KEYS,
    checkoutSessionParams,
    quoteListing,
    sourceMetadata,
  } = require(path.join(outDir, 'commerce.js'));
  const { collections, collectionPath, COLLECTIONS_PATH } = require(path.join(outDir, 'collections.js'));
  const { guides, guidePath, GUIDES_PATH } = require(path.join(outDir, 'guides.js'));

  function memoryStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
      getItem: (key) => (values.has(key) ? values.get(key) : null),
      setItem: (key, value) => values.set(key, String(value)),
      values,
    };
  }
  function brokenStorage() {
    return {
      getItem() { throw new DOMException('denied', 'SecurityError'); },
      setItem() { throw new DOMException('denied', 'SecurityError'); },
    };
  }

  // ---- pathLabel: our own URL, reduced to a path, credentials removed -------
  assert.equal(pathLabel('https://admitfolio.com/'), '/');
  assert.equal(pathLabel('https://admitfolio.com/essays/engineering'), '/essays/engineering');
  assert.equal(pathLabel('https://admitfolio.com/essays/biology?listing=abc123xyz'), '/essays/biology');
  assert.equal(pathLabel('https://admitfolio.com/guides/how-to-start-a-college-essay#tips'), '/guides/how-to-start-a-college-essay');
  assert.equal(pathLabel('http://localhost:3000/essays'), '/essays');

  // THE ONE THAT MATTERS. A buyer reading an essay they already bought is on
  // /purchase/<accessToken>, an HMAC bearer credential valid for a year that
  // alone authorises /api/essay/<id>. Buying a second listing from there must
  // not write that token into Stripe metadata, where every Dashboard user and
  // Stripe itself can read it.
  const token = 'eyJwIjoiYWJjMTIzNDU2Nzg5In0.c2lnbmF0dXJlLXZhbHVlLWhlcmU';
  const fromReadingPage = pathLabel(`https://admitfolio.com/purchase/${token}`);
  assert.equal(fromReadingPage, '/purchase/[token]');
  assert.ok(!fromReadingPage.includes(token), 'the access token must never survive into metadata');
  // Miscased, so it 404s, but the 404 still renders inside the root layout.
  assert.equal(pathLabel(`https://admitfolio.com/PURCHASE/${token}`), '/PURCHASE/[token]');
  // A path segment that merely looks like a credential goes too, wherever it is.
  assert.equal(pathLabel(`https://admitfolio.com/anything/${token}`), '/anything/[token]');

  assert.equal(pathLabel('not a url'), '');
  assert.equal(pathLabel(''), '');
  assert.equal(pathLabel('javascript:alert(1)'), '');

  // ---- referrerLabel: host plus path, never the query -----------------------
  assert.equal(referrerLabel('https://www.google.com/', 'https://admitfolio.com'), 'www.google.com');
  assert.equal(
    referrerLabel('https://www.reddit.com/r/ApplyingToCollege/comments/abc/def/', 'https://admitfolio.com'),
    'www.reddit.com/r/ApplyingToCollege/comments/abc/def/',
  );
  // The query is DROPPED rather than redacted. It is the part of a referrer
  // most likely to carry someone else's personal data, and none of it answers
  // "which site sent them".
  assert.equal(
    referrerLabel('https://mail.example.com/inbox?msg=personal-thread-id&user=someone%40example.com', 'https://admitfolio.com'),
    'mail.example.com/inbox',
  );
  assert.equal(referrerLabel('https://www.bing.com/search?q=how+to+start+a+college+essay', 'https://admitfolio.com'), 'www.bing.com/search');
  // Same origin says nothing about acquisition, and is where our own token
  // would arrive if Referrer-Policy: no-referrer were ever relaxed.
  assert.equal(referrerLabel(`https://admitfolio.com/purchase/${token}`, 'https://admitfolio.com'), '');
  assert.equal(referrerLabel('https://admitfolio.com/essays', 'https://admitfolio.com'), '');
  assert.equal(referrerLabel('', 'https://admitfolio.com'), '');
  assert.equal(referrerLabel('not a url', 'https://admitfolio.com'), '');
  assert.equal(referrerLabel('android-app://com.google.android.gm', 'https://admitfolio.com'), '');

  // ---- utmLabel ------------------------------------------------------------
  assert.equal(utmLabel('https://admitfolio.com/'), '');
  assert.equal(
    utmLabel('https://admitfolio.com/essays?utm_source=newsletter&utm_medium=email&utm_campaign=ea-deadline'),
    'source=newsletter&medium=email&campaign=ea-deadline',
  );
  assert.equal(utmLabel('https://admitfolio.com/?utm_source=reddit'), 'source=reddit');
  // A credential-shaped utm value is redacted by lib/redactAnalyticsUrl before
  // it is read, which is the whole reason utm is read off the redacted URL.
  assert.equal(utmLabel(`https://admitfolio.com/?utm_source=${token}`), 'source=[redacted]');

  // ---- recordLanding: FIRST WRITE WINS -------------------------------------
  // This is the entire mechanism. VisitSource mounts on every route, so a
  // second write would credit the homepage for a sale /essays/engineering
  // earned the moment the buyer clicked through.
  const journey = memoryStorage();
  recordLanding('https://admitfolio.com/essays/engineering', 'https://www.google.com/', journey);
  recordLanding('https://admitfolio.com/', 'https://www.google.com/', journey);
  recordLanding('https://admitfolio.com/essays/biology', '', journey);
  assert.deepEqual(readLanding(journey), {
    page: '/essays/engineering',
    referrer: 'www.google.com',
    utm: '',
  });
  assert.equal(journey.values.size, 1);
  assert.ok(journey.values.has(LANDING_STORAGE_KEY));

  // An unreadable first page still claims the slot, so the second page cannot.
  const unreadable = memoryStorage();
  recordLanding('not a url', '', unreadable);
  recordLanding('https://admitfolio.com/', '', unreadable);
  assert.deepEqual(readLanding(unreadable), { page: '', referrer: '', utm: '' });

  // Storage that throws (private mode, blocked site data) is a missing
  // datapoint and never an exception.
  assert.doesNotThrow(() => recordLanding('https://admitfolio.com/', '', brokenStorage()));
  assert.equal(readLanding(brokenStorage()), null);
  assert.equal(readLanding(memoryStorage()), null);
  assert.equal(readLanding(undefined), null);
  assert.equal(readLanding(memoryStorage({ [LANDING_STORAGE_KEY]: 'not json' })), null);
  assert.deepEqual(readLanding(memoryStorage({ [LANDING_STORAGE_KEY]: '{"page":42}' })), {
    page: '', referrer: '', utm: '',
  });

  // ---- visitSource: the landing page and the page they bought from ---------
  // A buyer who lands on a collection page, clicks through to the homepage and
  // buys there. The collection page gets the credit; checkoutPage records that
  // the homepage is where the money changed hands.
  const crossPage = memoryStorage();
  recordLanding('https://admitfolio.com/essays/engineering?utm_source=google', 'https://www.google.com/', crossPage);
  assert.deepEqual(visitSource('https://admitfolio.com/?checkout=abc123xyz', crossPage), {
    landingPage: '/essays/engineering',
    landingReferrer: 'www.google.com',
    landingUtm: 'source=google',
    checkoutPage: '/',
  });

  // Bought on the same collection page they landed on.
  const samePage = memoryStorage();
  recordLanding('https://admitfolio.com/essays/biology', 'https://www.google.com/', samePage);
  assert.deepEqual(visitSource('https://admitfolio.com/essays/biology?checkout=abc123xyz', samePage), {
    landingPage: '/essays/biology',
    landingReferrer: 'www.google.com',
    landingUtm: '',
    checkoutPage: '/essays/biology',
  });

  // Nothing recorded at all still yields the page they bought from.
  assert.deepEqual(visitSource('https://admitfolio.com/', memoryStorage()), {
    landingPage: '', landingReferrer: '', landingUtm: '', checkoutPage: '/',
  });

  // ---- sourceMetadata: nothing the client sends can fail a checkout --------
  assert.deepEqual(sourceMetadata(null), {});
  assert.deepEqual(sourceMetadata(undefined), {});
  assert.deepEqual(sourceMetadata('nope'), {});
  assert.deepEqual(sourceMetadata([]), {});

  // Empty values are omitted, so a direct visit shows two rows in the Dashboard
  // panel rather than four with two blank.
  assert.deepEqual(
    sourceMetadata({ landingPage: '/', landingReferrer: '', landingUtm: '', checkoutPage: '/' }),
    { landingPage: '/', checkoutPage: '/' },
  );

  // Anything that is not a string is dropped rather than coerced.
  assert.deepEqual(
    sourceMetadata({ landingPage: 42, landingReferrer: null, landingUtm: { a: 1 }, checkoutPage: ['/'] }),
    {},
  );
  // And keys nobody asked for never reach Stripe, so a client cannot invent
  // metadata on a payment.
  assert.deepEqual(sourceMetadata({ landingPage: '/', buyerIp: '9.9.9.9', listingId: 'other' }), { landingPage: '/' });

  // THE ONE RITVIK ASKED ABOUT. Stripe rejects the whole sessions.create call
  // over 500 characters, and /api/checkout turns that into a 502 the buyer
  // reads as "Could not start checkout". An absurd referrer must truncate, not
  // fail. Verified against the sandbox: 500 ok, 501 rejected.
  const absurd = 'https://example.com/' + 'a'.repeat(9_000);
  const clamped = sourceMetadata({ landingReferrer: absurd });
  assert.equal([...clamped.landingReferrer].length, SOURCE_VALUE_LIMIT);
  assert.equal(MAX_METADATA_VALUE, 500, "Stripe's own limit, verified against the sandbox");
  assert.ok(SOURCE_VALUE_LIMIT < MAX_METADATA_VALUE, 'the clamp must sit well under the Stripe limit');

  // ---- the clamp is a MEASURED margin, so measure it ----------------------
  // 400 was not picked for being round. Every public route is enumerable, so
  // landingPage and checkoutPage have a real ceiling and this asserts it rather
  // than trusting a comment. A seventh collection or a long guide slug that ate
  // the margin would fail here instead of silently truncating in production.
  const everyPublicPath = [
    '/', COLLECTIONS_PATH, GUIDES_PATH, '/privacy', '/terms', '/purchase/success',
    ...collections.map((entry) => collectionPath(entry.slug)),
    ...guides.map((entry) => guidePath(entry.slug)),
  ];
  const longestPath = everyPublicPath
    .map((route) => pathLabel(`https://admitfolio.com${route}?utm_source=google&listing=abc123xyz`))
    .reduce((longest, label) => (label.length > longest.length ? label : longest), '');
  assert.equal(longestPath, '/guides/how-to-take-inspiration-from-college-essays');
  assert.ok(
    longestPath.length * 4 < SOURCE_VALUE_LIMIT,
    `the longest public path is ${longestPath.length} characters; the clamp must keep several times that`,
  );
  // The only route that looks unbounded is not: the token is redacted away.
  assert.equal(pathLabel(`https://admitfolio.com/purchase/${token}`).length, 17);

  // The referrer is the one field with no ceiling, and it is what set the
  // margin. A long r/ApplyingToCollege thread is an obvious traffic source for
  // this product, not a contrived example, and it measured 192 characters.
  const longRedditThread = referrerLabel(
    'https://old.reddit.com/r/ApplyingToCollege/comments/1abc2de/i_read_two_hundred_accepted_common_app_personal_statements_and_here_is_what_every_single_one_of_them_had_in_common_a_very_long_thread_title/?sort=confidence&limit=500',
    'https://admitfolio.com',
  );
  assert.equal(longRedditThread.length, 192);
  assert.ok(
    longRedditThread.length < SOURCE_VALUE_LIMIT,
    'a real forum thread referrer must survive the clamp intact, not arrive truncated',
  );
  assert.ok(
    longRedditThread.length * 2 <= SOURCE_VALUE_LIMIT,
    'and with enough room that a slightly longer thread title does not truncate either',
  );

  // A long but plausible campaign, as a newsletter or a Reddit post would set.
  const plausibleUtm = utmLabel(
    'https://admitfolio.com/essays/common-app-personal-statement?utm_source=reddit-applyingtocollege&utm_medium=social-organic&utm_campaign=common-app-personal-statement-collection-launch-september-2026',
  );
  assert.equal(plausibleUtm.length, 125);
  assert.ok(plausibleUtm.length < SOURCE_VALUE_LIMIT, 'a plausible campaign must survive intact');
  assert.equal(MAX_SOURCE_VALUE, SOURCE_VALUE_LIMIT, 'client and server must clamp to the same length');

  // Stripe counts Unicode CODE POINTS, not bytes and not UTF-16 units (500
  // emoji at 2000 bytes are accepted; 501 CJK at 1503 bytes are not). Slicing
  // by code point is also what stops a split surrogate reaching the API.
  const emoji = sourceMetadata({ landingPage: '\u{1F600}'.repeat(400) });
  assert.equal([...emoji.landingPage].length, SOURCE_VALUE_LIMIT);
  assert.ok(!/[\uD800-\uDBFF]$/.test(emoji.landingPage), 'never leave a split surrogate pair');

  // Newlines would render as a broken row in the Dashboard panel.
  assert.deepEqual(sourceMetadata({ landingPage: '  /essays\n\tengineering  ' }), { landingPage: '/essays engineering' });
  assert.deepEqual(sourceMetadata({ landingPage: '   ' }), {});

  assert.deepEqual([...VISIT_SOURCE_KEYS], ['landingPage', 'landingReferrer', 'landingUtm', 'checkoutPage']);
  for (const key of VISIT_SOURCE_KEYS) {
    assert.ok(key.length <= 40, `${key} must fit Stripe's 40 character metadata key limit`);
  }

  // ---- checkoutSessionParams: both objects carry it ------------------------
  const quoted = quoteListing(
    {
      id: 'listing_1',
      school: 'Stanford University',
      targetSchool: 'Stanford University',
      admitTags: JSON.stringify(['Stanford University']),
      status: 'approved',
      pricingMode: 'package',
      packagePrice: 45,
      essays: [
        { id: 'e1', pdfPath: 'a.pdf', prompt: 'Common App' },
        { id: 'e2', pdfPath: 'b.pdf', prompt: 'Why Stanford' },
      ],
    },
    false,
  );
  assert.equal(quoted.ok, true);

  const params = checkoutSessionParams(
    quoted.quote,
    '203.0.113.8',
    'buyer@example.edu',
    'https://admitfolio.com/',
    false,
    { landingPage: '/essays/engineering', landingReferrer: 'www.google.com', landingUtm: '', checkoutPage: '/' },
  );
  assert.equal(params.metadata.landingPage, '/essays/engineering');
  assert.equal(params.metadata.landingReferrer, 'www.google.com');
  assert.equal(params.metadata.checkoutPage, '/');
  assert.ok(!('landingUtm' in params.metadata));
  // The PaymentIntent copy is the one a human can actually read: a Checkout
  // Session has no Dashboard page, and Transactions > Payments > a payment is
  // where the Metadata panel lives.
  assert.equal(params.payment_intent_data.metadata.landingPage, '/essays/engineering');
  assert.equal(params.payment_intent_data.metadata.landingReferrer, 'www.google.com');
  assert.equal(params.payment_intent_data.metadata.checkoutPage, '/');

  // Nothing that already had to be right may be displaced by a source field.
  assert.equal(params.metadata.listingId, 'listing_1');
  assert.equal(params.metadata.amountCents, '4500');
  assert.equal(params.metadata.itemLabel, 'Stanford · 2 essays');
  assert.equal(params.metadata.buyerIp, '203.0.113.8');
  assert.equal(params.metadata.purchaseUnit, 'listing');
  const hostile = checkoutSessionParams(quoted.quote, '203.0.113.8', 'buyer@example.edu', 'https://admitfolio.com/', false, {
    listingId: 'someone_elses_listing',
    amountCents: '1',
    buyerIp: '',
    landingPage: '/essays/biology',
  });
  assert.equal(hostile.metadata.listingId, 'listing_1');
  assert.equal(hostile.metadata.amountCents, '4500');
  assert.equal(hostile.metadata.buyerIp, '203.0.113.8');
  assert.equal(hostile.metadata.landingPage, '/essays/biology');

  // No source at all leaves the request exactly as it was before this change,
  // which is what makes the existing commerce test still meaningful.
  const bare = checkoutSessionParams(quoted.quote, '203.0.113.8', 'buyer@example.edu', 'https://admitfolio.com/');
  assert.deepEqual(Object.keys(bare.metadata).sort(), [
    'amountCents', 'buyerIp', 'checkoutVersion', 'itemLabel', 'listingId', 'purchaseUnit',
  ]);
  assert.deepEqual(Object.keys(bare.payment_intent_data.metadata).sort(), [
    'checkoutVersion', 'listingId', 'purchaseUnit',
  ]);

  // Stripe caps an object at 50 metadata keys and rejects the whole call at 51.
  assert.ok(Object.keys(params.metadata).length <= 50);
  assert.ok(Object.keys(params.payment_intent_data.metadata).length <= 50);

  console.log('visit source checks passed');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
