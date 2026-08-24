import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../app/api/seller/applications/route.ts', import.meta.url), 'utf8');
assert.match(route, /authenticatedSeller\(\)/, 'shared application updates require seller auth');
assert.match(route, /where:\s*\{ sellerId:\s*seller\.id \}/, 'application lookup must be seller-owned');
assert.match(route, /sameSchool\(target, school\)/, 'school identity must use the canonical resolver');
assert.match(route, /updateMany/, 'one shared outcome update must reach every related listing');
assert.match(route, /sellerId:\s*seller\.id/, 'updates must remain seller-scoped');

const view = fs.readFileSync(new URL('../lib/sellerDashboardView.ts', import.meta.url), 'utf8');
assert.match(view, /applicationsByKey/, 'dashboard must group listings beneath shared applications');
assert.match(view, /proofBySchool/, 'application verification must come from the related school proof');

console.log('seller applications workspace checks passed');
