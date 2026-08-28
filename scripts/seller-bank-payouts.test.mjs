import assert from 'node:assert/strict';
import fs from 'node:fs';
import Stripe from 'stripe';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/sellerBankPayoutCore.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const payout = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

for (const type of ['payout.created', 'payout.updated', 'payout.paid', 'payout.failed']) {
  assert.equal(payout.isBankPayoutEvent(type), true);
}
assert.equal(payout.isBankPayoutEvent('transfer.created'), false);

const earlier = new Date('2026-08-20T12:00:00.000Z');
const later = new Date('2026-08-20T12:01:00.000Z');
assert.equal(payout.shouldApplyBankPayoutEvent({
  currentStatus: 'pending',
  currentEventCreatedAt: earlier,
  currentEventId: 'evt_1',
  incomingStatus: 'in_transit',
  incomingEventCreatedAt: later,
  incomingEventId: 'evt_2',
}), true);
assert.equal(payout.shouldApplyBankPayoutEvent({
  currentStatus: 'paid',
  currentEventCreatedAt: later,
  currentEventId: 'evt_paid',
  incomingStatus: 'pending',
  incomingEventCreatedAt: earlier,
  incomingEventId: 'evt_pending',
}), false);
assert.equal(payout.shouldApplyBankPayoutEvent({
  currentStatus: 'paid',
  currentEventCreatedAt: later,
  currentEventId: 'evt_paid',
  incomingStatus: 'in_transit',
  incomingEventCreatedAt: new Date('2026-08-20T12:02:00.000Z'),
  incomingEventId: 'evt_late',
}), false);
assert.equal(payout.shouldApplyBankPayoutEvent({
  currentStatus: 'pending',
  currentEventCreatedAt: earlier,
  currentEventId: 'evt_same',
  incomingStatus: 'pending',
  incomingEventCreatedAt: earlier,
  incomingEventId: 'evt_same',
}), false);

const summary = payout.summarizeBankPayouts([
  {
    id: 'po_latest', amountCents: 10_200, currency: 'usd', status: 'in_transit',
    arrivalDate: new Date('2026-08-26T00:00:00.000Z'), failureCode: null,
    stripeCreatedAt: later,
  },
  {
    id: 'po_paid', amountCents: 5_100, currency: 'usd', status: 'paid',
    arrivalDate: new Date('2026-08-19T00:00:00.000Z'), failureCode: null,
    stripeCreatedAt: earlier,
  },
  {
    id: 'po_failed', amountCents: 2_000, currency: 'usd', status: 'failed',
    arrivalDate: null, failureCode: 'account_closed', stripeCreatedAt: earlier,
  },
]);
assert.equal(summary.paidCents, 5_100);
assert.equal(summary.inTransitCents, 10_200);
assert.equal(summary.failedCents, 2_000);
assert.equal(summary.latest.id, 'po_latest');
assert.match(payout.safeBankPayoutFailureMessage('account_closed'), /bank account details/i);
assert.doesNotMatch(payout.safeBankPayoutFailureMessage('unknown_private_reason'), /unknown_private_reason/);

const stripe = new Stripe('sk_test_webhook_verification_only', {
  apiVersion: '2026-07-29.dahlia',
});
const secret = 'whsec_connected_payout_test';
const payload = JSON.stringify({
  id: 'evt_payout_paid',
  object: 'event',
  account: 'acct_connected',
  created: 1_777_000_000,
  livemode: true,
  type: 'payout.paid',
  data: {
    object: {
      id: 'po_123', object: 'payout', amount: 10_200, currency: 'usd',
      automatic: true, status: 'paid', arrival_date: 1_777_000_000,
      created: 1_776_900_000, failure_code: null,
    },
  },
});
const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
const event = stripe.webhooks.constructEvent(payload, header, secret);
assert.equal(event.type, 'payout.paid');
assert.equal(event.account, 'acct_connected');
assert.equal(event.data.object.id, 'po_123');
assert.throws(() => stripe.webhooks.constructEvent(`${payload} `, header, secret), /signature/i);

console.log('seller bank payout tests passed');
