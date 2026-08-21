import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function importTypeScript(path) {
  const source = await readFile(path, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const policy = await importTypeScript(new URL('../lib/analyticsPolicy.ts', import.meta.url));
const { ANALYTICS_EVENTS } = await importTypeScript(new URL('../lib/analyticsEventNames.ts', import.meta.url));

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  };
}

assert.equal(policy.shouldSendAnalyticsEvent('https://admitfolio.com/'), true);
assert.equal(policy.shouldSendAnalyticsEvent('https://www.admitfolio.com/guides'), true);
assert.equal(policy.shouldSendAnalyticsEvent('https://admitfolio.com/purchase/[token]'), true);
assert.equal(policy.shouldSendAnalyticsEvent('https://admitfolio.vercel.app/'), false);
assert.equal(policy.shouldSendAnalyticsEvent('http://localhost:3000/'), false);
assert.equal(policy.shouldSendAnalyticsEvent('not a url'), false);

const adminStorage = memoryStorage();
assert.equal(policy.shouldSendAnalyticsEvent('https://admitfolio.com/admin', adminStorage), false);
assert.equal(adminStorage.values.get(policy.INTERNAL_ANALYTICS_STORAGE_KEY), '1');
assert.equal(policy.shouldSendAnalyticsEvent('https://admitfolio.com/', adminStorage), false);
assert.equal(policy.shouldSendAnalyticsEvent('https://admitfolio.com/ADMIN/payout-sandbox'), false);

const controlledStorage = memoryStorage();
assert.equal(policy.shouldSendAnalyticsEvent('https://admitfolio.com/?internal=1', controlledStorage), false);
assert.equal(policy.shouldSendAnalyticsEvent('https://admitfolio.com/', controlledStorage), false);
assert.equal(policy.shouldSendAnalyticsEvent('https://admitfolio.com/?internal=0', controlledStorage), false);
assert.equal(policy.shouldSendAnalyticsEvent('https://admitfolio.com/', controlledStorage), true);

const brokenStorage = {
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
  removeItem() { throw new Error('blocked'); },
};
assert.equal(policy.shouldSendAnalyticsEvent('https://admitfolio.com/', brokenStorage), true);
assert.equal(policy.shouldSendAnalyticsEvent('https://admitfolio.com/admin', brokenStorage), false);

assert.deepEqual(Object.values(ANALYTICS_EVENTS), [
  'Browse Opened',
  'Listing Viewed',
  'Checkout Started',
  'Purchase Completed',
  'Match Search',
  'Seller Signup Started',
  'Seller Email Verified',
  'Seller Listing Submitted',
]);
assert.equal(new Set(Object.values(ANALYTICS_EVENTS)).size, Object.keys(ANALYTICS_EVENTS).length);

console.log('analytics policy tests passed');
