import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/stripeFeeCore.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const fees = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

const charge = {
  id: 'ch_future_sale',
  paid: true,
  amount: 18_400,
  currency: 'usd',
  balance_transaction: {
    id: 'txn_future_sale',
    amount: 18_400,
    currency: 'usd',
    fee: 840,
  },
};

assert.deepEqual(fees.stripeFeeSnapshotFromCharge(charge, 18_400, 'usd'), {
  status: 'ready',
  chargeId: 'ch_future_sale',
  feeCents: 840,
});
assert.deepEqual(fees.stripeFeeSnapshotFromCharge({
  ...charge,
  balance_transaction: null,
}, 18_400, 'usd'), {
  status: 'pending',
  chargeId: 'ch_future_sale',
  reason: 'Stripe balance transaction fee is not available yet.',
});
assert.deepEqual(fees.stripeFeeSnapshotFromCharge(null, 18_400, 'usd'), {
  status: 'pending',
  chargeId: null,
  reason: 'Stripe charge is not available yet.',
});
assert.throws(
  () => fees.stripeFeeSnapshotFromCharge({ ...charge, amount: 18_399 }, 18_400, 'usd'),
  /does not match/i,
);
assert.throws(
  () => fees.stripeFeeSnapshotFromCharge({
    ...charge,
    balance_transaction: { ...charge.balance_transaction, fee: -1 },
  }, 18_400, 'usd'),
  /does not match/i,
);

const webhookSource = fs.readFileSync(new URL('../app/api/stripe-webhook/route.ts', import.meta.url), 'utf8');
const deliveryIndex = webhookSource.indexOf('delivery = await fulfillPurchase');
const feeLookupIndex = webhookSource.indexOf('feeSnapshot = await retrieveStripeFeeSnapshot');
assert.ok(deliveryIndex >= 0 && feeLookupIndex > deliveryIndex, 'buyer delivery must happen before fee retry');
assert.match(
  webhookSource,
  /updateMany\([\s\S]*?sellerEarningsCents: null,[\s\S]*?stripeProcessingFeeCents: null/,
  'duplicate webhooks must only finalize a still-pending snapshot',
);
const payoutSource = fs.readFileSync(new URL('../lib/sellerPayouts.ts', import.meta.url), 'utf8');
assert.match(
  payoutSource,
  /sellerEarningsCents: \{ not: null \}/,
  'transfers must exclude fee-pending purchases',
);

console.log('Stripe fee snapshot tests passed');
