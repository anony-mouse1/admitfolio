import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/sellerDashboardCore.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const dashboard = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

assert.equal(dashboard.payoutAccountState('not_eligible'), 'no_sales');
assert.equal(dashboard.payoutAccountState('setup_required'), 'setup_needed');
assert.equal(dashboard.payoutAccountState('in_review'), 'stripe_review');
assert.equal(dashboard.payoutAccountState('ready'), 'ready');

assert.equal(dashboard.maskedConnectedAccount(null), null);
assert.equal(dashboard.maskedConnectedAccount('acct_123456789'), 'acct_...6789');
assert.match(dashboard.safePayoutErrorMessage('insufficient available balance'), /not available yet/i);
assert.match(dashboard.safePayoutErrorMessage('connected account requirements are due'), /reviewing/i);
assert.match(dashboard.safePayoutErrorMessage('source charge is not ready'), /original Stripe charge/i);
assert.match(dashboard.safePayoutErrorMessage('request req_secret exploded'), /server logs/i);
assert.doesNotMatch(dashboard.safePayoutErrorMessage('request req_secret exploded'), /req_secret/);

assert.deepEqual(dashboard.buildAdminPayoutSummary({
  status: 'setup_required',
  stripeAccountId: null,
  pendingCents: 11_040,
  paidCents: 0,
}), {
  accountState: 'setup_needed',
  connectedAccount: null,
  pendingCents: 11_040,
  transferredCents: 0,
  latestSafeError: null,
});

assert.deepEqual(dashboard.summarizeSellerAccounting([
  {
    grossAmountCents: 18_400,
    platformFeeCents: 7_360,
    stripeProcessingFeeCents: 0,
    sellerEarningsCents: 11_040,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
  },
  {
    grossAmountCents: 18_400,
    platformFeeCents: 7_360,
    stripeProcessingFeeCents: 840,
    sellerEarningsCents: 10_200,
    createdAt: new Date('2026-08-20T00:00:00.000Z'),
  },
], new Date('2026-08-01T00:00:00.000Z')), {
  allTimeGrossCents: 36_800,
  allTimeSellerEarningsCents: 21_240,
  allTimePlatformFeeCents: 14_720,
  allTimeStripeProcessingFeeCents: 840,
  monthGrossCents: 18_400,
  monthSellerEarningsCents: 10_200,
  monthPlatformFeeCents: 7_360,
  monthStripeProcessingFeeCents: 840,
});

console.log('seller dashboard core tests passed');
