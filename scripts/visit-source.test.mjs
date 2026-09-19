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
    OTHER_PATH,
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
  // Miscased, so it 404s, but the 404 still renders inside the root layout. The
  // token is redacted first and the path then fails the route shape, so it ends
  // up in the bucket. Either answer is safe; what matters is the token is gone.
  const miscased = pathLabel(`https://admitfolio.com/PURCHASE/${token}`);
  assert.equal(miscased, OTHER_PATH);
  assert.ok(!miscased.includes(token), 'the access token must never survive into metadata');
  // A path segment that merely looks like a credential goes too, wherever it is.
  assert.equal(pathLabel(`https://admitfolio.com/anything/${token}`), '/anything/[token]');

  assert.equal(pathLabel('not a url'), '');
  assert.equal(pathLabel(''), '');
  assert.equal(pathLabel('javascript:alert(1)'), '');

  // ---- the landing page is whatever URL the visitor arrived on -------------
  // A 404 on our own domain renders inside the root layout, where the landing
  // is recorded, so the path is not guaranteed to be one of our routes. It is
  // bounded to the shape our routes have, and anything else becomes a bucket.
  assert.equal(pathLabel('https://admitfolio.com/Jane%20Doe%20lives%20at%2012%20Oak%20St'), OTHER_PATH);
  assert.equal(pathLabel('https://admitfolio.com/a/b/c/d/e'), OTHER_PATH, 'more segments than any route has');
  assert.equal(pathLabel(`https://admitfolio.com/${'z'.repeat(90)}`), OTHER_PATH, 'longer than any route is');
  assert.equal(pathLabel('https://admitfolio.com/essays/'), '/essays', 'one spelling per page');
  assert.equal(pathLabel('https://admitfolio.com//essays//engineering'), '/essays/engineering');
  // Every real route still passes, which is the half that is easy to break.
  for (const route of [
    '/',
    '/essays',
    '/essays/uc-personal-insight-questions',
    '/essays/common-app-personal-statement',
    '/guides',
    '/guides/how-to-take-inspiration-from-college-essays',
    '/purchase/success',
    '/privacy',
    '/terms',
  ]) {
    assert.equal(pathLabel(`https://admitfolio.com${route}`), route, `${route} must survive intact`);
  }
  // This is a bound, not a proof, and the gap is deliberate rather than missed:
  // a lowercase hyphenated 404 is indistinguishable from a route by shape alone.
  assert.equal(
    pathLabel('https://admitfolio.com/jane-doe-lives-at-12-oak-st'),
    '/jane-doe-lives-at-12-oak-st',
    'documented residual: closing this means importing the route registries into every page bundle',
  );

  // ---- referrerLabel: the HOST, and nothing else ---------------------------
  // The path is dropped along with the query and the hash. A referrer URL is a
  // page on somebody else's site: webmail, a shared document, an intranet, a
  // private group chat. None of it is ours to copy into the Stripe Dashboard,
  // and the host alone answers which channel earned the sale.
  assert.equal(referrerLabel('https://www.google.com/', 'https://admitfolio.com'), 'www.google.com');
  assert.equal(
    referrerLabel('https://www.reddit.com/r/ApplyingToCollege/comments/abc/def/', 'https://admitfolio.com'),
    'www.reddit.com',
  );
  assert.equal(
    referrerLabel('https://mail.example.com/mail/u/0/inbox/msg-4471?user=someone%40example.com', 'https://admitfolio.com'),
    'mail.example.com',
  );
  assert.equal(
    referrerLabel('https://docs.example.com/document/d/1AbCdEfGhIjKlMnOp/edit', 'https://admitfolio.com'),
    'docs.example.com',
  );
  assert.equal(
    referrerLabel('https://wiki.acme-corp.example/teams/admissions/private-notes', 'https://admitfolio.com'),
    'wiki.acme-corp.example',
  );
  // A search query is in the query string, which was already dropped, but the
  // path is gone too so /search does not survive either.
  assert.equal(referrerLabel('https://www.bing.com/search?q=how+to+start+a+college+essay', 'https://admitfolio.com'), 'www.bing.com');
  // Nothing in a referrer may be capitalised into a second spelling of the same
  // host, or the Dashboard splits one channel across two rows.
  assert.equal(referrerLabel('https://WWW.Reddit.COM/r/x', 'https://admitfolio.com'), 'www.reddit.com');
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
  assert.equal(utmLabel('https://admitfolio.com/?utm_source=google.com'), 'source=google.com');
  // One spelling per channel, or the Dashboard splits it in two.
  assert.equal(utmLabel('https://admitfolio.com/?utm_source=Newsletter'), 'source=newsletter');
  // A credential-shaped utm value is redacted by lib/redactAnalyticsUrl before
  // it is read, which is the whole reason utm is read off the redacted URL.
  assert.equal(utmLabel(`https://admitfolio.com/?utm_source=${token}`), 'source=[redacted]');

  // ---- utm values are third-party text, so they are checked, not trusted ----
  // These are not ours. Whoever built the link typed them, and mail platforms
  // in particular expand a merge tag into a per-recipient identifier. None of
  // that may reach Stripe metadata.
  //
  // The KEY survives every redaction. A campaign whose value is unsafe is still
  // a campaign visit, and dropping the key would file it as organic, which is
  // the opposite of what this feature is for.
  assert.equal(
    utmLabel('https://admitfolio.com/?utm_source=newsletter&utm_campaign=jane.doe@example.com'),
    'source=newsletter&campaign=[redacted]',
    'an email address in a campaign must never reach Stripe',
  );
  assert.equal(
    utmLabel('https://admitfolio.com/?utm_campaign=Jane%20Doe%20Parent%20List'),
    'campaign=[redacted]',
    'nor a person\'s name',
  );
  assert.equal(
    utmLabel('https://admitfolio.com/?utm_source=mailchimp&utm_medium=email&utm_campaign=sub_18f2a9c4b7e1d0a3f5c8b2e6d9a1f4c7'),
    'source=mailchimp&medium=email&campaign=[redacted]',
    'a per-recipient identifier is redacted while the channel survives',
  );
  assert.equal(
    utmLabel('https://admitfolio.com/?utm_campaign=550e8400-e29b-41d4-a716-446655440000'),
    'campaign=[redacted]',
    'nor a uuid',
  );
  // 40 characters of campaign name is fine; 41 is not a campaign name.
  assert.equal(utmLabel(`https://admitfolio.com/?utm_campaign=${'z'.repeat(40)}`), `campaign=${'z'.repeat(40)}`);
  assert.equal(utmLabel(`https://admitfolio.com/?utm_campaign=${'z'.repeat(41)}`), 'campaign=[redacted]');
  // The identifier heuristic over-redacts, on purpose and in the safe
  // direction: a campaign name that is 16 or more characters drawn only from
  // a-f and 0-9 is indistinguishable from a hex id, so it is treated as one.
  assert.equal(utmLabel(`https://admitfolio.com/?utm_campaign=${'a'.repeat(16)}`), 'campaign=[redacted]');

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

  // The API body is untrusted too. A modified client must not be able to put a
  // full third-party URL, personal campaign value, or arbitrary page label into
  // Stripe metadata even though the ordinary browser already sanitizes them.
  const absurd = 'https://example.com/' + 'a'.repeat(9_000);
  assert.deepEqual(sourceMetadata({ landingReferrer: absurd }), {});
  assert.deepEqual(
    sourceMetadata({
      landingPage: '/jane-doe-private-page',
      landingReferrer: 'mail.example.com/inbox/private-thread',
      landingUtm: 'source=newsletter&campaign=jane.doe@example.com',
      checkoutPage: '/essays/engineering',
    }),
    {
      landingPage: '/[other]',
      landingUtm: 'source=newsletter&campaign=[redacted]',
      checkoutPage: '/essays/engineering',
    },
  );
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

  // The referrer used to be the one field with no ceiling, which is what set
  // the 400 margin. It is a bare hostname now, so it has the only ceiling a
  // hostname can have, and that long forum thread reduces to 15 characters.
  const longRedditThread = referrerLabel(
    'https://old.reddit.com/r/ApplyingToCollege/comments/1abc2de/i_read_two_hundred_accepted_common_app_personal_statements_and_here_is_what_every_single_one_of_them_had_in_common_a_very_long_thread_title/?sort=confidence&limit=500',
    'https://admitfolio.com',
  );
  assert.equal(longRedditThread, 'old.reddit.com');
  assert.ok(longRedditThread.length < SOURCE_VALUE_LIMIT);

  // Every field is now bounded before the clamp, so this is arithmetic rather
  // than a measurement of what happened to turn up. The longest value any of
  // them can produce is a 253 character hostname, and the clamp is a backstop
  // against an untrusted client rather than a margin over a sample.
  const worstUtm = utmLabel(
    `https://admitfolio.com/?utm_source=${'z'.repeat(40)}&utm_medium=${'y'.repeat(40)}&utm_campaign=${'x'.repeat(40)}`,
  );
  assert.equal(worstUtm.length, 145, 'the longest campaign string the rules can emit');
  assert.ok(worstUtm.length < SOURCE_VALUE_LIMIT);
  assert.ok(
    pathLabel(`https://admitfolio.com/${'z'.repeat(200)}`).length < SOURCE_VALUE_LIMIT,
    'and an absurd path becomes a bucket rather than a long value',
  );
  // A long but plausible campaign still survives intact, which is the half that
  // tightening the rules could easily have broken.
  const plausibleUtm = utmLabel(
    'https://admitfolio.com/essays/common-app-personal-statement?utm_source=reddit-applyingtocollege&utm_medium=social-organic&utm_campaign=common-app-collection-launch-2026',
  );
  assert.equal(
    plausibleUtm,
    'source=reddit-applyingtocollege&medium=social-organic&campaign=common-app-collection-launch-2026',
  );
  assert.equal(MAX_SOURCE_VALUE, SOURCE_VALUE_LIMIT, 'client and server must clamp to the same length');

  // Arbitrary values never reach the generic Stripe clamp. They become the
  // fixed unknown-page bucket first, so even a hostile Unicode value is safe.
  const emoji = sourceMetadata({ landingPage: '\u{1F600}'.repeat(400) });
  assert.equal(emoji.landingPage, '/[other]');

  // Newlines would render as a broken row in the Dashboard panel, and the
  // resulting unknown route is bucketed instead of copied.
  assert.deepEqual(sourceMetadata({ landingPage: '  /essays\n\tengineering  ' }), { landingPage: '/[other]' });
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
