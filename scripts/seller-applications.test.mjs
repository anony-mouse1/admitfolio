import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../app/api/seller/applications/route.ts', import.meta.url), 'utf8');
assert.match(route, /authenticatedSeller\(\)/, 'shared application updates require seller auth');
assert.match(route, /where:\s*\{ sellerId:\s*seller\.id \}/, 'application lookup must be seller-owned');
assert.match(route, /matchesSellerApplication/, 'application updates must use the same legacy fallback as the dashboard');
assert.match(route, /updateMany/, 'one shared outcome update must reach every related listing');
assert.match(route, /sellerId:\s*seller\.id/, 'updates must remain seller-scoped');

const view = fs.readFileSync(new URL('../lib/sellerDashboardView.ts', import.meta.url), 'utf8');
assert.match(view, /applicationsByKey/, 'dashboard must group listings beneath shared applications');
assert.match(view, /proofBySchool/, 'application verification must come from the related school proof');
assert.match(view, /sellerApplicationSchool/, 'dashboard grouping must share its application-school resolver with mutations');

const proofsRoute = fs.readFileSync(new URL('../app/api/seller/proofs/route.ts', import.meta.url), 'utf8');
assert.match(proofsRoute, /export async function POST/, 'a seller must be able to start verification for a legacy application');
assert.match(proofsRoute, /sellerId_schoolKey/, 'starting verification must reuse the seller school proof');
assert.match(proofsRoute, /matchesSellerApplication/, 'proof creation must be limited to an application owned by the seller');

const workspace = fs.readFileSync(new URL('../components/seller/SellerApplicationsWorkspace.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(workspace, /seller-start-verification/, 'the seller application workspace must not expose a verification action');
assert.doesNotMatch(workspace, /onStartVerification/, 'the seller application workspace must not depend on the verification component');

const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(page, /id="seller-verification"/, 'the seller dashboard must not render the admission verification component');

console.log('seller applications workspace checks passed');
