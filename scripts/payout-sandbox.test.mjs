import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/payoutSandboxCore.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

assert.equal(mod.PAYOUT_SANDBOX_GROSS_CENTS, 18_400);
assert.equal(mod.PAYOUT_SANDBOX_SELLER_CENTS, 11_040);
assert.equal(mod.PAYOUT_SANDBOX_PLATFORM_CENTS, 7_360);

assert.deepEqual(mod.sandboxAccountStatus(null), {
  status: 'setup_required',
  transfers: 'not_requested',
  payouts: 'not_requested',
});
assert.deepEqual(mod.sandboxAccountStatus({
  livemode: false,
  configuration: {
    recipient: {
      capabilities: {
        stripe_balance: {
          stripe_transfers: { status: 'pending' },
          payouts: { status: 'pending' },
        },
      },
    },
  },
}), {
  status: 'verification_in_progress',
  transfers: 'pending',
  payouts: 'pending',
});
assert.deepEqual(mod.sandboxAccountStatus({
  livemode: false,
  configuration: {
    recipient: {
      capabilities: {
        stripe_balance: {
          stripe_transfers: { status: 'active' },
          payouts: { status: 'pending' },
        },
      },
    },
  },
}), {
  status: 'verification_in_progress',
  transfers: 'active',
  payouts: 'pending',
});
assert.equal(mod.sandboxAccountStatus({
  livemode: false,
  configuration: {
    recipient: {
      capabilities: {
        stripe_balance: {
          stripe_transfers: { status: 'active' },
          payouts: { status: 'active' },
        },
      },
    },
  },
}).status, 'ready');
assert.throws(() => mod.sandboxAccountStatus({ livemode: true }), /cannot use a live Stripe account/);

const sessionId = 'b4f0efbe-c1df-4e88-8a19-410b898a2d92';
assert.equal(
  mod.sandboxIdempotencyKey(sessionId, 'transfer'),
  `admitfolio-payout-sandbox-transfer-${sessionId}`,
);
assert.throws(() => mod.sandboxIdempotencyKey('unsafe', 'sale'), /Invalid payout sandbox session/);

console.log('payout sandbox core tests passed');
