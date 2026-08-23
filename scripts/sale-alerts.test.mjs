import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const configSource = await readFile(new URL('../lib/config.ts', import.meta.url), 'utf8');
const emailSource = await readFile(new URL('../lib/email.ts', import.meta.url), 'utf8');
const webhookSource = await readFile(
  new URL('../app/api/stripe-webhook/route.ts', import.meta.url),
  'utf8',
);

assert.match(configSource, /export const SALE_NOTIFY_EMAILS/);
assert.match(
  configSource,
  /process\.env\.SALE_NOTIFY_EMAILS \|\| 'hello@admitfolio\.com'/,
  'sale alerts should default to the confirmed support inbox',
);

const adminSaleStart = emailSource.indexOf('export async function sendAdminSaleNotification');
const adminSaleEnd = emailSource.indexOf('// Tells the admin(s)', adminSaleStart);
assert.ok(adminSaleStart >= 0 && adminSaleEnd > adminSaleStart, 'owner sale email function should exist');
const adminSaleSource = emailSource.slice(adminSaleStart, adminSaleEnd);
assert.doesNotMatch(adminSaleSource, /buyerEmail|sellerEmail/, 'owner email must omit buyer and seller contact details');
assert.match(adminSaleSource, /America\/Los_Angeles/, 'owner email should show the Pacific sale timestamp');
assert.match(adminSaleSource, /admin-sale\/\$\{purchaseId\}\/\$\{index\}/, 'owner email should be idempotent');

assert.doesNotMatch(
  webhookSource,
  /if \(!delivery\.alreadyFulfilled\) \{\s*try \{\s*await track\(ANALYTICS_EVENTS\.purchaseCompleted/s,
  'conversion tracking must not be gated on first buyer delivery',
);
const accountingIndex = webhookSource.indexOf('accounting = purchaseAccounting(purchase)');
const finalizedGateIndex = webhookSource.indexOf('if (!purchase.sellerNotifiedAt)', accountingIndex);
const trackIndex = webhookSource.indexOf('await track(ANALYTICS_EVENTS.purchaseCompleted', finalizedGateIndex);
const ownerAlertIndex = webhookSource.indexOf('await sendAdminSaleNotification', finalizedGateIndex);
assert.ok(accountingIndex >= 0, 'final accounting should be calculated');
assert.ok(finalizedGateIndex > accountingIndex, 'finalized notification gate should follow accounting');
assert.ok(trackIndex > finalizedGateIndex, 'Purchase Completed should be tracked in the finalized gate');
assert.ok(ownerAlertIndex > trackIndex, 'owner alert should follow finalized conversion tracking');

console.log('sale alert and conversion timing tests passed');
