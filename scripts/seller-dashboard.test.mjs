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

console.log('seller dashboard core tests passed');
