import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/sellerPayoutsCore.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

assert.equal(mod.isLivePurchase('cs_live_real'), true);
assert.equal(mod.isLivePurchase('cs_test_fake'), false);
assert.equal(mod.isLivePurchase(null), false);

assert.equal(mod.connectedAccountStatus({
  liveSaleCount: 0,
  stripeAccountId: null,
  onboardingComplete: false,
  payoutsEnabled: false,
}), 'not_eligible');
assert.equal(mod.connectedAccountStatus({
  liveSaleCount: 1,
  stripeAccountId: null,
  onboardingComplete: false,
  payoutsEnabled: false,
}), 'setup_required');
assert.equal(mod.connectedAccountStatus({
  liveSaleCount: 1,
  stripeAccountId: 'acct_123',
  onboardingComplete: false,
  payoutsEnabled: false,
}), 'in_review');
assert.equal(mod.connectedAccountStatus({
  liveSaleCount: 1,
  stripeAccountId: 'acct_123',
  onboardingComplete: true,
  payoutsEnabled: true,
}), 'ready');

assert.equal(mod.connectedAccountReady({
  id: 'acct_123',
  details_submitted: true,
  payouts_enabled: true,
  capabilities: { transfers: 'active' },
}), true);
assert.equal(mod.connectedAccountReady({
  id: 'acct_123',
  details_submitted: true,
  payouts_enabled: false,
  capabilities: { transfers: 'active' },
}), false);
assert.equal(mod.transferIdempotencyKey('purchase_1'), 'admitfolio-seller-transfer-purchase_1');
assert.equal(
  mod.transferReversalIdempotencyKey('purchase_1', 2700),
  'admitfolio-seller-reversal-purchase_1-2700',
);
assert.equal(mod.sellerReversalTargetCents({
  affectedGrossCents: 4500,
  grossAmountCents: 4500,
  sellerEarningsCents: 2700,
  sellerShareBps: 6000,
}), 2700);
assert.equal(mod.sellerReversalTargetCents({
  affectedGrossCents: 1000,
  grossAmountCents: 4500,
  sellerEarningsCents: 2700,
  sellerShareBps: 6000,
}), 600);
assert.equal(mod.sellerReversalTargetCents({
  affectedGrossCents: 9000,
  grossAmountCents: 4500,
  sellerEarningsCents: 2700,
  sellerShareBps: 6000,
}), 2700);

console.log('seller payout core tests passed');
